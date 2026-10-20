const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const H=require('../shared/forecast-history.js');
const page=fs.readFileSync('plants/index.html','utf8');
const riskSource=page.slice(page.indexOf('function dayAlerts('),page.indexOf('function renderForecast('));
const ctx=vm.createContext({});vm.runInContext(riskSource,ctx);
const input={settings:{lat:40.4,lon:-78.6,city:'Lilly',units:'F'}, source:'nws', alerts:[],alertsAvailable:true,capturedAt:Date.parse('2026-10-18T12:00:00Z'),
  daily:{time:['2026-10-18','2026-10-19'],temperature_2m_max:[55,null],temperature_2m_min:[30,null],precipitation_sum:[0,0],precipitation_probability_max:[75,null],wind_speed_10m_max:[30,null]},
  rainfall:[{date:'2026-10-17',amount:0.25}],rainfallFetched:Date.parse('2026-10-18T11:00:00Z'),dayAlerts:ctx.dayAlerts};
const a=H.capture(input);assert.equal(a.days[0].pcp,null);assert.equal(a.days[0].risks.length,2);assert.equal(a.days[1].risks.length,0);assert.equal(a.rainfall.kind,'model-estimate');
const open=H.capture({...input,source:'open-meteo'});assert.equal(open.days[0].pcp,0);
assert.equal(H.capture({...input,daily:{time:[]}}),null);
assert.equal(H.shouldCapture([],a),true);
assert.equal(H.shouldCapture([a],H.capture({...input,capturedAt:input.capturedAt+1000})),false);
assert.equal(H.shouldCapture([a],H.capture({...input,capturedAt:input.capturedAt+3600000})),true);
assert.equal(H.shouldCapture([a],H.capture({...input,capturedAt:input.capturedAt+1000,alertsAvailable:false})),true);
assert.equal(H.shouldCapture([a],H.capture({...input,capturedAt:input.capturedAt+1000,alerts:[{id:'new',event:'Freeze warning'}]})),true);
assert.equal(H.shouldCapture([a],H.capture({...input,settings:{...input.settings,units:'C'}})),true);
assert.equal(H.shouldCapture([a],H.capture({...input,settings:{...input.settings,lat:41}})),true);
const large=H.capture({...input,capturedAt:input.capturedAt+3600000,alerts:[{id:'long',description:'x'.repeat(70000)}]});
const rows=H.toRows([a,large]);assert.ok(rows.every(r=>String(r[3]).length<50000));assert.deepEqual(H.fromRows(rows),JSON.parse(JSON.stringify([large,a])));
assert.deepEqual(H.pendingRows(rows,[a,large]),[]);assert.equal(H.pendingRows(H.toRows([a]),[a,large]).length,3);
assert.equal(H.fromRows(rows.slice(0,3)).length,0); // incomplete large snapshot is not presented as complete
assert.equal(H.merge([a],[a]).length,1);
// Execute the production append-only sync with a fake Sheets service. No real data writes.
const syncSource=page.slice(page.indexOf('async function syncWeatherHistory(){'),page.indexOf('function filteredWeatherHistory(){'));
const integrationSource=page.slice(page.indexOf('const WEATHER_HISTORY_KEY ='),page.indexOf('async function loadWeatherHistory(){'));
(async()=>{
  const calls=[], storage=new Map(), pending=new Set([large.id]);let fail=false;
  const context={ForecastHistory:H, localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},isGsAuthed:()=>true,ensureTab:async()=>{},SHEETS_ID:'test',renderWeatherHistory(){},
    gsApiFetch:async(url,opts)=>{calls.push({url,opts});if(!opts)return{values:H.toRows([a])};if(fail)throw Error('offline');return{};}};
  vm.createContext(context);vm.runInContext(integrationSource+syncSource,context);
  context.fixture={a,large};vm.runInContext('weatherHistory=[fixture.large];weatherPending=new Set([fixture.large.id]);',context);
  await context.syncWeatherHistory();
  assert.equal(calls.filter(c=>c.opts).length,1);assert.ok(calls[1].url.includes(':append?'));assert.equal(JSON.parse(calls[1].opts.body).values.length,3);
  assert.equal(vm.runInContext('weatherPending.size',context),0);assert.equal(vm.runInContext('weatherHistory.length',context),2);
  fail=true;vm.runInContext('weatherPending.add(fixture.large.id)',context);
  await assert.rejects(()=>context.syncWeatherHistory(),/offline/);assert.equal(vm.runInContext('weatherPending.size',context),1);
  assert.ok(!calls.some(c=>c.opts?.method==='DELETE'||c.opts?.body?.includes('deleteDimension')));
  // All pending captures survive local cache trimming; acknowledged older snapshots need not be cached.
  context.many=Array.from({length:100},(_,i)=>({...a,id:String(i),capturedAt:new Date(input.capturedAt+i*3600000).toISOString()}));
  vm.runInContext("weatherHistory=ForecastHistory.merge(many);weatherPending=new Set(['0']);persistWeatherHistory()",context);
  const cached=JSON.parse(storage.get('yardDashboard.weatherHistory.v1'));assert.equal(cached.snapshots.length,91);assert.ok(cached.snapshots.some(s=>s.id==='0'));
  console.log('PASS forecast snapshot provenance, unavailable values, risks, hourly/alert capture, units/location separation, lossless long alerts, sheet retries/dedup, append-only sync and pending cache retention');
})().catch(e=>{console.error(e);process.exitCode=1});
// Weather-fetch integration: fallback, unavailable alerts/rain, failed requests,
// fresh-cache behavior, and a location change while requests are in flight.
(async()=>{
  const source=page.slice(page.indexOf('let weatherRequest = 0;'),page.indexOf('function dayAlerts('));
  const snapshots=[];let mode='fallback', rainCalls=0;
  const context={WeatherForecast:require('../shared/weather-forecast.js'),Date,console:{warn(){}},state:{settings:input.settings},$(){return{textContent:'',innerHTML:'',style:{},addEventListener(){}}},
    save(){}, renderForecast(){},dayAlerts:ctx.dayAlerts,
    recordWeatherSnapshot(x){snapshots.push(H.capture(x));},
    fetchForecastNWS:async()=>{if(mode==='fallback'||mode==='failed')throw Error('NWS offline');if(mode==='move')context.state.settings={...input.settings,lat:42};return input.daily;},
    fetchForecastOpenMeteo:async()=>{if(mode==='failed')throw Error('offline');return {daily:input.daily,hourly:[],timezone:'UTC'};},
    fetchNWSAlerts:async()=>null,
    fetchRainfallHistory:async()=>{rainCalls++;throw Error('archive offline');}};
  vm.createContext(context);vm.runInContext(source,context);
  await context.fetchForecast(true);assert.equal(snapshots.length,1);assert.equal(snapshots[0].source,'open-meteo');assert.equal(snapshots[0].alertsAvailable,false);assert.equal(snapshots[0].rainfall.days.length,0);
  await context.fetchForecast();assert.equal(snapshots.length,1); // cached forecast isn't archived as a new forecast
  mode='failed';await context.fetchForecast(true);assert.equal(snapshots.length,1);
  mode='move';await context.fetchForecast(true);assert.equal(snapshots.length,1); // do not relabel an in-flight response with new coordinates
  console.log('PASS production weather fetch fallback, failures, fresh cache and in-flight location guard');
})().catch(e=>{console.error(e);process.exitCode=1});
