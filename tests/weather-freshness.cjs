const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=Date.parse('2026-10-27T16:00:00Z'),fail=false,providerCalls=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const day=(date,value=10)=>({date,hi:value,lo:1,pcp:2,rain:2,wind:4,gust:null});
function fixture(){
 const end=new Clock(now-86400000).toISOString().slice(0,10),start=new Clock(now-14*86400000).toISOString().slice(0,10),dates=[];
 for(let t=Date.parse(start+'T12:00:00Z');t<=Date.parse(end+'T12:00:00Z');t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
 return {timezone:'America/New_York',daily_units:{temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_sum:'mm',rain_sum:'mm',showers_sum:'mm',wind_speed_10m_max:'mp/h',wind_gusts_10m_max:'mp/h'},daily:{time:[...dates,end,new Clock(now).toISOString().slice(0,10)],temperature_2m_max:dates.map(()=>15).concat([20,99]),temperature_2m_min:dates.map(()=>5).concat([1,99]),precipitation_sum:dates.map(()=>2).concat([99,99]),rain_sum:dates.map(()=>1).concat([99,99]),showers_sum:dates.map(()=>1).concat([0,0]),wind_speed_10m_max:dates.map(()=>4).concat([99,99]),wind_gusts_10m_max:dates.map(()=>7).concat([99,99])}};
}
const store=new Map(),writes=[];
const bucket={async get(key){const data=store.get(key);return data?{etag:'old',json:async()=>structuredClone(data)}:null},async put(key,value){writes.push(key);store.set(key,JSON.parse(value));return {etag:'new'}}};
const c={Date:Clock,Intl,URL,URLSearchParams,Headers,Response,AbortController,setTimeout,clearTimeout,console,crypto:require('node:crypto').webcrypto,fetch:async url=>{providerCalls++;assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'));if(fail)throw Error('provider down');return {ok:true,json:async()=>fixture()}}};
vm.createContext(c);vm.runInContext(fs.readFileSync('chatbot-worker/src/weather-archive.js','utf8').replace(/^export /gm,''),c);
(async()=>{
 const recent=await c.fetchRecent();assert.equal(recent.end,'2026-10-26');assert.equal(recent.items.length,14);assert.ok(recent.items.every(d=>d.date<'2026-10-27'));assert.equal(recent.items.at(-1).rain,2);
 let result=c.mergeComparison([day('2026-10-20',30),day('2026-10-21',31)],recent,'2026');
 assert.equal(result.items.find(d=>d.date==='2026-10-20').hi,30);assert.equal(result.items.find(d=>d.date==='2026-10-20').provisional,false);assert.equal(result.items.at(-1).provisional,true);assert.equal(result.comparison.latestAvailable,'2026-10-26');assert.equal(result.comparison.provisionalFrom,'2026-10-13');
 // A later ERA5 revision wins wholesale over the provisional row.
 result=c.mergeComparison([day('2026-10-26',40)],recent,'2026');assert.equal(result.items.at(-1).hi,40);assert.equal(result.items.at(-1).provisional,false);
 result=c.mergeComparison([{...day('2026-10-26'),pcp:null}],recent,'2026');assert.equal(result.items.at(-1).provisional,true);
 // Recent data cannot backfill old gaps, fabricate today, or leak other years.
 result=c.mergeComparison([day('2025-10-20')],recent,'2025');assert.equal(result.items.length,1);assert.equal(result.comparison.provisionalCount,0);
 result=c.mergeComparison([], {...recent,items:[day('2026-10-01'),day('2026-10-27'),{...day('2026-10-26'),pcp:null}]},'2026');assert.equal(result.items.length,0);
 await c.refreshRecent(bucket);assert.ok(writes.includes('weather/v1/lilly-recent/daily.json'));const calls=providerCalls;await c.refreshRecent(bucket);assert.equal(providerCalls,calls);
 fail=true;now+=2*3600000;const fallback=await c.readRecent(bucket);assert.equal(fallback.items.at(-1).date,'2026-10-26');assert.ok(fallback.error);const beforePause=providerCalls;await c.readRecent(bucket,true);assert.equal(providerCalls,beforePause);fail=false;
 // Plain archive reads remain ERA5-only; opt-in comparison reads add recent data.
 const config=vm.runInContext('ARCHIVE',c);
 store.set(config.prefix+'manifest.json',{version:1,config,months:{'2026-10':{daily:[day('2026-10-20',30)],through:'2026-10-20',retrievedAt:'2026-10-27T01:00:00Z'}}});
 let response=await c.archiveResponse(new Request('https://worker/weather-archive?year=2026'),{WEATHER_ARCHIVE:bucket},{}),json=await response.json();assert.equal(json.items.length,1);assert.equal(json.comparison,null);
 const writeCount=writes.length;
 response=await c.archiveResponse(new Request('https://worker/weather-archive?year=2026&recent=1'),{WEATHER_ARCHIVE:bucket},{});json=await response.json();assert.equal(json.comparison.latestAvailable,'2026-10-26');assert.equal(writes.length,writeCount);assert.equal(json.items.find(d=>d.date==='2026-10-20').hi,30);
 // Old-year requests don't call the recent provider.
 const oldCalls=providerCalls;await c.archiveResponse(new Request('https://worker/weather-archive?year=2025&recent=1'),{WEATHER_ARCHIVE:bucket},{});assert.equal(providerCalls,oldCalls);
 now=Date.parse('2027-01-01T16:00:00Z');const january=await c.fetchRecent();assert.equal(january.end,'2026-12-31');assert.equal(c.mergeComparison([],january,'2026').comparison.latestAvailable,'2026-12-31');assert.equal(c.mergeComparison([],january,'2027').items.length,0);
 now=Date.parse('2026-11-02T16:00:00Z');const dst=await c.fetchRecent();assert.equal(dst.end,'2026-11-01');assert.equal(dst.items.length,14);
 // Client conversion/caching separates mixed comparison data from canonical reads.
 now=Date.parse('2026-10-27T16:00:00Z');let requests=0,lastUrl='';
 const context={Date:Clock,Intl,URLSearchParams,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}},fetch:async url=>{requests++;lastUrl=url;return new Response(JSON.stringify({archive:{latestAvailable:'2026-10-20'},comparison:{cutoff:'2026-10-26',latestAvailable:'2026-10-26'},kind:'daily',items:[{...day('2026-10-26',10),provisional:true}],retrievedAt:'2026-10-20T12:00:00Z'}))}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('shared/historical-weather.js','utf8'),context);const api=context.HistoricalWeather;
 const loc={lat:40.4238,lon:-78.6231,units:'F',timezone:'America/New_York'},selection=api.context(loc,2026,'archive_era5');
 const data=await api.loadComparison(selection);assert.ok(lastUrl.includes('recent=1'));assert.equal(data.items[0].hi,50);assert.equal(data.items[0].provisional,true);assert.equal(api.peek(selection),null);assert.equal(api.stale(data),false);
 await api.loadComparison(selection);assert.equal(requests,1);now+=16*60000;assert.equal(api.stale(data),true);await api.loadComparison(selection);assert.equal(requests,2);
 now=Date.parse('2026-10-28T04:01:00Z');assert.equal(api.stale({...data,checkedAt:new Clock().toISOString()}),true);
 // The archive revisits a current month later on the same local day.
 now=Date.parse('2026-10-27T16:00:00Z');
 const oldPayload=config.prefix+'months/2026-10/previous.json';
 store.set(oldPayload,{daily:[day('2026-10-20')],hourly:[]});
 store.set(config.prefix+'manifest.json',{version:1,config,months:{'2026-10':{payloadKey:oldPayload,daily:[day('2026-10-20')],through:'2026-10-20',checkedDate:'2026-10-27',retrievedAt:'2026-10-27T10:00:00Z'}}});
 let refreshedMonth='';c.fetchMonth=async(month,cutoff)=>{refreshedMonth=month;assert.equal(cutoff,'2026-10-22');return {daily:[day('2026-10-20'),day('2026-10-21')],hourly:[],through:'2026-10-21',retrievedAt:new Clock().toISOString()}};
 await c.updateArchive({WEATHER_ARCHIVE:bucket});assert.equal(refreshedMonth,'2026-10');
 assert.equal(store.get(config.prefix+'manifest.json').months['2026-10'].through,'2026-10-21');
 console.log('PASS weather freshness: provider validation, ERA5 precedence, provisional merge, no future/old-gap filling, cache/pause/failure behavior, year/DST boundaries, units and refresh expiry');
})().catch(e=>{console.error(e);process.exitCode=1});
