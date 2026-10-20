/* Garden check prompts; estimates and log dates do not measure root-zone moisture. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WateringGuidance=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const value=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const shift=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 const age=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);
 function analyze({plants=[],log=[],rainfall=[],days=[],settings={},today,rainAvailable=true,forecastAvailable=true}){
  const metric=settings.units==='C', factor=metric?1:25.4;
  const keys=Array.from({length:3},(_,i)=>shift(today,i-3));
  const recent=keys.map(date=>{const rows=rainfall.filter(r=>r.date===date);return {date,amount:rainAvailable&&rows.length===1?value(rows[0].amount):null};});
  const complete=recent.every(r=>r.amount!=null&&r.amount>=0);
  const total=complete?recent.reduce((sum,r)=>sum+r.amount,0):null;
  const upcoming=[today,shift(today,1)].map(date=>{const matches=days.filter(d=>d.date===date);const d=forecastAvailable&&matches.length===1?matches[0]:{};return {date,amount:value(d.pcp),probability:value(d.pop),high:value(d.hi),wind:value(d.wind)};});
  const futureComplete=upcoming.every(d=>d.amount!=null&&d.amount>=0&&d.probability!=null);
  const lowRain=complete&&futureComplete?total*factor<2.54&&upcoming.every(d=>d.amount*factor<2.54&&d.probability<40):null;
  const wet=upcoming.filter(d=>d.amount!=null&&d.amount*factor>=6.35&&d.probability!=null&&d.probability>=60);
  const lf=String(settings.lastFrost||'').slice(5,10),ff=String(settings.firstFrost||'').slice(5,10),md=today.slice(5);
  const seasonKnown=/^\d\d-\d\d$/.test(lf)&&/^\d\d-\d\d$/.test(ff)&&lf!==ff;
  const growing=seasonKnown?(lf<ff?md>=lf&&md<=ff:md>=lf||md<=ff):null;
  const hot=upcoming.some(d=>d.high!=null&&d.high>=(metric?29.444444:85));
  const windy=upcoming.some(d=>d.wind!=null&&d.wind>=20);
  const checks=[],recentlyLogged=[];
  for(const p of plants.filter(p=>!p.dead&&!p.wishlist)){
   const tags=String(p.tags||''),place=tags+' '+String(p.spot||'');
   const container=p.container===true||p.container==='true';
   const indoor=/\b(indoor|inside|houseplant|windowsill)\b/i.test(place);
   const sheltered=/\b(under cover|covered porch|under eaves|rain sheltered|greenhouse)\b/i.test(place);
   const moist=/\b(moisture-loving|moisture loving|keep moist)\b/i.test(tags);
   const drought=/\b(drought-tolerant|drought tolerant|succulent|cactus)\b/i.test(tags);
   const planted=String(p.planted||'').slice(0,10);
   const plantingAge=validDate(planted)&&planted<=today?age(planted,today):null;
   const firstYear=plantingAge!=null&&plantingAge<365,establishing=plantingAge!=null&&plantingAge<1095;
   if(!container&&!firstYear&&!moist&&!(establishing&&lowRain===true))continue;
   const entries=log.filter(e=>e.plantId===p.id&&e.action==='watered'&&validDate(String(e.date||''))&&e.date<=today).sort((a,b)=>b.date.localeCompare(a.date)||String(b.time||'').localeCompare(String(a.time||'')));
   const last=entries[0]?.date||null,since=last?age(last,today):null;
   const interval=indoor?7:growing===false?7:container?2:firstYear?3:4;
   const reasons=[];
   if(container)reasons.push('container');if(firstYear)reasons.push(`planted ${plantingAge} days ago`);else if(establishing)reasons.push('planted within three years');
   if(indoor)reasons.push('recorded indoor location/tag');if(sheltered)reasons.push('recorded rain shelter');if(moist)reasons.push('tagged moisture-loving');if(drought)reasons.push('tagged drought-tolerant / succulent');
   const advice=drought?'Let the mix dry as appropriate for this plant; avoid watering on a calendar.':container?'Check the potting mix before adding water; rain may not reach or soak the pot.':firstYear?'Check the root ball and surrounding soil; rainfall may miss a newly planted root ball.':'Check below the surface and water only if the root zone needs it.';
   const item={id:p.id,name:p.name||'Unnamed plant',reasons,lastWatered:last,since,advice,interval};
   if(since!=null&&since<interval){recentlyLogged.push(item);continue;}
   if(growing===false&&!indoor&&!container&&!moist&&lowRain!==true)continue;
   if(since==null&&!container&&!firstYear&&!moist&&lowRain!==true)continue;
   if(!indoor&&(hot||windy))reasons.push('warm / windy forecast may speed drying');
   checks.push(item);
  }
  checks.sort((a,b)=>(b.since??999)-(a.since??999)||a.name.localeCompare(b.name));
  return {recent,total,complete,upcoming,futureComplete,lowRain,wet,growing,hot,windy,checks,recentlyLogged};
 }
 return {analyze};
});
