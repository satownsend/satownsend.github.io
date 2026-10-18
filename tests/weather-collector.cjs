'use strict';
const assert=require('node:assert/strict');
const {generateKeyPairSync,createVerify}=require('node:crypto');
const H=require('../shared/forecast-history.js');
const W=require('../shared/weather-data.js');
const {requestJson,serviceToken,Sheets}=require('../scripts/weather/http.cjs');
const {collect,coverage,validateConfig}=require('../scripts/weather/collector.cjs');
const config=require('../scripts/weather/config.json');
const now=Date.parse('2026-10-18T12:17:00Z');
const clone=x=>JSON.parse(JSON.stringify(x));
const daily={time:['2026-10-18'],temperature_2m_max:[58],temperature_2m_min:[30],precipitation_sum:[0.5],precipitation_probability_max:[60],wind_speed_10m_max:[28]};
const period=(day,temp)=>({startTime:'2026-10-18T12:00:00-04:00',isDaytime:day,temperature:temp,temperatureUnit:'F',probabilityOfPrecipitation:{value:null},windSpeed:'10 to 20 km/h'});
class FakeSheets {
  constructor(){this.data=[];this.status=null;this.appends=0;this.writes=0;this.ambiguous=false;this.failAppend=false;}
  async ensure(){}
  async readStatus(){return clone(this.status);}
  async rows(){return clone(this.data);}
  async seed(h){this.data=[clone(h)];}
  async append(rows){this.appends++;if(this.failAppend)throw Error('offline');this.data.push(...clone(rows));if(this.ambiguous){this.ambiguous=false;throw Error('connection lost after commit');}}
  async writeStatus(s){this.status=clone(s);this.writes++;}
}
function provider(mode='ok'){
  const calls=[];
  return {calls,request:async url=>{
    url=String(url);calls.push(url);
    if(url.includes('/points/')){
      if(['fallback','failed','partial'].includes(mode))throw Error('NWS unavailable');
      if(mode==='bad-host')return{properties:{forecast:'https://untrusted.invalid/forecast'}};
      return{properties:{forecast:'https://api.weather.gov/gridpoints/CTP/1,2/forecast'}};
    }
    if(url.includes('/gridpoints/'))return{properties:{periods:[period(true,58),period(false,30)]}};
    if(url.includes('/alerts/')){
      if(mode==='partial')throw Error('alerts offline');
      return{features:[]};
    }
    if(url.includes('archive-api')){
      if(mode==='partial')throw Error('archive offline');
      return{daily:{time:['2026-10-16','2026-10-17'],precipitation_sum:[0,null]}};
    }
    if(url.includes('api.open-meteo.com')){if(mode==='failed')throw Error('all weather offline');return{daily};}
    throw Error(`Unexpected endpoint ${url}`);
  }};
}
(async()=>{
  assert.throws(()=>validateConfig({...config,intervalHours:0}));
  assert.throws(()=>validateConfig({...config,location:{...config.location,lat:91}}));
  const normalized=W.nwsPeriodsToDaily([period(true,58),period(false,30)],'C');
  assert.ok(Math.abs(normalized.temperature_2m_max[0]-14.4444)<0.001);
  assert.equal(normalized.precipitation_probability_max[0],null);
  assert.ok(Math.abs(normalized.wind_speed_10m_max[0]-12.42742)<0.001);
  assert.deepEqual(W.rainfallFromDaily({time:['a','b'],precipitation_sum:[0,null]}),[{date:'a',amount:0},{date:'b',amount:null}]);
  let s=new FakeSheets(), p=provider();
  const first=await collect({config,sheets:s,request:p.request,now,pause:async()=>{}});
  assert.equal(first.state,'ok');assert.equal(first.coverage.missing,0);assert.equal(s.appends,1);
  let snapshot=H.fromRows(s.data)[0];
  assert.equal(snapshot.days[0].pcp,null);assert.equal(snapshot.rainfall.days[1].amount,null);assert.equal(snapshot.collection.kind,'scheduled');
  const previous=clone(s.data),count=p.calls.length;
  await collect({config,sheets:s,request:p.request,now:now+60000});
  assert.equal(s.appends,1);assert.equal(p.calls.length,count);assert.deepEqual(s.data,previous);
  // Repeating the job after an append succeeds but the response is lost must not duplicate it.
  s=new FakeSheets();s.ambiguous=true;p=provider();
  await collect({config,sheets:s,request:p.request,now,pause:async()=>{}});assert.equal(s.appends,1);assert.equal(H.fromRows(s.data).length,1);
  // A true write failure retains archive and success metadata, records failure, and can be retried.
  s=new FakeSheets();p=provider();await collect({config,sheets:s,request:p.request,now});const old=clone(s.data),success=s.status.lastSuccess;
  s.failAppend=true;await assert.rejects(()=>collect({config,sheets:s,request:p.request,now:now+3600000,pause:async()=>{}}));
  assert.deepEqual(s.data,old);assert.equal(s.status.state,'error');assert.equal(s.status.lastSuccess,success);assert.equal(s.status.coverage.missing,1);
  s.failAppend=false;await collect({config,sheets:s,request:p.request,now:now+3600000,pause:async()=>{}});assert.equal(H.fromRows(s.data).length,2);
  assert.equal(p.calls.filter(u=>u.includes('archive-api')).length,1); // reuse recent rainfall estimates
  s=new FakeSheets();p=provider('partial');const partial=await collect({config,sheets:s,request:p.request,now});
  snapshot=H.fromRows(s.data)[0];assert.equal(partial.state,'partial');assert.equal(snapshot.source,'open-meteo');assert.equal(snapshot.alertsAvailable,false);assert.equal(snapshot.rainfall.days.length,0);assert.equal(snapshot.days[0].pcp,0.5);
  s=new FakeSheets();p=provider('failed');await assert.rejects(()=>collect({config,sheets:s,request:p.request,now}));assert.equal(s.appends,0);assert.equal(s.status.state,'error');
  s=new FakeSheets();p=provider();await collect({config,sheets:s,request:p.request,now,paused:true});assert.equal(p.calls.length,0);assert.equal(s.appends,0);assert.equal(s.status.state,'paused');
  await collect({config:{...config,enabled:false},sheets:s,request:p.request,now});assert.equal(p.calls.length,0);
  s=new FakeSheets();s.data=[['wrong','header']];p=provider();await assert.rejects(()=>collect({config,sheets:s,request:p.request,now}));assert.equal(s.appends,0);assert.equal(p.calls.length,0);
  s=new FakeSheets();p=provider('bad-host');await collect({config,sheets:s,request:p.request,now});assert.ok(!p.calls.some(u=>u.includes('untrusted')));
  // Coverage and history stay distinct from browser captures, locations, and changed cadences.
  s=new FakeSheets();p=provider();await collect({config,sheets:s,request:p.request,now});
  const hist=H.fromRows(s.data);const c=coverage(hist,config,now+3*3600000,new Date(now).toISOString());assert.equal(c.missing,3);
  await collect({config:{...config,location:{...config.location,lat:41}},sheets:s,request:p.request,now:now+24*3600000});assert.equal(s.status.coverage.missing,0);
  const statusRows=[['collector','status_json'],['github-actions',JSON.stringify({...first,lastCapture:new Date(now-5*3600000).toISOString()})]];
  assert.match(H.collectorStatus(config,statusRows,now),/overdue/);
  assert.match(H.collectorStatus({...config,enabled:false},[],now),/paused/);
  assert.match(H.collectorStatus(config,[],now),/not reported/);
  // Read requests may retry; ambiguous POST writes must be handled by appendSnapshot, not blindly repeated.
  let tries=0;const request=async()=>{tries++;return tries<3?{ok:false,status:503}:{ok:true,json:async()=>({ok:true})};};
  assert.deepEqual(await requestJson('https://example.test',{}, {fetchImpl:request,wait:async()=>{}}),{ok:true});assert.equal(tries,3);
  tries=0;await assert.rejects(()=>requestJson('https://example.test',{method:'POST'},{fetchImpl:request,wait:async()=>{}}));assert.equal(tries,1);
  tries=0;await assert.rejects(()=>requestJson('https://example.test',{}, {fetchImpl:async()=>{tries++;return{ok:false,status:403}},wait:async()=>{}}));assert.equal(tries,1);
  // Verify the service account assertion locally with a disposable RSA key.
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const token=await serviceToken({type:'service_account',client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})},async(url,opts)=>{
    assert.equal(url,'https://oauth2.googleapis.com/token');const jwt=new URLSearchParams(opts.body).get('assertion').split('.');
    assert.ok(createVerify('RSA-SHA256').update(jwt[0]+'.'+jwt[1]).end().verify(publicKey,Buffer.from(jwt[2],'base64url')));
    const claims=JSON.parse(Buffer.from(jwt[1],'base64url'));assert.equal(claims.scope,'https://www.googleapis.com/auth/spreadsheets');assert.equal(claims.exp-claims.iat,3600);return{access_token:'test-only'};
  },now);assert.equal(token,'test-only');
  // The Sheets adapter writes only the two weather tabs, never core plant tabs or delete operations.
  const calls=[];const sheets=new Sheets('test','test-only',async(url,opts)=>{calls.push({url,opts});return{values:[],sheets:[{properties:{title:'weather_history'}},{properties:{title:'weather_collector'}}]};});
  await sheets.ensure();await sheets.rows();await sheets.seed(H.headers);await sheets.append([['a','b','0','{}']]);await sheets.readStatus();await sheets.writeStatus(first);
  assert.ok(calls.every(c=>!c.opts.method || c.url.includes('/values/weather_')));assert.ok(!calls.some(c=>c.opts.body?.includes('deleteDimension')));
  console.log('PASS scheduled collector: shared normalization, UTC slot deduplication, ambiguous writes, retry recovery, partial failures, pause, gaps, config changes, credential signing, restricted Sheets writes, and stale status');
})().catch(e=>{console.error(e);process.exitCode=1});
