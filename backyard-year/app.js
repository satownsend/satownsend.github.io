(() => {
  const Model=window.BackyardYear, $=selector=>document.querySelector(selector);
  const R2='https://pub-59a926166fd84970bea75caf38a52d27.r2.dev';
  const PLANTS='1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM', WILDLIFE='1Uq2Fgzron3yDZqYFWsUx1cYigp4w8GmQP2pmk33DG54';
  const sources=[['plants',PLANTS,0,'Plant inventory'],['plantPhotos',PLANTS,396120968,'Plant photos'],['log',PLANTS,322094770,'Plant journal'],['sightings',WILDLIFE,0,'Wildlife observations'],['wildlifePhotos',WILDLIFE,518293746,'Wildlife photos']];
  const now=new Date(), currentYear=now.getFullYear();
  const today=`${currentYear}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const imageURL=key=>R2+'/'+key.split('/').map(encodeURIComponent).join('/');
  const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
  let state=null, year=currentYear, failures=new Set(), visible={}, favorites=new Set(), pending=false;
  const allPhotos=new Map();
  function sourceLink(photo){return photo.kind==='plants'?'/plants/':'/wildlife/';}
  function photoButton(photo){return `<button type="button" class="photo-open" data-photo="${esc(photo.id)}" aria-label="View ${esc(photo.name)} photo from ${esc(photo.date)}"><img src="${esc(imageURL(photo.key+'.thumb.jpg'))}" data-original="${esc(imageURL(photo.key))}" alt="${esc(photo.name)}" loading="lazy" decoding="async"><strong>${esc(photo.name||'Backyard moment')}</strong><small>${esc(fmt(photo.date))}${photo.location?' · '+esc(photo.location):''}</small></button>`;}
  function photoCard(photo){return `<article class="photo-card">${photoButton(photo)}<div class="photo-meta"><span>${photo.kind==='plants'?'Plant journal':'Wildlife'}</span><button class="favorite-button" type="button" data-favorite="${esc(photo.id)}" aria-label="Favorite ${esc(photo.name)} photo from ${esc(photo.date)}" aria-pressed="${favorites.has(photo.id)}">${favorites.has(photo.id)?'★ Saved':'☆ Favorite'}</button></div></article>`;}
  function loadFavorites(){
    try { const saved=JSON.parse(localStorage.getItem('satownsend.backyardFavorites.'+year)||'[]');favorites=new Set(Array.isArray(saved)?saved.filter(id=>typeof id==='string'):[]); }
    catch(_){favorites=new Set();}
  }
  function favoriteShelf(){
    const chosen=state.photos.filter(p=>Number(p.date.slice(0,4))===year&&favorites.has(p.id));
    $('#favoriteShelf').innerHTML=chosen.length?`<div class="photo-grid-year">${chosen.map(photoCard).join('')}</div>`:'<p class="empty-state">Choose ☆ Favorite beneath a photo to keep it here. Your choices are saved in this browser; the year link shares the public recap.</p>';
    $('#favoriteCount').textContent=chosen.length?`${chosen.length} saved photo${chosen.length===1?'':'s'}`:'A collection of your own';
  }
  function sectionHeading(kicker,title,description){return `<div class="section-heading"><div><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}</h2></div><p>${esc(description)}</p></div>`;}
  function metric(value,label){return `<div><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;}
  function chapterMarkup(chapter,index){
    const limit=visible[index]||6, lead=Model.highlights(chapter.photos);
    const ordered=[...lead,...chapter.photos.filter(photo=>!lead.includes(photo))],photos=ordered.slice(0,limit);
    const milestones=chapter.events.filter(e=>['planted','repotted','moved','trunk measurement','frost damage'].includes(e.action)).slice(0,4);
    return `<section class="recap-section" id="season-${index}"><div class="section-heading"><div><span class="chapter-number">0${index+1} / ${esc(chapter.range)}</span><h2>${esc(chapter.name)}</h2><p>${esc(chapter.blurb)}</p></div><p>${chapter.photos.length} photos · ${chapter.sightings.length} sighting${chapter.sightings.length===1?'':'s'}</p></div>${photos.length?`<div class="photo-grid-year">${photos.map(photoCard).join('')}</div>`:'<p class="season-note">No dated photos recorded for this season.</p>'}${chapter.photos.length>limit?`<button type="button" class="ghost show-more" data-more="${index}">More ${esc(chapter.name.toLowerCase())} photos (${chapter.photos.length-limit} remaining)</button>`:''}${milestones.length?`<ul class="season-milestones">${milestones.map(e=>`<li><time datetime="${esc(e.date)}">${esc(fmt(e.date))}</time>${esc(e.plant.name)} · ${esc(e.action)}</li>`).join('')}</ul>`:''}</section>`;
  }
  function render(){
    if(!state)return;
    const recap=Model.recap(state,year);
    const latest=year===currentYear;
    document.title=`${year} · A year in your backyard`;
    const heroPhotos=Model.highlights(recap.photos,3);
    for(const p of recap.photos){if(heroPhotos.length>=3)break;if(!heroPhotos.includes(p))heroPhotos.push(p);}
    const currentCopy=latest?'The year so far':'A year to remember';
    const photosUnavailable=['plants','plantPhotos','sightings','wildlifePhotos'].some(s=>failures.has(s));
    const growth=recap.comparisons.slice(0,2).map(pair=>`<article class="comparison"><h3>${esc(pair.name)}</h3><div class="comparison-pair">${photoButton(pair.first)}${photoButton(pair.last)}</div><p class="year-intro">${pair.days} days between these photographs.</p></article>`).join('');
    const measurements=recap.measurements.slice(0,3).map(m=>`<article class="measurement"><span>${esc(m.name)}</span><strong>${Number(m.last.value).toFixed(1)} in${m.delta!==null?` <small>(${m.delta>=0?'+':''}${m.delta.toFixed(1)} in)</small>`:''}</strong><p>${esc(m.point)}</p><p>${esc(fmt(m.first.date))}${m.first.date!==m.last.date?' → '+esc(fmt(m.last.date)):''}</p></article>`).join('');
    const plantingCount=recap.newPlantings.length;
    $('#recap').innerHTML=`<section class="year-hero"><div><p class="eyebrow">${esc(currentCopy)}${latest?' · through '+esc(fmt(today)):''}</p><span class="year-number">${year}</span><h1>A year in your backyard.</h1><p class="year-intro">The things that grew. The visitors that stopped by. A few moments worth keeping.</p></div>${heroPhotos.length?`<div class="hero-mosaic">${heroPhotos.map(p=>`<figure><img src="${esc(imageURL(p.key+'.thumb.jpg'))}" data-original="${esc(imageURL(p.key))}" alt="${esc(p.name)}" decoding="async"><figcaption>${esc(p.name)} · ${esc(fmt(p.date))}</figcaption></figure>`).join('')}</div>`:'<div class="hero-empty">Your photos will tell the story here when dated images are available for this year.</div>'}</section>
    <section class="year-stats" aria-label="Year at a glance">${metric(photosUnavailable?'—':recap.photos.length,'photos recorded')}${metric(failures.has('plants')||failures.has('plantPhotos')?'—':recap.plantsPhotographed,'plants photographed')}${metric(failures.has('sightings')?'—':recap.visitors.length,'wildlife species seen')}${metric(failures.has('plants')||failures.has('log')?'—':recap.events.length,'plant journal entries')}</section>
    <nav class="season-nav" aria-label="Season chapters">${recap.chapters.map((c,i)=>`<a href="#season-${i}">${esc(c.name)} <span>${c.photos.length} photos</span></a>`).join('')}</nav>
    ${!recap.photos.length&&!recap.events.length&&!recap.sightings.length&&!plantingCount?'<p class="empty-state">No dated entries are available for this year. Choose another year, or add photos and observations in Plants and Wildlife.</p>':''}
    ${recap.chapters.map(chapterMarkup).join('')}
    <section class="recap-section" id="growth">${sectionHeading('A little change, over time','Watching things grow',plantingCount?`${plantingCount} plant${plantingCount===1?'':'s'} with a recorded planting date in ${year}`:'Earlier and later photographs from the same year')}${growth||'<p class="season-note">A comparison appears when the same plant has photos taken at least 30 days apart in this year.</p>'}${measurements?`<h3>From the measuring tape</h3><p class="year-intro">Trunk readings in inches. Changes compare readings at the same recorded measurement point.</p><div class="measurement-list">${measurements}</div>`:''}${plantingCount?`<p class="year-intro">Planted this year: ${recap.newPlantings.slice(0,8).map(p=>esc(p.name)).join(', ')}${plantingCount>8?`, and ${plantingCount-8} more`:''}.</p>`:''}</section>
    <section class="recap-section" id="visitors">${sectionHeading('They stopped by','The visitors',`${recap.sightings.length} recorded sightings in ${year}`)}${recap.visitors.length?`<div class="visitor-grid">${recap.visitors.map(v=>`<article class="visitor">${v.photo?`<img loading="lazy" src="${esc(imageURL(v.photo.key+'.thumb.jpg'))}" data-original="${esc(imageURL(v.photo.key))}" alt="${esc(v.species)}">`:''}<div><h3><a href="/wildlife/">${esc(v.species)}</a></h3><p>${v.count} sighting${v.count===1?'':'s'} · first logged ${esc(fmt(v.first))}</p></div></article>`).join('')}</div>`:'<p class="season-note">No wildlife observations recorded for this year.</p>'}</section>
    <section class="recap-section" id="favorites">${sectionHeading('Worth keeping','Your favorite moments','')}<p id="favoriteCount" class="eyebrow"></p><h3 id="favoriteHeading" tabindex="-1" class="sr-only">Favorite photos</h3><div id="favoriteShelf"></div></section>`;
    favoriteShelf();
    $('#recap').setAttribute('aria-busy','false');
    $('#loadStatus').textContent=`${year} recap ready${failures.size?' with some data unavailable':''}.`;
  }
  async function readSource(sheet,gid){
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(`https://docs.google.com/spreadsheets/d/${sheet}/export?format=csv&gid=${gid}`,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Data unavailable');
      const text=await response.text();if(!text.trim()||/^\s*</.test(text))throw new Error('Expected CSV');
      const rows=Model.parseCSV(text);
      if(rows.length && !Object.hasOwn(rows[0],gid===0?'id':gid===322094770?'plantId':'key'))throw new Error('Unexpected columns');
      return rows;
    }finally{clearTimeout(timeout);}
  }
  function requestedYear(){const value=new URLSearchParams(location.search).get('year');const n=Number(value);return /^\d{4}$/.test(value||'')&&n>=1900&&n<=currentYear?n:null;}
  function selectYear(next,push=false){
    year=next;visible={};loadFavorites();$('#yearSelect').value=String(year);
    const url=new URL(location.href);url.searchParams.set('year',year);
    if(push)history.pushState(null,'',url);else history.replaceState(null,'',url);
    render();
  }
  async function load(){
    if(pending)return;pending=true;$('#reloadData').disabled=true;$('#loadStatus').textContent='Gathering your backyard journal…';$('#recap').setAttribute('aria-busy','true');
    try {
      const results=await Promise.allSettled(sources.map(([,sheet,gid])=>readSource(sheet,gid)));
      const data={};failures=new Set();const messages=[];
      results.forEach((result,i)=>{const [key,,,label]=sources[i];if(result.status==='fulfilled')data[key]=result.value;else{failures.add(key);messages.push(label);}});
      state=Model.build(data,today);allPhotos.clear();state.photos.forEach(p=>allPhotos.set(p.id,p));
      const requested=requestedYear(),years=[...new Set([currentYear,...state.years,...(requested?[requested]:[])])].sort((a,b)=>b-a);
      $('#yearSelect').innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');$('#yearSelect').disabled=false;
      $('#notices').innerHTML=messages.length?`<p>${esc(messages.join(', '))} could not be loaded. The recap may be incomplete. Use Refresh data to retry.</p>`:'';
      selectYear(requested || (state.years.includes(currentYear)?currentYear:state.years[0]||currentYear));
    }catch(_){$('#loadStatus').textContent='The recap could not load. Use Refresh data to try again.';$('#recap').setAttribute('aria-busy','false');}
    finally{pending=false;$('#reloadData').disabled=false;}
  }
  document.addEventListener('error',event=>{
    const img=event.target;if(img.tagName!=='IMG')return;
    if(img.dataset.original){const original=img.dataset.original;delete img.dataset.original;img.src=original;}
    else{img.alt=img.alt+' (photo unavailable)';img.classList.add('unavailable');}
  },true);
  $('#recap').addEventListener('click',event=>{
    const favorite=event.target.closest('[data-favorite]');
    if(favorite){
      const id=favorite.dataset.favorite;if(!allPhotos.has(id))return;
      const inShelf=!!favorite.closest('#favoriteShelf');
      if(favorites.has(id))favorites.delete(id);else favorites.add(id);
      let saved=true;try{localStorage.setItem('satownsend.backyardFavorites.'+year,JSON.stringify([...favorites]));}catch(_){saved=false;}
      document.querySelectorAll('[data-favorite]').forEach(button=>{const on=favorites.has(button.dataset.favorite);button.setAttribute('aria-pressed',String(on));button.textContent=on?'★ Saved':'☆ Favorite';});
      favoriteShelf();if(inShelf)$('#favoriteHeading').focus();
      $('#loadStatus').textContent=saved?'Favorite photos updated.':'Favorites updated for this visit; browser storage is unavailable.';
      return;
    }
    const more=event.target.closest('[data-more]');
    if(more){const index=Number(more.dataset.more);visible[index]=(visible[index]||6)+6;const chapter=Model.recap(state,year).chapters[index];const old=$('#season-'+index);old.outerHTML=chapterMarkup(chapter,index);const next=$('#season-'+index+' [data-more]');if(next)next.focus();else $('#season-'+index).scrollIntoView({block:'start'});return;}
    const button=event.target.closest('[data-photo]');
    if(button){const photo=allPhotos.get(button.dataset.photo);if(!photo)return;$('#dialogImage').src=imageURL(photo.key);$('#dialogImage').alt=photo.name;$('#dialogTitle').textContent=photo.name;$('#dialogDate').textContent=[photo.date,photo.location].filter(Boolean).join(' · ');$('#dialogNote').textContent=photo.caption;$('#dialogSource').href=sourceLink(photo);$('#photoDialog').showModal();}
  });
  $('#closePhoto').addEventListener('click',()=>$('#photoDialog').close());
  $('#yearSelect').addEventListener('change',()=>selectYear(Number($('#yearSelect').value),true));
  window.addEventListener('popstate',()=>{if(state)selectYear(requestedYear()||currentYear);});
  $('#reloadData').addEventListener('click',load);
  $('#printYear').addEventListener('click',()=>window.print());
  $('#shareYear').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(location.href);$('#loadStatus').textContent='Year link copied. Favorites stay in this browser.';}
    catch(_){let field=$('#copyFallback');if(!field){field=document.createElement('input');field.id='copyFallback';field.className='year-copy-fallback';field.readOnly=true;field.setAttribute('aria-label','Year recap link');$('#loadStatus').after(field);}field.value=location.href;field.focus();field.select();$('#loadStatus').textContent='Copy the selected year link.';}
  });
  let theme='default';try{theme=localStorage.getItem('satownsend.theme')||'default';}catch(_){}
  if(!window.THEMES.some(t=>t.id===theme))theme='default';
  function applyTheme(value){if(value==='default')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme=value;document.querySelector('meta[name=theme-color]').content=window.THEMES.find(t=>t.id===value).meta;}
  $('#themeSelect').innerHTML=window.THEMES.map(t=>`<option value="${t.id}">${t.label}</option>`).join('');$('#themeSelect').value=theme;applyTheme(theme);
  $('#themeSelect').addEventListener('change',()=>{const value=$('#themeSelect').value;applyTheme(value);try{localStorage.setItem('satownsend.theme',value);}catch(_){}});
  load();
})();
