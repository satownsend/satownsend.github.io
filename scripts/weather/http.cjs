'use strict';
const {createSign}=require('node:crypto');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Never expose response bodies: OAuth and Sheets errors can contain sensitive details.
async function requestJson(url,options={}, {fetchImpl=fetch,wait=sleep,attempts=3}={}){
  const safeToRetry=!options.method || options.method==='GET';
  for(let attempt=0;attempt<(safeToRetry?attempts:1);attempt++){
    let retry=false;
    try {
      const r=await fetchImpl(url,{...options,signal:AbortSignal.timeout(20000)});
      if(r.ok)return await r.json();
      retry=r.status===429 || r.status>=500;
      if(!retry || attempt===attempts-1 || !safeToRetry)throw new Error(`HTTP ${r.status}`);
    } catch(e){
      if(!safeToRetry || attempt===attempts-1 || /^HTTP (?!429|5\d\d)/.test(e.message))throw e;
      retry=true;
    }
    if(retry)await wait(1000*2**attempt);
  }
}
async function serviceToken(credentials,request=requestJson,now=Date.now()){
  if(credentials.type!=='service_account' || !credentials.client_email || !credentials.private_key)throw new Error('Invalid Google service account configuration');
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const header=encode({alg:'RS256',typ:'JWT'});
  const claims=encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600});
  const data=`${header}.${claims}`;
  const assertion=`${data}.${createSign('RSA-SHA256').update(data).end().sign(credentials.private_key).toString('base64url')}`;
  const r=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()});
  if(!r.access_token)throw new Error('Google token exchange failed');
  return r.access_token;
}
class Sheets {
  constructor(sheetId,token,request=requestJson){this.base=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;this.token=token;this.request=request;}
  call(path,options={}){return this.request(this.base+path,{...options,headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...options.headers}});}
  async ensure(){
    const data=await this.call('?fields=sheets.properties(title)');
    const names=new Set((data.sheets||[]).map(s=>s.properties.title));
    for(const title of ['weather_history','weather_collector']){
      if(names.has(title))continue;
      try {await this.call(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title}}}]})});}
      catch(e){ // A browser may have created the history tab concurrently.
        const check=await this.call('?fields=sheets.properties(title)');
        if(!check.sheets?.some(s=>s.properties.title===title))throw e;
      }
    }
  }
  async rows(){return (await this.call('/values/weather_history')).values||[];}
  seed(header){return this.call('/values/weather_history!A1?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[header]})});}
  append(rows){return this.call('/values/weather_history!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:rows})});}
  async readStatus(){
    const rows=(await this.call('/values/weather_collector!A1:B2')).values||[];
    if(!rows.length)return null;
    if(rows[0][0]!=='collector' || rows[0][1]!=='status_json')throw new Error('Unexpected weather_collector columns');
    if(!rows[1]?.[1])return null;
    return JSON.parse(rows[1][1]);
  }
  writeStatus(status){return this.call('/values/weather_collector!A1?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[['collector','status_json'],['github-actions',JSON.stringify(status)]]})});}
}
module.exports={requestJson,serviceToken,Sheets};
