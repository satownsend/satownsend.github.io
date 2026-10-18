/* Pure data preparation shared by the annual recap and its regression checks. */
(function(root){
  function truthy(value){ return value === true || String(value).toLowerCase() === 'true'; }
  function date(value){
    const text = String(value || '').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    const parsed = new Date(text + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === text ? text : '';
  }
  function parseCSV(text){
    const rows=[]; let row=[], cell='', quoted=false;
    text = text.replace(/^\uFEFF/, '');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){ if(c==='"' && text[i+1]==='"'){cell+='"';i++;} else if(c==='"')quoted=false; else cell+=c; }
      else if(c==='"')quoted=true;
      else if(c===','){row.push(cell);cell='';}
      else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n')i++; row.push(cell); if(row.some(Boolean))rows.push(row);row=[];cell=''; }
      else cell+=c;
    }
    if(quoted) throw new Error('Incomplete CSV');
    row.push(cell);if(row.some(Boolean))rows.push(row);
    const headers=rows.shift()||[];
    return rows.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]||''])));
  }
  function build(data, today){
    const available = value => { const d=date(value);return d && d<=today ? d : ''; };
    const plants=(data.plants||[]).filter(p=>p.id && !truthy(p.wishlist));
    const byPlant=new Map(plants.map(p=>[p.id,p]));
    const sightings=(data.sightings||[]).filter(s=>s.id && s.species && available(s.date)).map(s=>({...s,date:available(s.date)}));
    const bySighting=new Map(sightings.map(s=>[s.id,s]));
    const photos=[], seen=new Set();
    function add(photo,kind,item){
      const d=available(photo.date || (kind==='wildlife' ? item?.date : ''));
      if(!item || !photo.key || !d || truthy(photo.hideFromGallery) || /\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(photo.key) || seen.has(photo.key))return;
      seen.add(photo.key);
      photos.push({id:kind+':'+photo.key,key:photo.key,date:d,kind,name:kind==='plants'?item.name:item.species,recordId:kind==='plants'?item.id:item.species,caption:photo.caption||'',location:kind==='plants'?item.spot:item.location});
    }
    for(const photo of data.plantPhotos||[])add(photo,'plants',photo.plant_id==='yard'?null:byPlant.get(photo.plant_id));
    for(const photo of data.wildlifePhotos||[])add(photo,'wildlife',bySighting.get(photo.sighting_id));
    photos.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    const events=(data.log||[]).filter(e=>byPlant.has(e.plantId||e.plant_id)&&available(e.date)).map(e=>({...e,plantId:e.plantId||e.plant_id,date:available(e.date),plant:byPlant.get(e.plantId||e.plant_id)}));
    const planted=plants.filter(p=>available(p.planted)).map(p=>({...p,planted:available(p.planted)}));
    const years=[...new Set([...photos.map(p=>p.date),...events.map(e=>e.date),...sightings.map(s=>s.date),...planted.map(p=>p.planted)].map(d=>Number(d.slice(0,4))))].sort((a,b)=>b-a);
    return {photos,events,sightings,planted,years};
  }
  function highlights(photos,limit=6){
    const groups=new Map();
    for(const photo of photos){const key=photo.kind+':'+photo.recordId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(photo);}
    const candidates=[...groups.values()].map(group=>group[Math.floor(group.length/2)]).sort((a,b)=>a.date.localeCompare(b.date));
    const count=Math.min(limit,candidates.length),chosen=[];
    for(let i=0;i<count;i++)chosen.push(candidates[count===1?0:Math.round(i*(candidates.length-1)/(count-1))]);
    const visitor=candidates.find(p=>p.kind==='wildlife');
    if(visitor&&chosen.length&&!chosen.some(p=>p.kind==='wildlife'))chosen[chosen.length-1]=visitor;
    return chosen.sort((a,b)=>a.date.localeCompare(b.date));
  }
  const seasons=[{name:'Winter',months:[1,2,12],range:'January–February & December',blurb:'The quiet days, kept in pictures.'},{name:'Spring',months:[3,4,5],range:'March–May',blurb:'A season of fresh starts.'},{name:'Summer',months:[6,7,8],range:'June–August',blurb:'Long days and a growing collection of moments.'},{name:'Autumn',months:[9,10,11],range:'September–November',blurb:'Color, texture, and the turn of the year.'}];
  function recap(state,year){
    const inYear=d=>Number(d.slice(0,4))===year;
    const photos=state.photos.filter(p=>inYear(p.date)), events=state.events.filter(e=>inYear(e.date)), sightings=state.sightings.filter(s=>inYear(s.date));
    const chapters=seasons.map(s=>({...s,photos:photos.filter(p=>s.months.includes(Number(p.date.slice(5,7)))),events:events.filter(e=>s.months.includes(Number(e.date.slice(5,7)))),sightings:sightings.filter(e=>s.months.includes(Number(e.date.slice(5,7))))}));
    const visitors=[...new Set(sightings.map(s=>s.species))].map(species=>{const records=sightings.filter(s=>s.species===species).sort((a,b)=>a.date.localeCompare(b.date));return {species,count:records.length,first:records[0].date,photo:photos.find(p=>p.kind==='wildlife'&&p.name===species)};}).sort((a,b)=>b.count-a.count||a.species.localeCompare(b.species));
    const comparisons=[];
    for(const id of new Set(photos.filter(p=>p.kind==='plants').map(p=>p.recordId))){
      const group=photos.filter(p=>p.kind==='plants'&&p.recordId===id),first=group[0],last=group[group.length-1];
      const days=(new Date(last.date)-new Date(first.date))/86400000;
      if(days>=30) comparisons.push({name:first.name,first,last,days});
    }
    comparisons.sort((a,b)=>b.days-a.days||a.name.localeCompare(b.name));
    const groups=new Map();
    for(const event of events){
      if(event.action!=='trunk measurement'||!Number.isFinite(Number(event.value))||String(event.value||'').trim()===''||Number(event.value)<=0)continue;
      const point=(event.note||'').trim().replace(/\s+/g,' ').toLowerCase();
      const key=event.plantId+'|'+point;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event);
    }
    const measurements=[...groups.values()].map(group=>{
      group.sort((a,b)=>a.date.localeCompare(b.date));const first=group[0],last=group[group.length-1];
      const delta=(last.note||'').trim()&&first.date!==last.date?Number(last.value)-Number(first.value):null;
      return {name:last.plant.name,point:last.note||'Measurement point not noted',first,last,delta};
    });
    return {year,photos,events,sightings,chapters,visitors,comparisons,measurements,newPlantings:state.planted.filter(p=>inYear(p.planted)),plantsPhotographed:new Set(photos.filter(p=>p.kind==='plants').map(p=>p.recordId)).size};
  }
  const api={parseCSV,date,build,recap,seasons,highlights};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BackyardYear=api;
})(typeof window==='undefined'?globalThis:window);
