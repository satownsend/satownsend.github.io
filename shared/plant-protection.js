/* Hourly prediction context, not an official warning or a plant hardiness model. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;else root.PlantProtection=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const HOUR=3600000;
  const number=v=>v==null || v==='' || !Number.isFinite(Number(v))?null:Number(v);
  function local(time,timezone){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time));
    const get=k=>parts.find(p=>p.type===k).value;
    return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};
  }
  function shift(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function targets(plants,now,timezone){
    const today=local(now,timezone).date;
    return (plants||[]).filter(p=>!p.dead && !p.wishlist).flatMap(p=>{
      const reasons=[];
      if(/\b(tender|tropical|citrus|frost sensitive|frost-sensitive)\b/i.test(p.tags||''))reasons.push('tagged tender / tropical / citrus');
      if(p.container===true || p.container==='true')reasons.push('container');
      if(/japanese maple|acer palmatum|acer japonicum|acer shirasawanum/i.test(`${p.name||''} ${p.type||''}`))reasons.push('Japanese maple — check for exposed new growth');
      const planted=String(p.planted||'').slice(0,10);
      if(/tree/i.test(p.category||'') && /^\d{4}-\d{2}-\d{2}$/.test(planted) && planted<=today && planted>=shift(today,-365))reasons.push('tree planted within the past year');
      return reasons.length?[{id:p.id||'',name:p.name||'Unnamed plant',reasons}]:[];
    });
  }
  function analyze(hourly,units,timezone,now=Date.now()){
    const threshold=units==='C'?20/9:36,freeze=units==='C'?0:32;
    const groups=new Map(), seen=new Set();
    for(const h of [...(hourly||[])].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time))){
      const ms=Date.parse(h.time);if(!Number.isFinite(ms)||ms<Math.floor(now/HOUR)*HOUR||seen.has(ms))continue;seen.add(ms);
      const {date,hour}=local(ms,timezone);if(hour>10 && hour<18)continue;
      const night=hour<=10?shift(date,-1):date;
      if(!groups.has(night))groups.set(night,[]);
      groups.get(night).push({...h,ms,temp:number(h.temp),wind:number(h.wind),gust:number(h.gust)});
    }
    return [...groups].map(([night,samples])=>{
      const known=samples.filter(s=>s.temp!=null);
      const coldest=known.reduce((a,s)=>!a||s.temp<a.temp?s:a,null);
      const windows=limit=>{
        const result=[];let current=null;
        let previous=null;
        for(const s of samples){
          if(s.temp==null || s.temp>limit){
            if(current && s.temp!=null && s.ms-Date.parse(current.end)===HOUR)current.exit={from:current.end,to:s.time};
            current=null;previous=s;continue;
          }
          if(!current || s.ms-Date.parse(current.end)!==HOUR){
            current={start:s.time,end:s.time,hours:0,samples:1,
              entry:previous?.temp!=null && previous.temp>limit && s.ms-previous.ms===HOUR?{from:previous.time,to:s.time}:null};result.push(current);
          } else{current.hours++;current.samples++;current.end=s.time;}
          previous=s;
        }
        return result;
      };
      // A full night has endpoints at local 18:00 and 10:00, including DST's real elapsed hours.
      const first=samples[0],last=samples[samples.length-1];
      const complete=local(first.ms,timezone).hour===18 && local(last.ms,timezone).hour===10 && samples.every((s,i)=>s.temp!=null && (!i||s.ms-samples[i-1].ms===HOUR));
      const max=key=>{const a=samples.map(s=>s[key]).filter(v=>v!=null);return a.length?Math.max(...a):null;};
      return {night,morning:shift(night,1),complete,knownHours:known.length,coldest:coldest?{time:coldest.time,temp:coldest.temp}:null,
        frost:windows(threshold),freeze:windows(freeze),wind:max('wind'),gust:max('gust')};
    });
  }
  function context(hourly,units,timezone,plants,now=Date.now()){
    return {version:1,kind:'hourly-prediction',analyzedAt:new Date(now).toISOString(),timezone,
      thresholds:{frost:units==='C'?20/9:36,freeze:units==='C'?0:32},
      nights:analyze(hourly,units,timezone,now),targets:targets(plants,now,timezone)};
  }
  function time(value,timezone){return new Date(value).toLocaleString(undefined,{timeZone:timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
  function windowText(w,timezone){
    const span=w.hours?`${time(w.start,timezone)} → ${time(w.end,timezone)} (~${w.hours}h between cold samples)`:`${time(w.start,timezone)} (one cold sample; duration unknown)`;
    return span + (w.entry?`; falls through threshold between ${time(w.entry.from,timezone)} and ${time(w.entry.to,timezone)}`:'; onset not bounded by available hours') +
      (w.exit?`; rises above between ${time(w.exit.from,timezone)} and ${time(w.exit.to,timezone)}`:'; end not bounded by available hours');
  }
  function describe(n,units,timezone){
    const u=`°${units}`,f=units==='C'?'2.2':'36',z=units==='C'?'0':'32';
    const lines=[];
    if(n.frost.length)lines.push(`Frost-risk range (≤${f}${u}): ${n.frost.map(w=>windowText(w,timezone)).join('; ')}.`);
    if(n.freeze.length)lines.push(`At/below freezing (≤${z}${u}): ${n.freeze.map(w=>windowText(w,timezone)).join('; ')}.`);
    if(n.coldest)lines.push(`Coldest available hour: ${n.coldest.temp.toFixed(1)}${u} at ${time(n.coldest.time,timezone)}.`);
    if(!n.complete)lines.push('Partial overnight coverage: missing or elapsed hours are not treated as safe; risk may start earlier or end later.');
    if(n.wind!=null||n.gust!=null)lines.push(`Overnight sustained wind ${n.wind==null?'unavailable':Math.round(n.wind)+' mph'}; gusts ${n.gust==null?'unavailable':Math.round(n.gust)+' mph'}.`);
    return lines.join(' ');
  }
  return {analyze,targets,context,time,windowText,describe};
});
