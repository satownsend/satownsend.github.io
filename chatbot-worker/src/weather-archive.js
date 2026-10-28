/* Fixed-location reanalysis archive. Public reads; only scheduled events write. */
export const ARCHIVE={start:'2020-10-01',lat:40.4238,lon:-78.6231,name:'Lilly, PA 15938',timezone:'America/New_York',model:'era5',prefix:'weather/v1/lilly-era5/'};
const manifestKey=ARCHIVE.prefix+'manifest.json',leaseKey=ARCHIVE.prefix+'update-lease.json';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:ARCHIVE.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
function dateAt(t){const p=formatter.formatToParts(new Date(t));return ['year','month','day'].map(k=>p.find(p=>p.type===k).value).join('-');}
function shift(d,n){const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
function months(end){const result=[];for(let y=2020;y<=Number(end.slice(0,4));y++)for(let m=1;m<=12;m++){const key=`${y}-${String(m).padStart(2,'0')}`;if(key>='2020-10'&&key<=end.slice(0,7))result.push(key);}return result;}
function bounds(month,cutoff){const [y,m]=month.split('-').map(Number);return {start:[month+'-01',ARCHIVE.start].sort().at(-1),end:[new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),cutoff].sort()[0]};}
function empty(){return {version:1,config:ARCHIVE,months:{},updatedAt:null,lastError:null};}
async function read(bucket){const object=await bucket.get(manifestKey),data=object?await object.json():empty();if(data.version!==1||!data.months||Array.isArray(data.months)||['start','lat','lon','timezone','model','prefix'].some(k=>data.config?.[k]!==ARCHIVE[k]))throw new Error('Archive configuration mismatch; existing data retained');return {object,data};}
function status(data){
 const cutoff=shift(dateAt(Date.now()),-5),planned=months(cutoff),entries=Object.values(data.months),dates=new Set(entries.flatMap(e=>e.daily.filter(d=>[d.hi,d.lo,d.pcp,d.rain,d.wind].every(v=>v!=null)).map(d=>d.date)));
 let through='';for(let date=ARCHIVE.start;date<=cutoff&&dates.has(date);date=shift(date,1))through=date;
 const imported=planned.filter(m=>data.months[m]?.through>=bounds(m,cutoff).end).length;
 return {start:ARCHIVE.start,through,latestAvailable:[...dates].sort().at(-1)||null,cutoff,importedMonths:imported,totalMonths:planned.length,backfillComplete:imported===planned.length&&through===cutoff,updatedAt:data.updatedAt,lastError:data.lastError,delayDays:5,model:'era5',location:ARCHIVE};
}
async function jsonFetch(url,timeout=25000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`Open-Meteo HTTP ${response.status}`);return await response.json();}finally{clearTimeout(timer);}}
function apiUrl(start,end,kind){const params=new URLSearchParams({latitude:ARCHIVE.lat,longitude:ARCHIVE.lon,start_date:start,end_date:end,timezone:kind==='daily'?ARCHIVE.timezone:'UTC',models:'era5',temperature_unit:'celsius',precipitation_unit:'mm',wind_speed_unit:'mph'});params.set(kind,kind==='daily'?'temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,wind_speed_10m_max':'temperature_2m,precipitation,wind_speed_10m');if(kind==='hourly')params.set('timeformat','unixtime');return 'https://archive-api.open-meteo.com/v1/archive?'+params;}
export async function fetchMonth(month,cutoff){
 const range=bounds(month,cutoff),dailyUrl=apiUrl(range.start,range.end,'daily'),hourlyUrl=apiUrl(shift(range.start,-1),shift(range.end,1),'hourly');
 const [daily,hourly]=await Promise.all([jsonFetch(dailyUrl),jsonFetch(hourlyUrl)]);
 if(daily.timezone!==ARCHIVE.timezone||!['GMT','UTC'].includes(hourly.timezone))throw new Error('Unexpected archive time zone');
 for(const [j,kind,fields]of [[daily,'daily',{temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_sum:'mm',rain_sum:'mm',wind_speed_10m_max:'mp/h'}],[hourly,'hourly',{temperature_2m:'°C',precipitation:'mm',wind_speed_10m:'mp/h'}]])if(!Array.isArray(j[kind]?.time)||Object.entries(fields).some(([k,v])=>j[kind+'_units']?.[k]!==v))throw new Error('Unexpected archive variables / units');
 const seen=new Set(),days=[];
 daily.daily.time.forEach((date,i)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<range.start||date>range.end||seen.has(date))return;seen.add(date);const n=k=>number(daily.daily[k]?.[i]);days.push({date,hi:n('temperature_2m_max'),lo:n('temperature_2m_min'),pcp:n('precipitation_sum'),rain:n('rain_sum'),wind:n('wind_speed_10m_max'),gust:null});});
 seen.clear();const hours=[];
 hourly.hourly.time.forEach((time,i)=>{if(typeof time!=='number'||!Number.isFinite(time)||seen.has(time))return;seen.add(time);const date=dateAt(time*1000);if(date<range.start||date>range.end)return;hours.push({time:new Date(time*1000).toISOString(),date,temp:number(hourly.hourly.temperature_2m?.[i]),pcp:number(hourly.hourly.precipitation?.[i]),wind:number(hourly.hourly.wind_speed_10m?.[i]),gust:null});});
 days.sort((a,b)=>a.date.localeCompare(b.date));hours.sort((a,b)=>a.time.localeCompare(b.time));
 if(!days.some(d=>d.hi!=null&&d.lo!=null&&d.pcp!=null)||!hours.some(h=>h.temp!=null&&h.pcp!=null))throw new Error('No usable archive data returned');
 const through=days.filter(d=>[d.hi,d.lo,d.pcp,d.rain,d.wind].every(v=>v!=null)).at(-1)?.date;
 return {version:1,month,...range,through:through||'',retrievedAt:new Date().toISOString(),sourceType:'imported-reanalysis-estimate',provider:'Open-Meteo Historical Weather',model:'era5',units:'C',precipitationUnits:'mm',windUnits:'mph',timezone:ARCHIVE.timezone,location:ARCHIVE,responseLocation:{lat:daily.latitude,lon:daily.longitude,elevation:daily.elevation},sourceUrls:{daily:dailyUrl,hourly:hourlyUrl},responseUnits:{daily:daily.daily_units,hourly:hourly.hourly_units},daily:days,hourly:hours};
}
function preserves(old,next){
 for(const [kind,key,fields]of [['daily','date',['hi','lo','pcp','rain','wind']],['hourly','time',['temp','pcp','wind']]]){const map=new Map(next[kind].map(d=>[d[key],d]));for(const previous of old[kind]||[])for(const field of fields)if(previous[field]!=null&&map.get(previous[key])?.[field]==null)return false;}return true;
}
async function writeManifest(bucket,data,object){return bucket.put(manifestKey,JSON.stringify(data),{httpMetadata:{contentType:'application/json'},onlyIf:object?{etagMatches:object.etag}:new Headers({'If-None-Match':'*'})});}
export async function updateArchive(env){
 const bucket=env.WEATHER_ARCHIVE;if(!bucket||env.WEATHER_ARCHIVE_PAUSED==='1')return;
 const existing=await bucket.get(leaseKey),lease=existing?await existing.json():null;
 if(lease?.expires>Date.now())return;
 const acquired=await bucket.put(leaseKey,JSON.stringify({expires:Date.now()+10*60000}),{onlyIf:existing?{etagMatches:existing.etag}:new Headers({'If-None-Match':'*'})});if(!acquired)return;
 try{
  try{await refreshRecent(bucket);}catch(e){console.warn('Recent comparison update failed; previous estimates retained.');}
  const {data,object}=await read(bucket),today=dateAt(Date.now()),cutoff=shift(today,-5),planned=months(cutoff);
  // Bootstrap one month per tick; revisit recent months every three hours for later provider releases.
  const recent=planned.slice(-2).reverse(),target=recent.find(m=>data.months[m]?.checkedDate!==today||Date.now()-Date.parse(data.months[m]?.retrievedAt||'')>=3*3600000)||planned.find(m=>!data.months[m])||planned.find(m=>data.months[m].checkedDate!==today&&data.months[m].through<bounds(m,cutoff).end);
  if(!target)return;
  try{
   const payload=await fetchMonth(target,cutoff),old=data.months[target];
   if(old){if(!old.payloadKey?.startsWith(ARCHIVE.prefix+'months/'+target+'/'))throw new Error('Invalid archive reference');const object=await bucket.get(old.payloadKey);if(!object)throw new Error('Previous archive payload missing');if(!preserves(await object.json(),payload))throw new Error('Incomplete provider revision; keeping previous archive');}
   const payloadKey=ARCHIVE.prefix+'months/'+target+'/'+crypto.randomUUID()+'.json';
   await bucket.put(payloadKey,JSON.stringify(payload),{httpMetadata:{contentType:'application/json',cacheControl:'public, max-age=31536000, immutable'}});
   data.months[target]={payloadKey,through:payload.through,checkedDate:today,retrievedAt:payload.retrievedAt,responseLocation:payload.responseLocation,sourceUrls:payload.sourceUrls,responseUnits:payload.responseUnits,daily:payload.daily};data.updatedAt=payload.retrievedAt;data.lastError=null;
  }catch(e){data.lastError={at:new Date().toISOString(),month:target,message:String(e.message||'Archive update failed')};}
  if(!await writeManifest(bucket,data,object))throw new Error('Archive manifest changed concurrently; retry next tick');
 }finally{await bucket.put(leaseKey,JSON.stringify({expires:0}),{onlyIf:{etagMatches:acquired.etag}});}
}
function result(body,cors,statusCode=200){return new Response(JSON.stringify(body),{status:statusCode,headers:{...cors,'Content-Type':'application/json','Cache-Control':statusCode===200?'public, max-age=60':'no-store'}});}
export async function archiveResponse(request,env,cors){
 if(request.method!=='GET')return result({error:'Read-only archive endpoint'},cors,405);
 if(!env.WEATHER_ARCHIVE)return result({error:'The permanent archive is being set up. Try again shortly.'},cors,503);
 try{
  const {data}=await read(env.WEATHER_ARCHIVE),archive={...status(data),paused:env.WEATHER_ARCHIVE_PAUSED==='1'},url=new URL(request.url);
  if(url.pathname==='/weather-archive/status')return result(archive,cors);
  const year=url.searchParams.get('year'),month=url.searchParams.get('month');
  if(year&&/^20\d{2}$/.test(year)&&Number(year)>=2020&&Number(year)<=new Date().getUTCFullYear()&&!month){
   const entries=Object.entries(data.months).filter(([key])=>key.startsWith(year+'-')).sort(([a],[b])=>a.localeCompare(b)),items=entries.flatMap(([,entry])=>entry.daily);
   let comparison=null,combined=items;
   if(url.searchParams.get('recent')==='1'){
    const recent=Number(year)>=Number(shift(dateAt(Date.now()),-14).slice(0,4))?await readRecent(env.WEATHER_ARCHIVE,env.WEATHER_ARCHIVE_PAUSED==='1'):null,merged=mergeComparison(items,recent,year);
    combined=merged.items;comparison=merged.comparison;
   }
   return result({archive,comparison,kind:'daily',items:combined,retrievedAt:entries.map(([,e])=>e.retrievedAt).sort().at(-1)||data.updatedAt,monthlyProvenance:entries.map(([month,e])=>({month,retrievedAt:e.retrievedAt,responseLocation:e.responseLocation,sourceUrls:e.sourceUrls,responseUnits:e.responseUnits}))},cors);
  }
  if(month&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)&&!year){
   const entry=data.months[month];if(!entry)return result({error:'This month has not been archived yet.',archive},cors,404);
   if(!entry.payloadKey.startsWith(ARCHIVE.prefix+'months/'+month+'/'))throw new Error('Invalid archive reference');
   const object=await env.WEATHER_ARCHIVE.get(entry.payloadKey);if(!object)return result({error:'Archived month temporarily unavailable'},cors,503);
   const payload=await object.json();return result({archive,kind:'hourly',items:payload.hourly,retrievedAt:payload.retrievedAt,monthlyProvenance:[{month,retrievedAt:payload.retrievedAt,responseLocation:payload.responseLocation,sourceUrls:payload.sourceUrls,responseUnits:payload.responseUnits}]},cors);
  }
  return result({error:'Choose one year or month.'},cors,400);
 }catch(_){return result({error:'Permanent archive temporarily unavailable; stored data has not been removed.'},cors,503);}
}

