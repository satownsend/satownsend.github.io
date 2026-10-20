'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const W=require('../shared/weather-forecast.js'),H=require('../shared/forecast-history.js');
const page=fs.readFileSync('plants/index.html','utf8');
const code=(a,b)=>page.slice(page.indexOf(a),page.indexOf(b,page.indexOf(a)));
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nws=W.nwsDaily([{startTime:'2026-11-01T06:00:00-05:00',isDaytime:true,temperature:50,temperatureUnit:'F',windSpeed:'10 to 20 km/h',probabilityOfPrecipitation:{value:null}},{startTime:'2026-11-01T18:00:00-05:00',isDaytime:false,temperature:32,temperatureUnit:'F',windSpeed:'Calm',probabilityOfPrecipitation:{value:0}}],'F');
assert.equal(nws.precipitation_sum[0],null);assert.equal(nws.wind_gusts_10m_max[0],null);assert.equal(nws.precipitation_probability_max[0],0);assert.ok(Math.abs(nws.wind_speed_10m_max[0]-12.42742)<0.001);
assert.equal(W.nwsDaily([{startTime:'2026-11-01',temperature:32,temperatureUnit:'F'}],'C').temperature_2m_min[0],0);
assert.equal(W.windMph('unknown'),null);assert.equal(W.windMph('Calm'),0);
const sample={timezone:'America/New_York',utc_offset_seconds:-14400,daily:{time:[Date.parse('2026-11-01T04:00:00Z')/1000],temperature_2m_max:[48],temperature_2m_min:[29],precipitation_sum:[0.2],precipitation_probability_max:[65],wind_speed_10m_max:[12],wind_gusts_10m_max:[35]},
 hourly:{time:[Date.parse('2026-11-01T05:00:00Z')/1000,Date.parse('2026-11-01T06:00:00Z')/1000],temperature_2m:[32,null],precipitation_probability:[0,null],precipitation:[0,null],wind_speed_10m:[8,9],wind_gusts_10m:[22,null]}};
