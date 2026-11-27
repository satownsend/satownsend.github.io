const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = '936411146633-16fq9oc08auslfprvgbl9bpoafbvo9uk.apps.googleusercontent.com';
const source = fs.readFileSync('chatbot-worker/src/index.js','utf8')
  .replace(/^(?:import .*|export \{ .* \} from .*);\n/gm,'')
  .replace('export default {','globalThis.worker = {');
const moduleSource = fs.readFileSync('chatbot-worker/src/cat-medical.js','utf8').replace(/^export /gm,'');
const data = new Map();
const storage = {
  get: async key => data.get(key),
  put: async (key,value) => data.set(key,value),
  delete: async keys => [].concat(keys).forEach(key => data.delete(key)),
  list: async ({prefix}) => new Map([...data].filter(([key]) => key.startsWith(prefix))),
  transaction: async run => run(storage),
};
let calls = 0;
const ctx = {
  Request,Response,URL,Blob,FormData,crypto,
  fetch: async url => {
    const token = new URL(url).searchParams.get('access_token');
    return Response.json({aud:client,sub:token,expires_in:3600});
  },
};
vm.createContext(ctx);
vm.runInContext(moduleSource+'\nglobalThis.store = CatMedicalStore;',ctx);
vm.runInContext(source,ctx);
const store = new ctx.store({storage});
const env = {
  ALLOWED_GOOGLE_SUBJECTS:'owner',
  CAT_MEDICAL:{idFromName:name=>name,get:()=>({fetch:request=>{calls++;return store.fetch(request);}})},
};
const records = '/cat-medical/records';
const id = '89a2a156-7f7f-4a7f-839a-d31b528ec022';
const record = records + '/' + id;
const doc = record + '/document';
function send(path, token, method = 'GET', body, origin = 'https://satownsend.com', bindings = env){
  const headers = {Origin:origin};
  if(token) headers.Authorization = 'Bearer ' + token;
  return ctx.worker.fetch(new Request('https://worker.example' + path,{method,headers,body}),bindings);
}
function form(version = '', extra = {}){
  const result = new FormData();
  for(const [key,value] of Object.entries({
    cat:'Clovis',type:'Prescription diet',date:'2025-04-23',title:'Synthetic diet',notes:'Synthetic note',
    feedingReminder:'on',version,...extra,
  })) result.set(key,value);
  return result;
}
(async()=>{
  for(const token of ['', 'different-account']){
    for(const [path,method,body] of [[records,'GET'],[doc,'GET'],[record,'PUT',form()],[record,'DELETE']]){
      const denied = await send(path,token,method,body);
      assert.equal(denied.status,401);
      assert.match(denied.headers.get('Cache-Control'),/no-store/);
    }
  }
  assert.equal((await send(records,'owner','GET',undefined,'https://other.example')).status,403);
  assert.equal((await send(records,'owner','GET',undefined,'http://localhost:8090')).status,403);
  assert.equal((await send(records,'owner','GET',undefined,undefined,{CAT_MEDICAL:env.CAT_MEDICAL})).status,503);
  assert.equal(calls,0,'unauthorized requests must never touch private storage');
  assert.equal((await send(records,'','OPTIONS')).status,204);
  assert.equal(calls,0);
  assert.equal((await send(record,'owner','PUT',form('',{date:'2025-02-30'}))).status,400);
  const invalidFile = form();
  invalidFile.set('document',new Blob(['bad'],{type:'text/html'}),'bad.html');
  assert.equal((await send(record,'owner','PUT',invalidFile)).status,400);

  const upload = form();
  upload.set('document',new Blob(['synthetic file'],{type:'application/pdf'}),'private-original.pdf');
  const created = await send(record,'owner','PUT',upload);
  assert.equal(created.status,201);
  const {record:saved} = await created.json();
  assert.equal(saved.feedingReminder,true);
  const listing = await send(records,'owner');
  assert.deepEqual((await listing.json()).records,[saved]);
  const download = await send(doc,'owner');
  assert.equal(await download.text(),'synthetic file');
  assert.equal(download.headers.get('Content-Type'),'application/octet-stream');
  assert.match(download.headers.get('Content-Disposition'),/attachment; filename="vet-document.pdf"/);
  assert.match(download.headers.get('Cache-Control'),/no-store/);
  assert.equal((await send(doc,'different-account')).status,401);
  assert.equal((await send(doc,'')).status,401);
  assert.equal((await send(record,'owner','PUT',form('wrong'))).status,409);
  const changed = await send(record,'owner','PUT',form(saved.version,{title:'Synthetic update'}));
  assert.equal(changed.status,200);
  const {record:edited} = await changed.json();
  assert.equal(edited.hasDocument,true);
  assert.equal(await (await send(doc,'owner')).text(),'synthetic file');
  const publicInfo = await (await send('/','')).text();
  assert.doesNotMatch(publicInfo,/Synthetic|cat-medical/);
  assert.equal((await send(record+'?version='+edited.version,'owner','DELETE')).status,200);
  assert.equal((await send(doc,'owner')).status,404);
  assert.deepEqual((await (await send(records,'owner')).json()).records,[]);
  assert.equal(data.size,0);
  console.log('Private records and documents require owner authorization; validation, reminders, edits and deletion passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