// Recent estimates are stored separately and never written over ERA5 payloads.
const recentKey='weather/v1/lilly-recent/daily.json',recentTTL=3600000;
const completeDay=d=>d&&['hi','lo','pcp'].every(k=>number(d[k])!=null);
function freshRecent(value){
 const age=Date.now()-Date.parse(value?.retrievedAt||'');
 return value?.version===1&&Array.isArray(value.items)&&value.end===shift(dateAt(Date.now()),-1)&&age>=0&&age<recentTTL;
}
export async function fetchRecent(){
 const today=dateAt(Date.now()),start=shift(today,-14),end=shift(today,-1);
 const query=new URLSearchParams({latitude:ARCHIVE.lat,longitude:ARCHIVE.lon,start_date:start,end_date:end,timezone:ARCHIVE.timezone,models:'best_match',temperature_unit:'celsius',precipitation_unit:'mm',wind_speed_unit:'mph',daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,showers_sum,wind_speed_10m_max,wind_gusts_10m_max'});
 const requestUrl='https://api.open-meteo.com/v1/forecast?'+query,j=await jsonFetch(requestUrl,10000);
 const fields={temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_sum:'mm',rain_sum:'mm',showers_sum:'mm',wind_speed_10m_max:'mp/h',wind_gusts_10m_max:'mp/h'};
 if(j.timezone!==ARCHIVE.timezone||!Array.isArray(j.daily?.time)||Object.entries(fields).some(([key,unit])=>j.daily_units?.[key]!==unit))throw new Error('Unexpected recent weather response');
 const seen=new Set(),items=[];
 j.daily.time.forEach((date,i)=>{
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>end||shift(date,0)!==date||seen.has(date))return;
  seen.add(date);const n=key=>number(j.daily[key]?.[i]),rain=n('rain_sum'),showers=n('showers_sum');
  const day={date,hi:n('temperature_2m_max'),lo:n('temperature_2m_min'),pcp:n('precipitation_sum'),rain:rain!=null&&showers!=null?rain+showers:null,wind:n('wind_speed_10m_max'),gust:n('wind_gusts_10m_max'),provisional:true};
  if(completeDay(day))items.push(day);
 });
 if(!items.length)throw new Error('Recent weather is unavailable');
 return {version:1,start,end,retrievedAt:new Date().toISOString(),provider:'Open-Meteo recent past-day forecasts',model:'best_match',units:'C',precipitationUnits:'mm',timezone:ARCHIVE.timezone,requestUrl,items:items.sort((a,b)=>a.date.localeCompare(b.date))};
}
async function storedRecent(bucket){try{const object=await bucket.get(recentKey);const value=object?await object.json():null;return value?.version===1&&Array.isArray(value.items)&&value.timezone===ARCHIVE.timezone?value:null;}catch(_){return null;}}
async function refreshRecent(bucket){
 const previous=await storedRecent(bucket);if(freshRecent(previous))return;
 const next=retainRecent(previous,await fetchRecent());
 await bucket.put(recentKey,JSON.stringify(next),{httpMetadata:{contentType:'application/json'}});
}
function retainRecent(previous,next){
 const map=new Map(next.items.map(d=>[d.date,d]));
 for(const day of previous?.items||[])if(day.date>=next.start&&day.date<=next.end&&completeDay(day)&&!map.has(day.date))map.set(day.date,day);
 return {...next,items:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
async function readRecent(bucket,paused=false){
 const saved=await storedRecent(bucket);if(paused)return {...(saved||{items:[]}),error:'Recent source updates are paused.'};if(freshRecent(saved))return saved;
 // Read-through fetch keeps visitors current even before the next cron tick.
 // Only the scheduler persists this separate cache; page views never mutate R2.
 try{return retainRecent(saved,await fetchRecent());}catch(_){return {...(saved||{items:[]}),error:'Recent estimates could not be refreshed; saved data is retained.'};}
}
export function mergeComparison(archived,recent,year){
 const cutoff=shift(dateAt(Date.now()),-1),map=new Map();
 for(const day of archived)if(day.date?.startsWith(year+'-')&&day.date<=cutoff)map.set(day.date,{...day,provisional:false});
 for(const day of recent?.items||[])if(day.date?.startsWith(year+'-')&&day.date<=cutoff&&day.date>=shift(dateAt(Date.now()),-14)&&completeDay(day)&&!completeDay(map.get(day.date)))map.set(day.date,{...day,provisional:true});
 const items=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)),provisional=items.filter(d=>d.provisional),confirmed=items.filter(d=>!d.provisional&&completeDay(d));
 return {items,comparison:{cutoff,latestAvailable:items.filter(completeDay).at(-1)?.date||null,era5Through:confirmed.at(-1)?.date||null,provisionalFrom:provisional[0]?.date||null,provisionalThrough:provisional.at(-1)?.date||null,provisionalCount:provisional.length,recentRetrievedAt:recent?.retrievedAt||null,recentError:recent?.error||null}};
}
