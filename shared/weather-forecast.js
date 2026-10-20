/* Pure normalization for the Plants forecast. All absent measurements stay null. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api; else root.WeatherForecast=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const number=v=>v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  const max=values=>{const valid=values.map(number).filter(v=>v!=null);return valid.length?Math.max(...valid):null;};
  function dateKey(time,timezone='UTC'){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
    const get=type=>parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function shiftDate(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function windMph(text){
    if(/^calm$/i.test(String(text).trim()))return 0;
    const m=String(text||'').match(/(\d+(?:\.\d+)?)\s*(?:to\s*(\d+(?:\.\d+)?))?\s*(mph|km\/h|m\/s|kt)/i);
    return m ? Number(m[2]||m[1])*({mph:1,'km/h':0.621371,'m/s':2.23694,kt:1.15078}[m[3].toLowerCase()]) : null;
  }
  function nwsDaily(periods,units){
    const dates=new Map();
    for(const p of periods){const date=String(p.startTime||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;if(!dates.has(date))dates.set(date,[]);dates.get(date).push(p);}
    const daily={time:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_sum:[],precipitation_probability_max:[],wind_speed_10m_max:[],wind_gusts_10m_max:[]};
    for(const [date,items] of [...dates].slice(0,7)){
      const temps=items.map(p=>{let t=number(p.temperature);if(t==null)return null;if(units==='C' && p.temperatureUnit!=='C')t=(t-32)*5/9;else if(units!=='C' && p.temperatureUnit==='C')t=t*9/5+32;return t;}).filter(v=>v!=null);
      daily.time.push(date);daily.temperature_2m_max.push(max(temps));daily.temperature_2m_min.push(temps.length?Math.min(...temps):null);
      daily.precipitation_sum.push(null);daily.precipitation_probability_max.push(max(items.map(p=>p.probabilityOfPrecipitation?.value)));
      daily.wind_speed_10m_max.push(max(items.map(p=>windMph(p.windSpeed))));daily.wind_gusts_10m_max.push(null);
    }
    return daily;
  }
  function validDaily(d){return Array.isArray(d?.time) && d.time.length>0 && d.time.some((_,i)=>number(d.temperature_2m_max?.[i])!=null || number(d.temperature_2m_min?.[i])!=null);}
  function openMeteo(json){
    const timezone=json.timezone || 'UTC';dateKey(Date.now(),timezone); // Validate the IANA name before persisting it.
    const d=json.daily;
    if(!validDaily(d))throw new Error('Open-Meteo daily forecast unavailable');
    const keys=['temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_speed_10m_max','wind_gusts_10m_max'];
    const daily={time:d.time.map(t=>{
      // Daily Unix dates use the API's resolved offset. Hourly instants below use IANA conversion, including DST.
      return typeof t==='number' ? new Date((t+(json.utc_offset_seconds||0))*1000).toISOString().slice(0,10) : String(t).slice(0,10);
    })};
    for(const key of keys)daily[key]=d.time.map((_,i)=>number(d[key]?.[i]));
    const h=json.hourly||{};
    const hourly=(h.time||[]).map((t,i)=>{
      // Require absolute Unix timestamps; never parse timezone-less local strings in the viewer's timezone.
      if(typeof t!=='number' || !Number.isFinite(t))return null;
      const time=new Date(t*1000).toISOString();
      return {time,date:dateKey(t*1000,timezone),temp:number(h.temperature_2m?.[i]),pop:number(h.precipitation_probability?.[i]),pcp:number(h.precipitation?.[i]),wind:number(h.wind_speed_10m?.[i]),gust:number(h.wind_gusts_10m?.[i])};
    }).filter(Boolean).sort((a,b)=>a.time.localeCompare(b.time));
    return {daily,hourly,timezone};
  }
  function combine(nws,meteo,fallbackTimezone='UTC'){
    if(!validDaily(nws) && !validDaily(meteo?.daily))throw new Error('No forecast provider available');
    const daily={time:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_sum:[],precipitation_probability_max:[],wind_speed_10m_max:[],wind_gusts_10m_max:[],sources:[]};
    const time=[...new Set([...(nws?.time||[]),...(meteo?.daily?.time||[])])].filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t)).sort().slice(0,7);
    for(const date of time){
      const ni=nws?.time.indexOf(date)??-1, mi=meteo?.daily?.time.indexOf(date)??-1;
      const choose=(key,preferNws=false)=>{
        const nv=number(nws?.[key]?.[ni]), mv=number(meteo?.daily?.[key]?.[mi]);
        return preferNws && nv!=null ? [nv,'nws'] : mv!=null ? [mv,'open-meteo'] : nv!=null ? [nv,'nws'] : [null,null];
      };
      const sources={};daily.time.push(date);
      for(const [key,label] of [['temperature_2m_max','high'],['temperature_2m_min','low'],['precipitation_sum','precipitation'],['precipitation_probability_max','probability'],['wind_speed_10m_max','wind'],['wind_gusts_10m_max','gust']]){
        const [value,source]=choose(key,key.startsWith('temperature_'));daily[key].push(value);sources[label]=source;
      }
      daily.sources.push(sources);
    }
    return {daily,hourly:meteo?.hourly||[],timezone:meteo?.timezone||fallbackTimezone,source:validDaily(nws)?validDaily(meteo?.daily)?'nws+open-meteo':'nws':'open-meteo'};
  }
  function days(daily){return daily.time.map((date,i)=>({date,hi:number(daily.temperature_2m_max?.[i]),lo:number(daily.temperature_2m_min?.[i]),pop:number(daily.precipitation_probability_max?.[i]),pcp:number(daily.precipitation_sum?.[i]),wind:number(daily.wind_speed_10m_max?.[i]),gust:number(daily.wind_gusts_10m_max?.[i]),sources:daily.sources?.[i]||{}}));}
  function total(values){return values.length && values.every(v=>number(v)!=null) ? values.reduce((sum,v)=>sum+Number(v),0) : null;}
  function format(value,suffix='',digits=0){return number(value)==null ? 'unavailable' : `${Number(value).toFixed(digits)}${suffix}`;}
  function provider(source){return source==='nws'?'NWS':source==='open-meteo'?'Open-Meteo':source==='nws+open-meteo'?'NWS + Open-Meteo':'Unavailable';}
  function summary(day,units){const u=`°${units}`,pu=units==='C'?'mm':'in';return `High ${format(day.hi,u)} · Low ${format(day.lo,u)} · Precipitation ${format(day.pcp,' '+pu,2)} · Chance ${format(day.pop,'%')} · Sustained wind ${format(day.wind,' mph')} · Gusts ${format(day.gust,' mph')}`;}
  return {number,max,dateKey,shiftDate,windMph,nwsDaily,validDaily,openMeteo,combine,days,total,format,provider,summary};
});
