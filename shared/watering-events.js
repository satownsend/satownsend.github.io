/* Recorded watering actions only; never converts a log into rainfall volume. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WateringEvents=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function validDate(date){
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
    const [year,month,day]=date.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0);
    return year>=1&&month>=1&&month<=12&&day>=1&&day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
  }
  function collect(log,plants,today){
    const names=new Map((Array.isArray(plants)?plants:[]).map(p=>[p.id,p.name])),seen=new Set(),records=[];
    for(const entry of Array.isArray(log)?log:[]){
      if(String(entry?.action||'').trim().toLowerCase()!=='watered'||!validDate(entry.date)||(today&&entry.date>today))continue;
      if(entry.id&&seen.has(entry.id))continue;
      if(entry.id)seen.add(entry.id);
      records.push({date:entry.date,name:entry.plantId?String(names.get(entry.plantId)||'Plant no longer in inventory'):'Yard-wide',time:String(entry.time||''),note:String(entry.note||'')});
    }
    return records.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
  }
  function byDate(records){const grouped=new Map();for(const entry of records){if(!grouped.has(entry.date))grouped.set(entry.date,[]);grouped.get(entry.date).push(entry);}return grouped;}
  return {validDate,collect,byDate};
});
