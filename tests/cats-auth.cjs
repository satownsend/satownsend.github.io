const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('shared/gauth.js','utf8');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function setup(path='/cats/',expired=false){
  const localStorage=storage(),sessionStorage=storage();
  if(expired)localStorage.setItem('satownsend.gsToken',JSON.stringify({access_token:'old',expires_at:1}));
  const location={origin:'https://satownsend.com',pathname:path,search:'?sort=old',hash:'#photos',href:'',replace(url){this.returned=url;}};
  const ctx={window:{},location,localStorage,sessionStorage,crypto:webcrypto,Uint8Array,URLSearchParams,Date,history:{replaceState(){location.hash='';}}};
  vm.runInNewContext(source,ctx);return {...ctx,auth:ctx.window.GAuth};
}
for(const silent of [false,true]){
 const b=setup('/cats/',silent);silent?assert.equal(b.auth.trySilent(),true):b.auth.signIn();
 const params=new URL(b.location.href).searchParams;assert.equal(params.get('redirect_uri'),'https://satownsend.com/photography/');
 b.location.pathname='/photography/';b.location.search='';b.location.hash='#'+new URLSearchParams({state:params.get('state'),access_token:'fixture',expires_in:3600,token_type:'Bearer'});
 assert.equal(b.auth.handleReturn(),'signed-in');assert.equal(b.auth.token(),'fixture');assert.equal(b.location.returned,'/cats/?sort=old#photos');
 assert.equal(b.auth.handleReturn(),'none');
}
for(const invalid of ['wrong-state','wrong-path','expired']){
 const b=setup();b.auth.signIn();const params=new URL(b.location.href).searchParams;
 b.location.pathname=invalid==='wrong-path'?'/cats/':'/photography/';
 if(invalid==='expired'){const p=JSON.parse(b.sessionStorage.getItem('satownsend.gsOAuthState'));p.created=1;b.sessionStorage.setItem('satownsend.gsOAuthState',JSON.stringify(p));}
 b.location.hash='#'+new URLSearchParams({state:invalid==='wrong-state'?'wrong':params.get('state'),access_token:'fixture',expires_in:3600,token_type:'Bearer'});
 assert.equal(b.auth.handleReturn(),'error');assert.equal(b.auth.token(),null);assert.equal(b.location.returned,undefined);
}
const b=setup('/plants/');b.auth.signIn();assert.equal(new URL(b.location.href).searchParams.get('redirect_uri'),'https://satownsend.com/plants/');
console.log('Cats interactive/silent callbacks, preserved view, invalid-state rejection, and existing dashboard redirect passed');
