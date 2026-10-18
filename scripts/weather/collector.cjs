'use strict';
const H=require('../../shared/forecast-history.js');
const Weather=require('../../shared/weather-data.js');
const {requestJson}=require('./http.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function validateConfig(config){
  const s=config.location;
  if(typeof config.enabled!=='boolean' || !Number.isInteger(config.intervalHours) || config.intervalHours<1 || config.intervalHours>24)throw new Error('Collector cadence must be 1–24 whole hours');
  if(!s || !Number.isFinite(s.lat) || Math.abs(s.lat)>90 || !Number.isFinite(s.lon) || Math.abs(s.lon)>180 || !['C','F'].includes(s.units))throw new Error('Invalid collector location or units');
  if(!/^[\w-]+$/.test(config.sheetId||''))throw new Error('Invalid spreadsheet id');
  new Intl.DateTimeFormat('en-US',{timeZone:s.timezone}).format();
  return config;
}
function validDaily(d){
  if(!Array.isArray(d?.time) || !d.time.length || !d.time.every(t=>/^\d{4}-\d{2}-\d{2}$/.test(t)) ||
    !d.temperature_2m_max?.some(v=>typeof v==='number' && Number.isFinite(v)))throw new Error('Invalid forecast response');
  return d;
}
async function weather(config,history,now,request=requestJson){
  const s=config.location, warnings=[];
  const get=url=>request(url,{headers:{'User-Agent':config.userAgent,Accept:'application/geo+json, application/json'}});
  const latest=H.merge(history).find(x=>x.location.lat===s.lat && x.location.lon===s.lon && x.units===s.units &&
    x.rainfall.fetchedAt && now-Date.parse(x.rainfall.fetchedAt)<6*3600000 && x.rainfall.days.length);
  const forecast=(async()=>{
    try {
      const point=await get(`https://api.weather.gov/points/${s.lat},${s.lon}`);
      const forecastUrl=point.properties?.forecast;
      // Only send requests to the documented NWS host, including URLs returned by /points.
      if(!forecastUrl || new URL(forecastUrl).origin!=='https://api.weather.gov')throw new Error('Invalid NWS forecast URL');
      const j=await get(`${forecastUrl}?units=${s.units==='C'?'si':'us'}`);
      return {source:'nws',daily:validDaily(Weather.nwsPeriodsToDaily(j.properties?.periods||[],s.units))};
    } catch(e){warnings.push('nws_forecast_unavailable');}
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:s.lat,longitude:s.lon,daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code',temperature_unit:s.units==='C'?'celsius':'fahrenheit',precipitation_unit:s.units==='C'?'mm':'inch',wind_speed_unit:'mph',timezone:s.timezone,forecast_days:7});
    const j=await get(url.toString());
    return {source:'open-meteo',daily:validDaily(j.daily)};
  })();
  const alerts=(async()=>{
    try {
      const j=await get(`https://api.weather.gov/alerts/active?point=${s.lat},${s.lon}`);
      if(!Array.isArray(j.features))throw new Error('Invalid alerts response');
      return j.features.map(f=>({id:f.id,event:f.properties.event,headline:f.properties.headline,severity:f.properties.severity,effective:f.properties.effective,expires:f.properties.expires,description:f.properties.description}));
    } catch(e){warnings.push('nws_alerts_unavailable');return null;}
  })();
  const rainfall=(async()=>{
    if(latest)return {days:latest.rainfall.days,fetchedAt:Date.parse(latest.rainfall.fetchedAt)};
    try {
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
      const part=key=>parts.find(p=>p.type===key).value;
      const end=new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);end.setUTCDate(end.getUTCDate()-1);
      const start=new Date(end);start.setUTCDate(start.getUTCDate()-29);
      const url=new URL('https://archive-api.open-meteo.com/v1/archive');
      url.search=new URLSearchParams({latitude:s.lat,longitude:s.lon,start_date:start.toISOString().slice(0,10),end_date:end.toISOString().slice(0,10),daily:'precipitation_sum',precipitation_unit:s.units==='C'?'mm':'inch',timezone:s.timezone});
      const j=await get(url.toString());
      const days=Weather.rainfallFromDaily(j.daily);
      if(!days.length || !days.some(d=>d.amount!=null))throw new Error('Rainfall not yet available');
      return {days,fetchedAt:now};
    } catch(e){warnings.push('rainfall_unavailable');return {days:[],fetchedAt:null};}
  })();
  // allSettled lets optional calls finish even when both forecast providers fail.
  const [f,a,r]=await Promise.allSettled([forecast,alerts,rainfall]);
  if(f.status!=='fulfilled')throw new Error('Both forecast providers unavailable; no snapshot recorded');
  return {...f.value, alerts:a.value, rainfall:r.value, warnings:warnings.sort()};
}
function assertHeader(rows){
  if(rows.length && H.headers.some((h,i)=>h!==rows[0][i]))throw new Error('Unexpected weather_history columns; archive left unchanged');
}
async function appendSnapshot(sheets,snapshot,{pause=wait}={}){
  // Retain the exact payload throughout retries. Re-read after ambiguous writes before retrying.
  for(let attempt=0;attempt<3;attempt++){
    const current=await sheets.rows();assertHeader(current);
    const existing=H.fromRows(current).find(s=>s.id===snapshot.id);
    if(existing)return existing;
    if(current.some(r=>r[0]===snapshot.id))throw new Error('Incomplete snapshot with this id; archive left unchanged');
    if(!current.length)await sheets.seed(H.headers);
    try {await sheets.append(H.toRows([snapshot]).slice(1));return snapshot;}
    catch(e){
      const check=await sheets.rows();assertHeader(check);
      const written=H.fromRows(check).find(s=>s.id===snapshot.id);
      if(written)return written;
      if(attempt===2)throw new Error('Snapshot could not be appended');
      await pause(1000*2**attempt);
    }
  }
}
function coverage(history,config,now,startedAt){
  const interval=config.intervalHours*3600000;
  const slot=t=>Math.floor(t/interval)*interval;
  const end=slot(now), start=slot(Math.max(Date.parse(startedAt),now-7*86400000));
  const matching=history.filter(s=>s.collection?.kind==='scheduled' && s.collection.intervalHours===config.intervalHours && s.location.lat===config.location.lat && s.location.lon===config.location.lon && s.units===config.location.units);
  const seen=new Set(matching.map(s=>Date.parse(s.collection.slot)));
  let missing=0,expected=0;
  for(let t=start;t<=end;t+=interval){expected++;if(!seen.has(t))missing++;}
  return {windowStart:new Date(start).toISOString(),expected,missing};
}
async function collect({config,sheets,now=Date.now(),request=requestJson,paused=false,pause=wait}){
  validateConfig(config);
  await sheets.ensure();
  const savedStatus=await sheets.readStatus()||{};
  const sameConfig=savedStatus.location?.lat===config.location.lat && savedStatus.location?.lon===config.location.lon && savedStatus.location?.units===config.location.units && savedStatus.intervalHours===config.intervalHours;
  const previous=sameConfig?savedStatus:{};
  const timestamp=new Date(now).toISOString();
  const status={...previous,version:1,startedAt:previous.startedAt||timestamp,lastAttempt:timestamp,intervalHours:config.intervalHours,location:config.location,workflowUrl:'https://github.com/satownsend/satownsend.github.io/actions/workflows/weather-collector.yml'};
  if(!config.enabled || paused){status.state='paused';status.warnings=[];await sheets.writeStatus(status);return status;}
  let history=[];
  try {
    const rows=await sheets.rows();assertHeader(rows);history=H.fromRows(rows);
    const slot=new Date(Math.floor(now/(config.intervalHours*3600000))*config.intervalHours*3600000).toISOString();
    const id=`scheduled:${config.location.lat},${config.location.lon}|${config.location.units}|${slot}`;
    let snapshot=history.find(s=>s.id===id);
    if(!snapshot){
      if(rows.some(r=>r[0]===id))throw new Error('Incomplete snapshot with this id; archive left unchanged');
      const w=await weather(config,history,now,request);
      snapshot=H.capture({settings:config.location,daily:w.daily,source:w.source,alerts:w.alerts,alertsAvailable:w.alerts!==null,rainfall:w.rainfall.days,rainfallFetched:w.rainfall.fetchedAt,capturedAt:now,dayAlerts:Weather.dayAlerts});
      if(!snapshot)throw new Error('No usable forecast; no snapshot recorded');
      snapshot.id=id;snapshot.collection={kind:'scheduled',slot,intervalHours:config.intervalHours,warnings:w.warnings};
      snapshot=await appendSnapshot(sheets,snapshot,{pause});
      history=H.merge(history,[snapshot]);
    }
    status.state=snapshot.collection.warnings.length?'partial':'ok';
    status.warnings=snapshot.collection.warnings;status.lastSuccess=timestamp;status.lastCapture=snapshot.capturedAt;status.source=snapshot.source;
    status.coverage=coverage(history,config,now,status.startedAt);
    await sheets.writeStatus(status);return status;
  } catch(e){
    status.state='error';status.warnings=['collection_failed'];status.coverage=coverage(history,config,now,status.startedAt);
    // Keep prior success information; a status-write error must not erase a successful archive append.
    try {await sheets.writeStatus(status);} catch(_){}
    throw e;
  }
}
module.exports={validateConfig,weather,appendSnapshot,coverage,collect};
