const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const authSource = fs.readFileSync('shared/gauth.js', 'utf8');
function storage(){ const data = new Map(); return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}; }
function browser(){
  const localStorage=storage(), sessionStorage=storage();
  const location={origin:'https://satownsend.com',pathname:'/plants/',search:'?view=care',hash:'',href:''};
  const context={window:{},localStorage,sessionStorage,location,URLSearchParams,crypto:webcrypto,Uint8Array,Date,
    history:{replaceState(a,b,url){ assert.equal(url,'/plants/?view=care'); location.hash=''; }}};
  vm.runInNewContext(authSource,context);
  const auth=context.window.GAuth;
  function begin(){ auth.signIn(); return new URL(location.href).searchParams.get('state'); }
  function callback(state,extra={}){ location.hash='#'+new URLSearchParams({access_token:'test-token',expires_in:'3600',token_type:'Bearer',...(state?{state}:{}),...extra}); return auth.handleReturn(); }
  return {auth,begin,callback,localStorage,sessionStorage,location};
}
let b=browser();assert.equal(b.auth.handleReturn(),'none');assert.equal(b.callback(),'error');assert.equal(b.auth.token(),null);assert.equal(b.location.hash,'');
b=browser();let state=b.begin();assert.match(state,/^[a-f0-9]{64}$/);assert.equal(b.callback(state),'signed-in');assert.equal(b.auth.token(),'test-token');assert.equal(b.callback(state),'error');
for(const extra of [{expires_in:'0'},{expires_in:'Infinity'},{token_type:'other'}]){b=browser();state=b.begin();assert.equal(b.callback(state,extra),'error');assert.equal(b.auth.token(),null);}
b=browser();state=b.begin();assert.equal(b.callback('wrong'),'error');assert.equal(b.callback(state),'error');
for(const change of [{created:Date.now()-11*60*1000},{path:'/beer/'},{created:Date.now()+60000}]){
  b=browser();state=b.begin();let pending=JSON.parse(b.sessionStorage.getItem('satownsend.gsOAuthState'));
  b.sessionStorage.setItem('satownsend.gsOAuthState',JSON.stringify({...pending,...change}));assert.equal(b.callback(state),'error');
}
b=browser();state=b.begin();b.auth.signOut();assert.equal(b.callback(state),'error');
b=browser();b.localStorage.setItem('satownsend.gsToken',JSON.stringify({access_token:'expired',expires_at:1}));assert.equal(b.auth.trySilent(),true);state=new URL(b.location.href).searchParams.get('state');assert.equal(b.callback(state),'signed-in');
b=browser();state=b.begin();b.location.hash='#'+new URLSearchParams({error:'access_denied',state});assert.equal(b.auth.handleReturn(),'error');assert.equal(b.sessionStorage.getItem('satownsend.gsOAuthState'),null);
b=browser();state=b.begin();b.sessionStorage.removeItem=()=>{throw Error('storage blocked')};assert.equal(b.callback(state),'error');assert.equal(b.auth.token(),null);
b=browser();b.sessionStorage.setItem=()=>{throw Error('storage blocked')};assert.throws(()=>b.begin(),/storage blocked/);assert.equal(b.location.href,'');

// Exercise the actual Worker request handler with mocked Google and no model/data access.
const workerSource=fs.readFileSync('chatbot-worker/src/index.js','utf8').replace(/^import .*;\n/gm,'').replace('export default {','globalThis.worker = {');
const client='936411146633-16fq9oc08auslfprvgbl9bpoafbvo9uk.apps.googleusercontent.com';
let info, calls=0, fail=false;
const ctx={Response,Request,URL,console,fetch:async url=>{
  calls++; assert.ok(url.startsWith('https://oauth2.googleapis.com/tokeninfo?access_token='));
  if(fail)throw Error('offline');return {ok:true,json:async()=>info};
}};
vm.createContext(ctx);vm.runInContext(workerSource,ctx);
const request=()=>new Request('https://worker.example/',{method:'POST',headers:{Authorization:'Bearer test-token'},body:JSON.stringify({messages:[]})});
(async()=>{
  assert.equal((await ctx.worker.fetch(request(),{})).status,503);assert.equal(calls,0);
  const env={ALLOWED_GOOGLE_SUBJECTS:'owner'};
  const valid={aud:client,azp:client,sub:'owner',expires_in:'3600'};
  for(const changes of [{sub:'other'},{sub:undefined},{aud:'other'},{azp:'other'},{expires_in:'0'},{expires_in:undefined},{expires_in:'Infinity'}]){
    info={...valid,...changes};assert.equal((await ctx.worker.fetch(request(),env)).status,401);
  }
  fail=true;assert.equal((await ctx.worker.fetch(request(),env)).status,401);fail=false;
  info=valid;const result=await ctx.worker.fetch(request(),env);
  // Empty messages reaches validation only after the owner gate succeeds.
  assert.equal((await result.json()).error,'No question provided');
  const before=calls;assert.equal((await ctx.worker.fetch(new Request('https://worker.example/',{method:'POST'}),env)).status,401);assert.equal(calls,before);
  assert.equal((await ctx.worker.fetch(new Request('https://worker.example/'),{})).status,200);
  console.log('Security auth regression checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
