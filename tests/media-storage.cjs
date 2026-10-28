const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const client='936411146633-16fq9oc08auslfprvgbl9bpoafbvo9uk.apps.googleusercontent.com';
// Stand-in for Cloudflare's byte-counting FixedLengthStream. The production
// Worker uses the platform implementation, never this test implementation.
class FixedLengthStream extends TransformStream {
 constructor(size){let count=0;super({transform(chunk,c){count+=chunk.byteLength;if(count>size)throw Error('too long');c.enqueue(chunk)},flush(){if(count!==size)throw Error('too short')}})}
}
const operations=[],objects=new Map();let identity={aud:client,sub:'owner',expires_in:'3600'},googleFails=false;
const bucket={
 async list(opts){operations.push(['list',opts]);return {objects:[...objects.keys()].filter(k=>k.startsWith(opts.prefix)).map(key=>({key})),truncated:false}},
 async put(key,body,opts){const bytes=await new Response(body).arrayBuffer();operations.push(['put',key,bytes.byteLength,opts]);objects.set(key,{body:bytes,size:bytes.byteLength});return {key}},
 async delete(keys){operations.push(['delete',keys]);for(const key of keys)objects.delete(key)},
 async get(key){operations.push(['get',key]);return objects.get(key)||null},
 async head(key){operations.push(['head',key]);return objects.get(key)||null}
};
const env={ALLOWED_GOOGLE_SUBJECTS:'owner',WEATHER_ARCHIVE:bucket};
const ctx={Response,Request,URL,FixedLengthStream,AbortController,console,fetch:async()=>{if(googleFails)throw Error('network');return {ok:true,json:async()=>identity}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('chatbot-worker/src/media.js','utf8').replace(/^export /gm,''),ctx);
vm.runInContext(fs.readFileSync('chatbot-worker/src/index.js','utf8').replace(/^import .*;\n/gm,'').replace('export default {','globalThis.worker = {'),ctx);
function req(path='object',method='GET',key='photos/maple/a.jpg',extra={}){
 const url=new URL('https://worker.example/media/'+path);if(key!==null)url.searchParams.set('key',key);
 const headers={Authorization:'Bearer test',Origin:'https://satownsend.com',...extra.headers};
 return new Request(url,{method,headers,...(extra.body===undefined?{}:{body:extra.body,duplex:'half'})});
}
async function status(r,code,e=env){const response=await ctx.worker.fetch(r,e);assert.equal(response.status,code,await response.clone().text());return response}
(async()=>{
 for(const method of ['GET','HEAD','PUT','DELETE']){
  const before=operations.length;await status(req('object',method,undefined,{headers:{Authorization:''}}),401);assert.equal(operations.length,before);
 }
 identity={aud:client,sub:'stranger',expires_in:'3600'};await status(req('list','GET',null),401);assert.equal(operations.length,0);
 identity={aud:client,sub:'owner',expires_in:'3600'};
 await status(req('status','GET',null),503,{WEATHER_ARCHIVE:bucket});
 await status(req('status','GET',null),503,{ALLOWED_GOOGLE_SUBJECTS:'owner'});
 await status(req('status','GET',null,{headers:{Origin:'https://evil.example'}}),403);
 googleFails=true;await status(req('status','GET',null),401);googleFails=false;
 const preflight=await status(req('object','OPTIONS'),204);assert.ok(preflight.headers.get('Access-Control-Allow-Methods').includes('PUT'));assert.equal(operations.length,0);
 await status(req('status','GET',null),200);
 for(const key of ['weather-archive/2025.json','photos/../other.jpg','photos/%2e%2e/foo.jpg','photos/x.svg','photos/x.html','/photos/x.jpg','photos//x.jpg','photos/x\\y.jpg','photos/x.mp4','photos/x.constructor','photos/x.__proto__'])await status(req('object','PUT',key),400);
 const before=operations.length;
 await status(req('object','PUT',undefined,{headers:{'Content-Type':'text/html','Content-Length':'1'},body:'a'}),415);
 for(const length of [undefined,'-1','abc'])await status(req('object','PUT',undefined,{headers:{'Content-Type':'image/jpeg',...(length?{'Content-Length':length}:{})},body:'a'}),411);
 for(const length of ['0',String(20*1024*1024+1)])await status(req('object','PUT',undefined,{headers:{'Content-Type':'image/jpeg','Content-Length':length},body:'a'}),413);
 assert.equal(operations.length,before);
 const upload=(key,type,body='abc',length=String(body.length))=>req('object','PUT',key,{headers:{'Content-Type':type,'Content-Length':length},body});
 for(const prefix of ['photos','beer-photos','instrument-photos','wildlife-photos','photography']){
  await status(upload(prefix+'/record/a.jpg','image/jpeg'),200);
  await status(upload(prefix+'/record/a.jpg.thumb.jpg','image/jpeg'),200);
 }
 await status(upload('wildlife-photos/record/a.mov','video/quicktime'),200);
 await status(upload('photography/trips/a.webm','video/webm'),200);
 await status(upload('photography/trips/a.mp4','video/mp4','a',String(90*1024*1024+1)),413);
 await status(upload('photos/short.jpg','image/jpeg','abc','4'),502);assert.equal(objects.has('photos/short.jpg'),false);
 await status(upload('photos/long.jpg','image/jpeg','abc','2'),502);assert.equal(objects.has('photos/long.jpg'),false);
 const read=await status(req('object','GET','photos/record/a.jpg'),200);assert.equal(await read.text(),'abc');assert.equal(read.headers.get('X-Content-Type-Options'),'nosniff');
 await status(req('object','HEAD','photos/record/a.jpg'),200);await status(req('object','GET','photos/missing.jpg'),404);
 await status(req('object','DELETE','photos/record/a.jpg'),200);assert.equal(objects.has('photos/record/a.jpg'),false);assert.equal(objects.has('photos/record/a.jpg.thumb.jpg'),false);
 await status(req('object','PATCH'),405);await status(req('unknown','GET',null),404);
 for(const prefix of ['', 'weather-archive/', 'photos/../'])await status(new Request('https://worker.example/media/list?'+new URLSearchParams({prefix}),{headers:{Authorization:'Bearer test'}}),400);
 const listed=await status(new Request('https://worker.example/media/list?prefix=wildlife-photos%2F&cursor=next-page',{headers:{Authorization:'Bearer test'}}),200);
 assert.ok((await listed.json()).keys.every(k=>k.startsWith('wildlife-photos/')));assert.equal(operations.at(-1)[1].cursor,'next-page');
 const broken={...bucket,list:async()=>{throw Error('sensitive provider error')}};
 const error=await status(req('status','GET',null),502,{...env,WEATHER_ARCHIVE:broken});assert.equal((await error.text()).includes('sensitive'),false);
 // Browser transport: token only goes to the fixed Worker endpoint; remove all
 // legacy keys, preserve other settings, and paginate across media namespaces.
 const removed=[],calls=[];let token='owner-token';
 const browser={window:{GAuth:{token:()=>token}},localStorage:{removeItem:k=>removed.push(k)},URLSearchParams,fetch:async(url,opts)=>{
  calls.push({url,opts});return new Response(JSON.stringify({keys:[],truncated:false,next:''}));
 }};
 vm.runInNewContext(fs.readFileSync('shared/media-storage.js','utf8'),browser);
 assert.equal(removed.length,5);assert.ok(removed.every(k=>k.endsWith('Dashboard.r2creds')));
 const media=browser.window.MediaStorage;await media.request({method:'PUT',key:'photos/a.jpg',body:new Uint8Array([1]),contentType:'image/jpeg'});
 assert.equal(calls[0].opts.headers.Authorization,'Bearer owner-token');assert.equal(calls[0].opts.redirect,'error');
 let cursor='';for(let i=0;i<5;i++){const r=await media.list('',cursor);cursor=r.next;assert.equal(r.truncated,i<4)}assert.equal(cursor,'');
 assert.deepEqual(calls.slice(1).map(c=>new URL(c.url).searchParams.get('prefix')),['photos/','beer-photos/','instrument-photos/','wildlife-photos/','photography/']);
 token=null;const n=calls.length;await assert.rejects(()=>media.check(),/Sign in/);assert.equal(calls.length,n);
 for(const section of ['plants','beer','instruments','wildlife','photography']){
  const html=fs.readFileSync(section+'/index.html','utf8');assert.ok(html.includes('/shared/media-storage.js'));
  assert.doesNotMatch(html,/sigv4|secretKey|accessKey|r2_vault_id|autoLoadR2Creds|r2KeyInput/);
 }
 console.log('PASS: media authorization, path/type/size limits, stream failures, upload/read/delete/list, credential cleanup and browser transport');
})().catch(e=>{console.error(e);process.exitCode=1});
