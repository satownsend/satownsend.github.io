/* Imported model estimates only; never writes to the forecast snapshot archive. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HistoricalWeather=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const ENDPOINT='https://historical-forecast-api.open-meteo.com/v1/forecast';
 const CACHE='yardHistoricalWeather.v1', memory=new Map(),pending=new Map();
 const ARCHIVE_URL='https://satownsend-chatbot.satownsend.workers.dev/weather-archive';
 const archiveMonths=new Map();
 const models={archive_era5:{name:'Permanent ERA5 archive',since:2020},best_match:{name:'Best match (automatic model selection)',since:2022},gfs_seamless:{name:'GFS Seamless',since:2021}};
 const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 function dateAt(time,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
 function shift(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 function context(location,year,model='best_match'){
  if(!models[model])throw new Error('Choose a supported model.');
  const lat=Number(location.lat),lon=Number(location.lon),units=location.units,timezone=location.timezone;
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||!['F','C'].includes(units))throw new Error('Invalid historical-weather location or units.');
  const today=dateAt(Date.now(),timezone),y=Number(year);
  if(!Number.isInteger(y)||y<models[model].since||y>Number(today.slice(0,4)))throw new Error(`Choose a year from ${models[model].since} through ${today.slice(0,4)}.`);
  if(model==='archive_era5'&&(Math.abs(lat-40.4238)>0.00001||Math.abs(lon+78.6231)>0.00001||timezone!=='America/New_York'))throw new Error('The permanent archive is for Lilly in America/New_York. Choose an on-demand model for other locations.');
  const start=model==='archive_era5'&&y===2020?'2020-10-01':`${y}-01-01`,end=[`${y}-12-31`,shift(today,-1)].sort()[0];
  return {lat,lon,units,timezone,model,start,end,name:location.name||`${lat}, ${lon}`};
 }
 function key(c,kind,date=''){return JSON.stringify([1,c.lat,c.lon,c.units,c.timezone,c.model,kind,kind==='daily'?c.start:date,kind==='daily'?c.end:date]);}
 function peek(c,kind='daily',date=''){
  const k=key(c,kind,date);let value=memory.get(k);
  if(!value){try{const rows=JSON.parse(localStorage.getItem(CACHE)||'[]');value=rows.find(r=>r.key===k)?.value;if(value&&value.version===1&&Array.isArray(value.items)&&value.kind===kind&&value.timezone===c.timezone&&value.model===c.model&&value.units===c.units)memory.set(k,value);else value=null;}catch(_){value=null;}}
  return value||null;
 }
 function stale(value){if(!value)return true;if(value.comparison){const age=Date.now()-Date.parse(value.checkedAt||'');return !Number.isFinite(age)||age<0||age>=15*60000||value.comparison.cutoff!==shift(dateAt(Date.now(),value.timezone),-1);}if(value.model==='archive_era5'){const age=Date.now()-Date.parse(value.checkedAt||value.retrievedAt);return !Number.isFinite(age)||age<0||age>(value.archive?.backfillComplete?6*3600000:60000);}const recent=value.end>=shift(dateAt(Date.now(),value.timezone),-7),age=Date.now()-Date.parse(value.retrievedAt);return !Number.isFinite(age)||age<0||age>(recent?6*3600000:30*86400000);}
 function remember(k,value){
  memory.set(k,value);
  // Four years of daily summaries and eight days of hourly detail, bounded in both stores.
  for(const kind of ['daily','hourly']){const items=[...memory].filter(([,v])=>v.kind===kind).sort((a,b)=>b[1].retrievedAt.localeCompare(a[1].retrievedAt));for(const [old] of items.slice(kind==='daily'?4:8))memory.delete(old);}
  try{const previous=JSON.parse(localStorage.getItem(CACHE)||'[]');const map=new Map(previous.filter(r=>r.value?.version===1).map(r=>[r.key,r.value]));for(const pair of memory)map.set(...pair);const rows=[];for(const kind of ['daily','hourly'])rows.push(...[...map].filter(([,v])=>v.kind===kind).sort((a,b)=>b[1].retrievedAt.localeCompare(a[1].retrievedAt)).slice(0,kind==='daily'?4:8).map(([key,value])=>({key,value})));localStorage.setItem(CACHE,JSON.stringify(rows));return true;}catch(_){return false;}
 }
 function url(c,kind,date){
  const query=new URLSearchParams({latitude:c.lat,longitude:c.lon,timezone:kind==='hourly'?'UTC':c.timezone,models:c.model,temperature_unit:c.units==='C'?'celsius':'fahrenheit',precipitation_unit:c.units==='C'?'mm':'inch',wind_speed_unit:'mph',start_date:kind==='daily'?c.start:shift(date,-1),end_date:kind==='daily'?c.end:shift(date,1)});
  if(kind==='daily')query.set('daily','temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,showers_sum,wind_speed_10m_max,wind_gusts_10m_max');
  else{query.set('hourly','temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m');query.set('timeformat','unixtime');}
  return ENDPOINT+'?'+query;
 }
 function normalize(json,c,kind,date,requestUrl){
  if(json.timezone!==(kind==='hourly'?'GMT':c.timezone)&&json.timezone!==(kind==='hourly'?'UTC':c.timezone))throw new Error('Historical response has an unexpected time zone.');
  const block=json[kind],u=json[kind+'_units']||{},temp=c.units==='C'?'°C':'°F',precip=c.units==='C'?'mm':'inch';
  const expected=kind==='daily'?{temperature_2m_max:temp,temperature_2m_min:temp,precipitation_sum:precip,rain_sum:precip,showers_sum:precip,wind_speed_10m_max:'mp/h',wind_gusts_10m_max:'mp/h'}:{temperature_2m:temp,precipitation:precip,wind_speed_10m:'mp/h',wind_gusts_10m:'mp/h'};
  if(!Array.isArray(block?.time)||Object.entries(expected).some(([k,v])=>u[k]!==v))throw new Error('Historical response has missing or unexpected units.');
  const seen=new Set(),items=[];
  for(let i=0;i<block.time.length;i++){
   const t=block.time[i];
   if(kind==='daily'){
    if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t)||shift(t,0)!==t||t<c.start||t>c.end||seen.has(t))continue;
    seen.add(t);const n=k=>numeric(block[k]?.[i]),rain=n('rain_sum'),showers=n('showers_sum');
    items.push({date:t,hi:n('temperature_2m_max'),lo:n('temperature_2m_min'),pcp:n('precipitation_sum'),rain:rain!=null&&showers!=null?rain+showers:null,wind:n('wind_speed_10m_max'),gust:n('wind_gusts_10m_max')});
   }else{
    if(typeof t!=='number'||!Number.isFinite(t)||seen.has(t)||dateAt(t*1000,c.timezone)!==date)continue;
    seen.add(t);items.push({time:new Date(t*1000).toISOString(),date,temp:numeric(block.temperature_2m?.[i]),pcp:numeric(block.precipitation?.[i]),wind:numeric(block.wind_speed_10m?.[i]),gust:numeric(block.wind_gusts_10m?.[i])});
   }
  }
  items.sort((a,b)=>(a.time||a.date).localeCompare(b.time||b.date));
  return {...c,version:1,kind,sourceType:'imported-model-estimate',provider:'Open-Meteo Historical Forecast',modelSelection:c.model,resolvedModel:c.model==='best_match'?null:c.model,start:kind==='daily'?c.start:date,end:kind==='daily'?c.end:date,retrievedAt:new Date().toISOString(),requestUrl,requestStart:kind==='daily'?c.start:shift(date,-1),requestEnd:kind==='daily'?c.end:shift(date,1),responseTimezone:json.timezone,responseLocation:{lat:json.latitude,lon:json.longitude,elevation:json.elevation},responseUnits:u,items};
 }
 async function loadArchive(c,kind,date,refresh,comparison=false){
  const month=date.slice(0,7),requestUrl=ARCHIVE_URL+(kind==='daily'?'?year='+c.start.slice(0,4)+(comparison?'&recent=1':''):'?month='+month);
  let payload=kind==='hourly'?archiveMonths.get(month):null;
  if(!payload||refresh||Date.now()-payload.loadedAt>60000){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
   try{const r=await fetch(requestUrl,{signal:controller.signal,cache:refresh?'reload':'default'});payload=await r.json();if(!r.ok)throw new Error(payload.error||'Permanent archive unavailable.');if(!payload.archive||!Array.isArray(payload.items))throw new Error('The permanent archive is being set up. Stored data will appear automatically.');payload.loadedAt=Date.now();if(kind==='hourly'){archiveMonths.set(month,payload);while(archiveMonths.size>4)archiveMonths.delete(archiveMonths.keys().next().value);}}
   finally{clearTimeout(timer);}
  }
  const convert=(v,type)=>v==null?null:type==='temp'?(c.units==='F'?v*9/5+32:v):type==='precip'?(c.units==='F'?v/25.4:v):v;
  const items=payload.items.filter(d=>kind==='daily'?d.date>=c.start&&d.date<=c.end:d.date===date).map(d=>({...d,...Object.fromEntries((kind==='daily'?['hi','lo','pcp','rain','wind','gust']:['temp','pcp','wind','gust']).map(k=>[k,convert(numeric(d[k]),['hi','lo','temp'].includes(k)?'temp':['pcp','rain'].includes(k)?'precip':'wind')]))}));
  const first=payload.monthlyProvenance?.[0];
  const value={...c,comparison:comparison?payload.comparison||{cutoff:shift(dateAt(Date.now(),c.timezone),-1),recentError:'Recent comparison estimates are not available yet.'}:null,version:1,kind,sourceType:comparison?'mixed-reanalysis-and-recent-estimates':'imported-reanalysis-estimate',provider:comparison?'Open-Meteo ERA5 with provisional recent estimates':'Open-Meteo Historical Weather (stored in R2)',modelSelection:comparison?'era5 + best_match':'era5',resolvedModel:comparison?null:'era5',start:kind==='daily'?c.start:date,end:kind==='daily'?c.end:date,retrievedAt:payload.retrievedAt||new Date().toISOString(),checkedAt:new Date().toISOString(),requestUrl,requestStart:c.start,requestEnd:c.end,responseTimezone:c.timezone,responseLocation:first?.responseLocation||{},responseUnits:first?.responseUnits||{},monthlyProvenance:payload.monthlyProvenance||[],archive:payload.archive,documentation:'https://open-meteo.com/en/docs/historical-weather-api',items,persisted:true};
  value.persisted=remember(key(c,kind,date)+(comparison?':comparison':''),value);return value;
 }
 async function loadComparison(c,refresh=false){
  if(c.model!=='archive_era5')throw new Error('Comparison requires the Lilly archive.');
  const k=key(c,'daily')+':comparison',cached=memory.get(k);
  if(cached&&!refresh&&!stale(cached))return cached;
  if(pending.has(k))return pending.get(k);
  const task=loadArchive(c,'daily','',refresh,true);pending.set(k,task);
  try{return await task;}finally{pending.delete(k);}
 }
 async function load(c,kind='daily',date='',refresh=false){
  if(!['daily','hourly'].includes(kind))throw new Error('Invalid historical request.');
  if(c.start>c.end)throw new Error('No completed days are available in this year yet.');
  if(kind==='hourly'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||shift(date,0)!==date||date<c.start||date>c.end))throw new Error('Choose a completed day in this year.');
  const k=key(c,kind,date),cached=peek(c,kind,date);if(cached&&!refresh&&!stale(cached))return cached;if(pending.has(k))return pending.get(k);
  const task=c.model==='archive_era5'?loadArchive(c,kind,date,refresh):(async()=>{const control=new AbortController(),timer=setTimeout(()=>control.abort(),25000),requestUrl=url(c,kind,date);try{const r=await fetch(requestUrl,{signal:control.signal,cache:refresh?'reload':'default'});if(!r.ok)throw new Error(r.status===429?'Open-Meteo request limit reached; try again later.':`Historical weather unavailable (HTTP ${r.status}).`);const json=await r.json();if(json.error)throw new Error('Historical weather unavailable for this selection.');const value=normalize(json,c,kind,date,requestUrl);value.persisted=true;value.persisted=remember(k,value);return value;}catch(e){if(e.name==='AbortError')throw new Error('Historical weather request timed out. Try again.');throw e;}finally{clearTimeout(timer);}})();
  pending.set(k,task);try{return await task;}finally{pending.delete(k);}
 }
 return {models,context,key,peek,stale,load,loadComparison,dateAt,shift};
});
