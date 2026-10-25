/* One pre-day prediction per calendar date. Never infer observations from forecasts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WeatherCalendar=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const key=s=>`${s.location.lat},${s.location.lon}|${s.units}`;
 function dateAt(time,timezone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
 function zone(s){try{dateAt(s.capturedAt,s.timezone||'UTC');return s.timezone||'UTC';}catch(_){return 'UTC';}}
 function groups(history){const map=new Map();for(const s of [...history].sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt)))if(!map.has(key(s)))map.set(key(s),{key:key(s),name:s.location.name||`${s.location.lat}, ${s.location.lon}`,units:s.units,timezone:zone(s),lat:s.location.lat,lon:s.location.lon});return [...map.values()];}
 function index(history,group){
  const selected=new Map();if(!group)return selected;
  for(const s of [...history].filter(s=>key(s)===group.key).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt))){
   const capturedDate=dateAt(s.capturedAt,group.timezone);
   for(const day of s.days){if(/^\d{4}-\d{2}-\d{2}$/.test(day.date)&&capturedDate<day.date&&!selected.has(day.date))selected.set(day.date,{snapshot:s,day,capturedDate,leadDays:Math.round((Date.parse(day.date+'T12:00:00Z')-Date.parse(capturedDate+'T12:00:00Z'))/86400000)});}
  }
  return selected;
 }
 function flags(entry,timezone){
  if(!entry)return [];
  const {day:d,snapshot:s}=entry,metric=s.units==='C';const flags=[];
  if(d.lo!=null&&d.lo<=(metric?20/9:36))flags.push('frost');
  if(d.hi!=null&&d.hi>=(metric?31:88))flags.push('heat');
  if((d.wind!=null&&d.wind>=25)||(d.gust!=null&&d.gust>=35))flags.push('wind');
  if(s.alertsAvailable&&(s.alerts||[]).some(a=>Number.isFinite(Date.parse(a.effective))&&Number.isFinite(Date.parse(a.expires))&&Date.parse(a.expires)>Date.parse(a.effective)&&dateAt(a.effective,timezone)<=d.date&&dateAt(Date.parse(a.expires)-1,timezone)>=d.date))flags.push('official');
  return flags;
 }
 // Fahrenheit bands are shared by saved forecasts, reanalysis and comparisons.
 const temperatureBands=[
  {max:10,key:'deep-cold',label:'10°F and below'},
  {max:20,key:'cold',label:'10–20°F'},
  {max:32,key:'freezing',label:'20–32°F'},
  {max:50,key:'cool',label:'32–50°F'},
  {max:70,key:'mild',label:'50–70°F'},
  {max:85,key:'warm',label:'70–85°F'},
  {max:95,key:'hot',label:'85–95°F'},
  {max:Infinity,key:'extreme-hot',label:'Above 95°F'}
 ];
 function temperatureF(f){return typeof f==='number'&&Number.isFinite(f)?temperatureBands.find(b=>f<=b.max).key:'unknown';}
 function temperatureLegend(){return temperatureBands.map((b,i)=>`<span class="wc-${b.key}" title="${i===0?'10°F and below':b.max===Infinity?'Above 95°F':`Above ${temperatureBands[i-1].max}°F through ${b.max}°F (inclusive)`}">${b.label}</span>`).join('');}
 function temperature(entry){if(!entry||entry.day.hi==null)return 'unknown';return temperatureF(entry.snapshot.units==='C'?entry.day.hi*9/5+32:entry.day.hi);}

 return {key,dateAt,groups,index,flags,temperature,temperatureF,temperatureLegend};
});