const om=W.openMeteo(sample),combined=W.combine(nws,om);
assert.equal(om.daily.time[0],'2026-11-01');assert.equal(om.hourly[0].date,'2026-11-01');assert.equal(om.hourly[1].date,'2026-11-01');assert.notEqual(om.hourly[0].time,om.hourly[1].time);
assert.equal(W.dateKey('2026-11-01T03:00:00Z','America/New_York'),'2026-10-31');
assert.equal(combined.daily.temperature_2m_max[0],50);assert.equal(combined.daily.precipitation_sum[0],0.2);assert.equal(combined.daily.wind_gusts_10m_max[0],35);assert.equal(combined.daily.sources[0].high,'nws');assert.equal(combined.daily.sources[0].gust,'open-meteo');
assert.equal(W.combine(null,om).source,'open-meteo');assert.equal(W.combine(nws,null,'America/New_York').source,'nws');assert.equal(W.combine(nws,null).hourly.length,0);assert.throws(()=>W.combine(null,null));
assert.equal(W.total([0,0]),0);assert.equal(W.total([0,null]),null);assert.equal(W.total([]),null);assert.equal(W.format(null,' mph'),'unavailable');
const input={settings:{city:'Lilly',lat:40.4,lon:-78.6,units:'F'},daily:combined.daily,hourly:combined.hourly,timezone:combined.timezone,source:combined.source,alerts:[],alertsAvailable:true,capturedAt:Date.parse('2026-10-31T12:00:00Z')};
const snapshot=H.capture(input);assert.equal(snapshot.version,2);assert.equal(snapshot.days[0].pcp,0.2);assert.equal(snapshot.days[0].gust,35);assert.equal(snapshot.hourly[0].pcp,0);assert.equal(snapshot.hourly[1].pcp,null);assert.deepEqual(H.fromRows(H.toRows([snapshot])),[snapshot]);
const legacy=H.capture({...input,hourly:undefined,daily:nws,source:'nws',capturedAt:input.capturedAt-1000});assert.equal(legacy.version,1);assert.equal(H.shouldCapture([legacy],snapshot),true);assert.equal(legacy.days[0].pcp,null);assert.equal(H.fromRows(H.toRows([snapshot,legacy])).length,2);
const ui=vm.createContext({WeatherForecast:W,escapeHtml});vm.runInContext(code('function weatherHourlyMarkup(', 'let weatherReturnFocus'),ui);
const markup=ui.weatherHourlyMarkup('2026-11-01',om.hourly,om.timezone,'F',combined.daily.sources[0]);
assert.match(markup,/EDT/);assert.match(markup,/EST/);assert.match(markup,/Sustained \(mph\)/);assert.match(markup,/Gusts \(mph\)/);assert.match(markup,/hour ending/);assert.doesNotMatch(markup,/NaN/);assert.match(markup,/<td>—<\/td>/);
assert.match(ui.weatherHourlyMarkup('2026-11-02',om.hourly,om.timezone,'F'),/unavailable for this date/);
// Spring DST transition also preserves absolute times and local dates without inventing a 2 AM row.
const spring=W.openMeteo({...sample,hourly:{time:[Date.parse('2026-03-08T06:00:00Z')/1000,Date.parse('2026-03-08T07:00:00Z')/1000],temperature_2m:[35,34]}});
assert.equal(spring.hourly[0].date,'2026-03-08');assert.equal(spring.hourly[1].date,'2026-03-08');
// Execute production fetch orchestration with fake independent providers.
function integration(){
 const nodes=new Map(),$=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',innerHTML:'',style:{},addEventListener(){}});return nodes.get(key)};
 const ctx={WeatherForecast:W,Date,console:{warn(){}},state:{settings:input.settings},$,escapeHtml,snapshots:[],save(){},renderForecast(){},dayAlerts:()=>[],nwsCacheKey:()=>'',
  fetchForecastNWS:async()=>nws,fetchForecastOpenMeteo:async()=>om,fetchNWSAlerts:async()=>[{event:'Freeze Warning',headline:'Official warning'}],fetchRainfallHistory:async()=>[{date:'2026-10-30',amount:null}],recordWeatherSnapshot(s){ctx.snapshots.push(H.capture(s))}};
 vm.createContext(ctx);vm.runInContext(code('let weatherRequest = 0;', 'function dayAlerts('),ctx);return{ctx,$};
}
(async()=>{
 let {ctx,$}=integration();await ctx.fetchForecast(true);assert.equal(ctx.snapshots[0].source,'nws+open-meteo');assert.equal(ctx.snapshots[0].alerts[0].event,'Freeze Warning');assert.equal(ctx.snapshots[0].rainfall.days[0].amount,null);
 await ctx.fetchForecast();assert.equal(ctx.snapshots.length,1);
 ({ctx,$}=integration());ctx.fetchForecastOpenMeteo=async()=>{throw Error('offline')};await ctx.fetchForecast(true);assert.equal(ctx.state.forecastSource,'nws');assert.equal(ctx.state.forecast.precipitation_sum[0],null);assert.equal(ctx.state.forecastHourly.length,0);assert.equal(ctx.state.nwsAlerts.length,1);
 ({ctx,$}=integration());ctx.fetchForecastNWS=async()=>{throw Error('offline')};await ctx.fetchForecast(true);assert.equal(ctx.state.forecastSource,'open-meteo');assert.equal(ctx.state.nwsAlerts.length,1);
 ctx.fetchForecastOpenMeteo=async()=>{throw Error('offline')};await ctx.fetchForecast(true);assert.equal(ctx.snapshots.length,1);assert.match($('#upcomingAlerts').innerHTML,/Official warning/);assert.match($('#forecastSource').textContent,/unavailable/);
 ({ctx,$}=integration());ctx.fetchForecastNWS=async()=>{ctx.state.settings={...input.settings,lat:42};return nws;};await ctx.fetchForecast(true);assert.equal(ctx.snapshots.length,0);
 // Last-request-wins protection also covers refreshes at the same location.
 ({ctx,$}=integration());let release;ctx.fetchForecastNWS=()=>new Promise(resolve=>release=resolve);const old=ctx.fetchForecast(true);ctx.fetchForecastNWS=async()=>nws;await ctx.fetchForecast(true);release(nws);await old;assert.equal(ctx.snapshots.length,1);
 // Render missing NWS values without creating false zero amounts or gust labels.
 ({ctx,$}=integration());ctx.state.forecast=W.combine(nws,null).daily;ctx.state.settings.units='F';ctx.state.forecastSource='nws';ctx.state.forecastFetched=Date.now();ctx.state.nwsAlertsAvailable=false;ctx.state.nwsAlerts=[];ctx.buildBrief=()=>{};ctx.renderRainfall=()=>{};vm.runInContext(code('function renderForecast(){','function renderRainfall('),ctx);ctx.renderForecast();assert.match($('#weatherNote').textContent,/Precipitation unavailable/);assert.match($('#weatherNote').textContent,/Gusts unavailable/);assert.match($('#forecast').innerHTML,/Amount —/);assert.match($('#forecast').innerHTML,/type="button"/);
 console.log('PASS hourly forecast: providers, units, sustained/gust separation, missing values, zero values, DST-aware timestamps, legacy/new history round-trips, independent alerts, cache and request races, and hourly rendering');
})().catch(error=>{console.error(error);process.exitCode=1});
