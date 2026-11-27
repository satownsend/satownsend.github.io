const CAT_PAGE = document.body.dataset.photoSection === 'puck';
/* ── Helpers ── */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }

/* ── CSV parser ── */
function parseCSV(text){
  const rows=[]; let row=[]; let cell=''; let inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQ){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++}
      else if(c==='"') inQ=false;
      else cell+=c;
    } else {
      if(c==='"') inQ=true;
      else if(c===','){row.push(cell);cell=''}
      else if(c==='\n'||c==='\r'){
        if(c==='\r'&&text[i+1]==='\n') i++;
        row.push(cell);cell='';
        if(row.length>1||row[0]!=='') rows.push(row);
        row=[];
      } else cell+=c;
    }
  }
  row.push(cell);
  if(row.length>1||row[0]!=='') rows.push(row);
  return rows;
}
function csvToObjects(rows){
  if(!rows.length) return [];
  const hdr=rows[0];
  return rows.slice(1).map(r=>{
    const o={};
    hdr.forEach((h,i)=> o[h]=r[i]||'');
    return o;
  });
}

/* ── Config ──
   PASTE the public ("anyone with the link → viewer") Google Sheet ID below.
   The dashboard auto-creates the `photos` tab on first upload; nothing else to
   set up. Until this is filled in the page shows an owner-only setup note. */
const PHOTO_SHEET_ID = '1JXlI9RgLfwrpYgMZxyo8TipEiEn675Bwpnr9ORxUJFA';
const PHOTOS_TAB = 'photos';
const CONFIG_TAB = 'config';
const PHOTO_HEADERS = ['id','key','category','title','date','caption','hideFromGallery','subcategory'];
const SEED_CATEGORIES = (CAT_PAGE ? ['Puck'] : ['Astrophotography','Landscape','Trips','Misc']);
// Optional second level under a category (e.g. individual trips). Auto-discovered
// from data too — these just seed the chips/suggestions so they're there up front.
const SEED_SUBCATEGORIES = { 'Trips': ['Hawaii'] };

/* ── R2 config ── */
const R2_CONFIG = {
  bucket: 'plant-photos',
  accountId: '5321847b835f166ceacebf2c8c142610',
  publicUrl: 'https://pub-59a926166fd84970bea75caf38a52d27.r2.dev',
};

function r2PublicUrl(key){ return `${R2_CONFIG.publicUrl}/${key}`; }

/* ── Reads (gviz by tab name → no gid needed for a fresh sheet) ── */
async function fetchTab(tab){
  const url = `https://docs.google.com/spreadsheets/d/${PHOTO_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error(`Sheet fetch failed: HTTP ${r.status}`);
  const text = (await r.text()).replace(/^﻿/, '');
  return csvToObjects(parseCSV(text));
}

/* ── State ── */
const state = { photos:[], _featuredKey:'' };
let activeCategory = '';   // '' = all
let activeSub = '';        // '' = all sub-categories within the active category

function normalizePhoto(p){
  if(p.hideFromGallery === 'TRUE' || p.hideFromGallery === true) p.hideFromGallery = true;
  else delete p.hideFromGallery;
  return p;
}

async function loadData(){
  if(!PHOTO_SHEET_ID){
    setSyncStatus('not configured yet', 'err');
    showSetupNote();
    return;
  }
  setSyncStatus('loading…','');
  try{
    const rows = await fetchTab(PHOTOS_TAB).catch(()=>[]);
    state.photos = rows.map(normalizePhoto).filter(p=>p.key && PhotoSections.includes(p, CAT_PAGE));
    setSyncStatus(`${state.photos.length} photo${state.photos.length===1?'':'s'} loaded`, 'ok');
    refreshGsStatus();
    buildCategoryChips();
    buildCatDatalist();
    renderGrid();
    renderStats();
    refreshGallery();
  } catch(e){
    console.error(e);
    setSyncStatus('failed to load data', 'err');
  }
}

function showSetupNote(){
  const note = $('#setupNote');
  note.style.display = '';
  note.innerHTML = `<strong>Set up needed:</strong> paste your public Google Sheet ID into
    <code>PHOTO_SHEET_ID</code> near the top of <code>photography/index.html</code>.
    Create a Google Sheet, share it <em>“anyone with the link → viewer”</em>, and copy the id from its URL
    (the part between <code>/d/</code> and <code>/edit</code>). The <code>${PHOTOS_TAB}</code> tab is created
    automatically the first time you add a photo.`;
}

/* ── Sync status ── */
function setSyncStatus(msg, cls){
  $('#syncText').textContent = msg;
  $('#syncDot').className = 'sync-dot' + (cls ? ' '+cls : '');
}

/* ── Categories ── */
function photoCategories(photo){
  return CAT_PAGE ? PhotoSections.catNames(photo.category) : (photo.category ? [photo.category] : []);
}
function hasCategory(photo, name){
  return photoCategories(photo).some(cat=>cat.toLowerCase()===name.toLowerCase());
}
function allCategories(){
  const set = new Set(SEED_CATEGORIES);
  for(const p of state.photos){ for(const name of photoCategories(p)) set.add(name); }
  return [...set].sort((a,b)=>a.localeCompare(b));
}
function categoryCounts(){
  const m = Object.create(null);
  for(const p of state.photos){ const names=photoCategories(p);for(const c of names.length ? names : ['Uncategorized']) m[c]=(m[c]||0)+1; }
  return m;
}
function subcategoriesFor(cat){
  const set = new Set(SEED_SUBCATEGORIES[cat] || []);
  for(const p of state.photos){ if(hasCategory(p,cat) && p.subcategory) set.add(p.subcategory); }
  return [...set].sort((a,b)=>a.localeCompare(b));
}
function subCounts(cat){
  const m = Object.create(null);
  for(const p of state.photos){ if(hasCategory(p,cat) && p.subcategory) m[p.subcategory] = (m[p.subcategory]||0)+1; }
  return m;
}

function buildCategoryChips(){
  const counts = categoryCounts();
  const cats = allCategories();
  // Only show categories that either seed or have photos.
  const shown = cats.filter(c => SEED_CATEGORIES.includes(c) || counts[c]);
  if(counts['Uncategorized']) shown.push('Uncategorized');
  const chips = [`<button class="cat-chip${activeCategory===''?' active':''}" data-cat="">All <span class="cc-count">${state.photos.length}</span></button>`];
  for(const c of shown){
    chips.push(`<button class="cat-chip${activeCategory===c?' active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}<span class="cc-count">${counts[c]||0}</span></button>`);
  }
  $('#catChips').innerHTML = chips.join('');
  buildSubChips();
}

// Second-level chips: shown only when the active category has sub-categories
// (e.g. Trips → Hawaii). "All <Category>" clears the sub-filter.
function buildSubChips(){
  const wrap = $('#subChips');
  const subs = activeCategory ? subcategoriesFor(activeCategory) : [];
  if(!activeCategory || !subs.length){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const counts = subCounts(activeCategory);
  const catTotal = state.photos.filter(p=>hasCategory(p,activeCategory)).length;
  const chips = [`<button class="cat-chip sub${activeSub===''?' active':''}" data-sub="">All ${escapeHtml(activeCategory)} <span class="cc-count">${catTotal}</span></button>`];
  for(const s of subs){
    chips.push(`<button class="cat-chip sub${activeSub===s?' active':''}" data-sub="${escapeHtml(s)}">${escapeHtml(s)}<span class="cc-count">${counts[s]||0}</span></button>`);
  }
  wrap.innerHTML = chips.join('');
  wrap.style.display = 'flex';
}

function buildCatDatalist(){
  $('#catList').innerHTML = allCategories().map(c=>`<option value="${escapeHtml(c)}">`).join('');
}
function buildSubDatalist(cat){
  const subs = cat ? subcategoriesFor(cat) : [];
  $('#subList').innerHTML = subs.map(s=>`<option value="${escapeHtml(s)}">`).join('');
}

$('#catChips').addEventListener('click', e=>{
  const chip = e.target.closest('[data-cat]');
  if(!chip) return;
  activeCategory = chip.dataset.cat;
  activeSub = '';               // reset the sub-filter when the category changes
  buildCategoryChips();
  renderGrid({ reset: true });
});

$('#subChips').addEventListener('click', e=>{
  const chip = e.target.closest('[data-sub]');
  if(!chip) return;
  activeSub = chip.dataset.sub;
  buildSubChips();
  renderGrid({ reset: true });
});

/* ── Photo wall ── */
function filteredSortedPhotos(){
  const q = $('#searchBox').value.toLowerCase().trim();
  let list = state.photos.filter(p=>{
    const cat = p.category || 'Uncategorized';
    if(activeCategory && !(activeCategory==='Uncategorized' ? !photoCategories(p).length : hasCategory(p,activeCategory))) return false;
    if(activeCategory && activeSub && (p.subcategory||'') !== activeSub) return false;
    if(q){
      const hay = `${p.category} ${p.subcategory||''} ${p.title} ${p.caption} ${p.date}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const sort = $('#sortSel').value;
  list.sort((a,b)=>{
    if(sort === 'cat'){
      const c = (a.category||'').localeCompare(b.category||'');
      if(c) return c;
      return (b.date||'').localeCompare(a.date||'');
    }
    const cmp = (a.date||'').localeCompare(b.date||'');
    return sort === 'date-asc' ? cmp : -cmp;
  });
  return list;
}

/* Pagination (issue #62): the wall shows GRID_PAGE tiles and appends the next
   page when you scroll near the bottom (IntersectionObserver) or click. A
   filter/sort/search change resets to the first page; re-renders after an
   edit keep however many were showing. The lightbox still gets the FULL
   filtered list (data-idx indexes into it), so ← → walk every photo. */
const GRID_PAGE = 48;
let gridShown = GRID_PAGE;

function tileHtml(p, i){
  const vid = isVideoKey(p.key);
  const media = vid
    ? `<video src="${r2PublicUrl(p.key)}" preload="metadata" muted playsinline></video><div class="play-icon"></div>`
    : `<img src="${r2PublicUrl(p.key + '.thumb.jpg')}" onerror="this.onerror=null;this.src='${r2PublicUrl(p.key)}'" loading="lazy" decoding="async" alt="${escapeHtml(p.title||p.category||'')}">`;
  const hidden = p.hideFromGallery ? '<div class="ph-hidden" title="Hidden from slideshow">🚫</div>' : '';
  const label = p.title || p.category || '';
  const catLabel = [p.category, p.subcategory].filter(Boolean).join(' · ');
  const info = (label || p.date)
    ? `<div class="ph-info"><span class="ph-cat">${escapeHtml(catLabel)}</span>${p.title?` · <span class="ph-title">${escapeHtml(p.title)}</span>`:''}${p.date?`<div>${escapeHtml(p.date)}</div>`:''}</div>`
    : '';
  return `<div class="ph" data-idx="${i}">${media}${info}${hidden}</div>`;
}

function renderGrid(opts){
  if(opts && opts.reset) gridShown = GRID_PAGE;
  const grid = $('#photoGrid');
  const list = filteredSortedPhotos();
  state._gridList = list;
  if(!list.length){
    grid.innerHTML = '<div class="empty">No photos yet.</div>';
    renderGridMore();
    return;
  }
  gridShown = Math.min(list.length, Math.max(GRID_PAGE, gridShown));
  grid.innerHTML = list.slice(0, gridShown).map(tileHtml).join('');
  renderGridMore();
}

function showMoreGrid(all){
  const list = state._gridList || [];
  if(gridShown >= list.length) return;
  const from = gridShown;
  gridShown = all ? list.length : Math.min(list.length, gridShown + GRID_PAGE);
  $('#photoGrid').insertAdjacentHTML('beforeend', list.slice(from, gridShown).map((p,i)=>tileHtml(p, from + i)).join(''));
  renderGridMore();
}

function renderGridMore(){
  const el = $('#gridMore');
  const total = (state._gridList || []).length;
  if(!total || gridShown >= total){
    el.innerHTML = total > GRID_PAGE ? `<span>Showing all ${total} photos</span>` : '';
    return;
  }
  const left = total - gridShown;
  el.innerHTML = `<span>Showing ${gridShown} of ${total}</span>
    <button class="ghost tiny" id="gridMoreBtn">Show ${Math.min(GRID_PAGE, left)} more</button>
    <button class="ghost tiny" id="gridAllBtn">Show all ${total}</button>`;
  $('#gridMoreBtn').onclick = ()=> showMoreGrid(false);
  $('#gridAllBtn').onclick = ()=> showMoreGrid(true);
}

// Auto-load the next page as the footer scrolls into view.
if('IntersectionObserver' in window){
  new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting) && $('#gridMoreBtn')) showMoreGrid(false);
  }, { rootMargin: '600px 0px' }).observe($('#gridMore'));
}

$('#photoGrid').addEventListener('click', e=>{
  const ph = e.target.closest('.ph');
  if(!ph) return;
  _lbPhotos = state._gridList || [];
  _lbIdx = parseInt(ph.dataset.idx, 10);
  showLightbox();
});

$('#searchBox').addEventListener('input', ()=> renderGrid({ reset: true }));
$('#sortSel').addEventListener('change', ()=> renderGrid({ reset: true }));

/* ── Photo gallery slideshow ── */
const GALLERY_FIT_KEY = 'photographyDashboard.galleryFit';
const gallery = { pool: [], idx: 0, current: 'A', timer: null, paused: false };

function getGalleryFit(){
  return localStorage.getItem(GALLERY_FIT_KEY) === 'cover' ? 'cover' : 'contain';
}
function applyGalleryFit(){
  const fit = getGalleryFit();
  const stage = $('#galleryStage');
  if(stage) stage.dataset.fit = fit;
  const btn = $('#galleryFitBtn');
  if(btn) btn.textContent = fit === 'cover' ? '✂ crop' : '🖼 full';
}

function buildGalleryPool(){
  const items = [];
  for(const p of state.photos){
    if(!p.key || isVideoKey(p.key) || p.hideFromGallery) continue;
    items.push({ key: p.key, category: p.category||'', subcategory: p.subcategory||'', title: p.title||'', date: p.date||'', caption: p.caption||'' });
  }
  for(let i = items.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  gallery.pool = items;
  gallery.idx = 0;
}

function showGalleryPhoto(item){
  if(!item) return;
  const a = $('#galleryImgA'), b = $('#galleryImgB');
  const incoming = gallery.current === 'A' ? b : a;
  const outgoing = gallery.current === 'A' ? a : b;
  incoming.onload = ()=>{
    incoming.classList.add('is-current');
    outgoing.classList.remove('is-current');
    gallery.current = gallery.current === 'A' ? 'B' : 'A';
    gallery._errStreak = 0;
  };
  incoming.onerror = ()=>{
    gallery._errStreak = (gallery._errStreak||0) + 1;
    if(gallery._errStreak < gallery.pool.length) advanceGallery(1);
  };
  incoming.src = r2PublicUrl(item.key);
  const catBits = [item.category, item.subcategory].filter(Boolean).join(' · ');
  const name = item.title || catBits;
  const meta = [item.title ? catBits : '', item.date, item.caption].filter(Boolean).join(' · ');
  $('#galleryCaption').innerHTML = `<span class="gname">${escapeHtml(name)}</span><span class="gmeta">${escapeHtml(meta)}</span>`;
  $('#galleryDots').textContent = `${gallery.idx + 1} / ${gallery.pool.length}`;
}

function advanceGallery(step){
  if(!gallery.pool.length) return;
  gallery.idx = (gallery.idx + step + gallery.pool.length) % gallery.pool.length;
  showGalleryPhoto(gallery.pool[gallery.idx]);
}
function startGallery(){
  if(!gallery.pool.length || gallery.timer) return;
  showGalleryPhoto(gallery.pool[gallery.idx]);
  gallery.timer = setInterval(()=>{ if(!gallery.paused) advanceGallery(1); }, 5000);
}
function stopGallery(){ if(gallery.timer){ clearInterval(gallery.timer); gallery.timer = null; } }

function refreshGallery(){
  stopGallery();
  buildGalleryPool();
  const panel = $('#galleryPanel');
  if(gallery.pool.length){
    panel.style.display = '';
    applyGalleryFit();
    startGallery();
  } else {
    panel.style.display = 'none';
  }
}

$('#galleryPrev').onclick = ()=> advanceGallery(-1);
$('#galleryNext').onclick = ()=> advanceGallery(1);
$('#galleryFitBtn').onclick = ()=>{
  const next = getGalleryFit() === 'cover' ? 'contain' : 'cover';
  localStorage.setItem(GALLERY_FIT_KEY, next);
  applyGalleryFit();
};
$('#galleryStage').addEventListener('mouseenter', ()=>{ gallery.paused = true; });
$('#galleryStage').addEventListener('mouseleave', ()=>{ gallery.paused = false; });
document.addEventListener('visibilitychange', ()=>{ gallery.paused = document.hidden; });
$('#galleryStage').addEventListener('click', e=>{
  if(e.target.closest('button')) return;
  const item = gallery.pool[gallery.idx];
  if(!item) return;
  // Open this photo in the lightbox against the full grid list.
  _lbPhotos = state.photos.slice();
  _lbIdx = Math.max(0, _lbPhotos.findIndex(p=>p.key===item.key));
  showLightbox();
});

/* ── Stats ── */
const palette = ['#4dd0c1','#f0a868','#7ec4cc','#e08a4a','#8fc06a','#d2554a','#9aafc4','#d49858','#b08090','#5d8a3e','#c2d6d9','#993028'];

function renderStats(){
  const photos = state.photos;
  const total = photos.length;
  const catCounts = categoryCounts();
  const years = new Set(photos.map(p=>(p.date||'').slice(0,4)).filter(Boolean));

  $('#statsCards').innerHTML = `
    <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Photos</div></div>
    <div class="stat-card"><div class="stat-num">${Object.keys(catCounts).length}</div><div class="stat-label">${CAT_PAGE ? 'Cats' : 'Categories'}</div></div>
    <div class="stat-card"><div class="stat-num">${years.size}</div><div class="stat-label">Years</div></div>
  `;

  if(CAT_PAGE) drawBars('#chartCategories', Object.entries(catCounts), 'cat tags');
  else drawPie('#chartCategories', new Map(Object.entries(catCounts)));

  const byMonth = new Map();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  photos.forEach(p=>{
    const m = parseInt((p.date||'').slice(5,7), 10);
    if(m>=1 && m<=12){ const l = monthNames[m-1]; byMonth.set(l, (byMonth.get(l)||0)+1); }
  });
  drawBars('#chartMonths', monthNames.filter(m=>byMonth.has(m)).map(m=>[m, byMonth.get(m)]), 'photos');

  const byYear = new Map();
  photos.forEach(p=>{
    const y = parseInt((p.date||'').slice(0,4), 10);
    if(y && y>1900) byYear.set(y, (byYear.get(y)||0)+1);
  });
  drawYearBars('#chartYears', byYear, 'photos');
}

function drawPie(target, dataMap){
  const el = typeof target==='string' ? $(target) : target;
  if(!el || !dataMap.size){ if(el) el.innerHTML='<span class="meta">No data</span>'; return; }
  const entries = [...dataMap.entries()].sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s,[,n])=>s+n, 0);
  const w=260, h=260, cx=w/2, cy=h/2, r=Math.min(cx,cy)-4;
  let angle = -Math.PI/2;
  const slices = entries.map(([label, n], i)=>{
    const frac = n/total;
    const start = angle; angle += frac * 2 * Math.PI; const end = angle;
    const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start);
    const x2 = cx + r*Math.cos(end),   y2 = cy + r*Math.sin(end);
    const largeArc = frac > 0.5 ? 1 : 0;
    const pathD = frac >= 1
      ? `M${cx-r},${cy}A${r},${r},0,1,1,${cx+r},${cy}A${r},${r},0,1,1,${cx-r},${cy}`
      : `M${cx},${cy}L${x1.toFixed(2)},${y1.toFixed(2)}A${r},${r},0,${largeArc},1,${x2.toFixed(2)},${y2.toFixed(2)}Z`;
    return `<path d="${pathD}" fill="${palette[i%palette.length]}"/>`;
  }).join('');
  const legend = entries.map(([label, n], i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:2px 0">
      <div style="width:10px;height:10px;border-radius:3px;background:${palette[i%palette.length]};flex:none"></div>
      <span style="font-size:12px;color:var(--ink);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</span>
      <span style="font-size:12px;color:var(--muted);white-space:nowrap">${(n/total*100).toFixed(1)}%</span>
    </div>`).join('');
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <svg viewBox="0 0 ${w} ${h}" width="120" height="120">${slices}</svg>
      <div style="flex:1;min-width:100px">${legend}</div>
    </div>`;
}

function drawBars(target, series, noun){
  const el = typeof target==='string' ? $(target) : target;
  if(!el || !series.length){ if(el) el.innerHTML='<span class="meta">No data</span>'; return; }
  const total = series.reduce((s,[,n])=>s+n, 0);
  const w=360, h=180, padL=20, padR=10, padT=20, padB=28;
  const max = Math.max(1, ...series.map(s=>s[1]));
  const bw = Math.min(40, (w-padL-padR)/series.length);
  const chartW = padL + series.length*bw + padR;
  const bars = series.map(([label,n],i)=>{
    const bh = n===0?0:(h-padT-padB)*(n/max);
    const x = padL+i*bw+bw*0.15, yy = h-padB-bh, wd = bw*0.7;
    return `<g>
      <rect x="${x.toFixed(2)}" y="${yy.toFixed(2)}" width="${wd.toFixed(2)}" height="${bh.toFixed(2)}" fill="var(--accent)" rx="2"/>
      ${n?`<text x="${(x+wd/2).toFixed(2)}" y="${(yy-4).toFixed(2)}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${n}</text>`:''}
      <text x="${(x+wd/2).toFixed(2)}" y="${h-padB+14}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${escapeHtml(label)}</text>
    </g>`;
  }).join('');
  const axis = `<line x1="${padL}" y1="${h-padB}" x2="${chartW-padR}" y2="${h-padB}" stroke="var(--line)"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${chartW} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">${axis}${bars}</svg>
    <div class="stats-total">Total: ${total} ${noun || 'items'}</div>`;
}
function drawYearBars(target, byYear, noun){
  const el = typeof target==='string' ? $(target) : target;
  if(!el || !byYear.size){ if(el) el.innerHTML='<span class="meta">No data</span>'; return; }
  drawBars(target, [...byYear.entries()].sort((a,b)=>a[0]-b[0]), noun);
}

/* ── Themes ── */
const THEMES = window.THEMES; // shared list: /shared/themes.js (colors in styles.css)
const THEME_KEY = 'satownsend.theme';

function applyTheme(id){
  if(id === 'default') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem(THEME_KEY, id);
  $$('.theme-swatch').forEach(s=> s.classList.toggle('active', s.dataset.theme===id));
}
function currentTheme(){ return document.documentElement.getAttribute('data-theme') || 'default'; }

function buildThemeSwatches(){
  $('#themeSwatches').innerHTML = THEMES.map(t=>`
    <div class="theme-swatch" data-theme="${t.id}" title="${t.label}">
      <div class="ts-left" style="background:${t.bg}"></div>
      <div class="ts-right" style="background:${t.accent}"></div>
    </div>`).join('');
  const cur = currentTheme();
  $$('.theme-swatch').forEach(s=> s.classList.toggle('active', s.dataset.theme===cur));
  $('#themeSwatches').addEventListener('click', e=>{
    const sw = e.target.closest('.theme-swatch');
    if(sw) applyTheme(sw.dataset.theme);
  });
}
function buildThemePop(){
  const pop = $('#themePop');
  const cur = currentTheme();
  pop.innerHTML = THEMES.map(t=>`
    <div class="theme-pop-row" data-theme="${t.id}" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;${t.id===cur?'background:var(--panel2)':''}">
      <div style="display:flex;width:48px;height:28px;border-radius:6px;overflow:hidden;border:1px solid var(--line)">
        <div style="flex:1;background:${t.bg}"></div><div style="flex:1;background:${t.accent}"></div>
      </div>
      <span style="font-size:13px">${t.label}</span>
      ${t.id===cur?'<span style="margin-left:auto;color:var(--accent)">✓</span>':''}
    </div>`).join('');
  pop.insertAdjacentHTML('beforeend', window.Fonts ? window.Fonts.pickerHtml() : '');  // font options (issue #87)
  pop.addEventListener('click', e=>{
    const row = e.target.closest('[data-theme]');
    if(row){ applyTheme(row.dataset.theme); buildThemePop(); }
  });
}
$('#themechip').onclick = ()=>{
  const pop = $('#themePop');
  if(pop.style.display==='none'){ buildThemePop(); pop.style.display='block'; }
  else pop.style.display='none';
};
document.addEventListener('click', e=>{
  if(!e.target.closest('#themechip') && !e.target.closest('#themePop')) $('#themePop').style.display='none';
});

/* ── Settings ── */
function openSettings(){
  buildThemeSwatches();
  $('#settingsOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  refreshR2Input();
}
function closeSettings(){
  $('#settingsOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
$('#settingsBtn').onclick = openSettings;
$('#settingsBtnBottom').onclick = openSettings;
$('#settingsClose').onclick = closeSettings;
$('#settingsDone').onclick = closeSettings;
$('#settingsOverlay').addEventListener('click', e=>{ if(e.target === $('#settingsOverlay')) closeSettings(); });

/* ── Google OAuth (shared GAuth module) ── */
function isGsAuthed(){ return GAuth.isAuthed(); }
function refreshGsStatus(){
  const authed = isGsAuthed();
  document.body.classList.toggle('view-only', !authed);
  if(authed){
    setSyncStatus(`${state.photos.length} photo${state.photos.length===1?'':'s'} loaded · signed in`, 'ok');
    $('#gsSaveTokenBtn').textContent = 'Signed in ✓';
    $('#gsSaveTokenBtn').disabled = true;
  } else {
    $('#gsSaveTokenBtn').textContent = 'Sign in with Google';
    $('#gsSaveTokenBtn').disabled = false;
  }
}
$('#gsSaveTokenBtn').onclick = ()=> GAuth.signIn();


/* ── Google Sheets API (writes need the signed-in token) ── */
async function sheetsApi(url, opts = {}){
  const token = GAuth.token();
  if (!token) throw new Error('Not signed in');
  const headers = { Authorization: 'Bearer ' + token, ...(opts.headers || {}) };
  const r = await fetch(url, { ...opts, headers });
  if (!r.ok){ throw new Error(`Sheets API ${r.status}: ${(await r.text().catch(()=>'')).slice(0,200)}`); }
  return r.json();
}
const SHEET_BASE = () => `https://sheets.googleapis.com/v4/spreadsheets/${PHOTO_SHEET_ID}`;

/* Shared dashboard configuration (featured photos and labels). */

async function gsReadConfig(){
  try {
    const data = await sheetsApi(`${SHEET_BASE()}/values/${encodeURIComponent(CONFIG_TAB)}`);
    const map = {};
    for (const r of (data.values || [])){ if (r[0]) map[r[0]] = r[1] || ''; }
    return map;
  } catch(e){ return {}; }
}
async function gsWriteConfigValue(key, value){
  const base = SHEET_BASE();
  try {
    await sheetsApi(`${base}:batchUpdate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ requests:[{ addSheet:{ properties:{ title: CONFIG_TAB } } }] }),
    });
  } catch(e){ /* already exists → fine */ }
  const map = await gsReadConfig();
  map[key] = value;
  const rows = [['key','value'], ...Object.entries(map)];
  await sheetsApi(`${base}/values/${encodeURIComponent(CONFIG_TAB)}:clear`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:'{}',
  });
  await sheetsApi(`${base}/values/${encodeURIComponent(CONFIG_TAB+'!A1')}?valueInputOption=RAW`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ values: rows }),
  });
}


/* ── HEIC / EXIF / Resize ── */
function isHeic(file){ return /^image\/hei[cf]/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || ''); }
let _heic2anyPromise = null;
function loadHeic2Any(){
  if (_heic2anyPromise) return _heic2anyPromise;
  _heic2anyPromise = new Promise((resolve, reject) => {
    if (window.heic2any) return resolve(window.heic2any);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload = () => window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any global missing'));
    s.onerror = () => { _heic2anyPromise = null; reject(new Error('Failed to load HEIC converter (offline?)')); };
    document.head.appendChild(s);
  });
  return _heic2anyPromise;
}
async function exifDateFromFile(file){
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xFFD8) return null;
    let offset = 2;
    while (offset < view.byteLength - 4){
      if (view.getUint8(offset) !== 0xFF) return null;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2);
      if (marker === 0xE1){
        const headerStart = offset + 4;
        if (view.getUint32(headerStart) === 0x45786966 && view.getUint16(headerStart + 4) === 0x0000){
          const tiffStart = headerStart + 6;
          const endian = view.getUint16(tiffStart);
          if (endian !== 0x4949 && endian !== 0x4D4D) return null;
          const little = endian === 0x4949;
          const get16 = (o) => view.getUint16(o, little);
          const get32 = (o) => view.getUint32(o, little);
          if (get16(tiffStart + 2) !== 0x002A) return null;
          const ifd0Offset = tiffStart + get32(tiffStart + 4);
          const numEntries = get16(ifd0Offset);
          let exifIfdOffset = null;
          for (let i = 0; i < numEntries; i++){
            const e = ifd0Offset + 2 + i * 12;
            if (get16(e) === 0x8769){ exifIfdOffset = tiffStart + get32(e + 8); break; }
          }
          if (!exifIfdOffset) return null;
          const numExifEntries = get16(exifIfdOffset);
          for (let i = 0; i < numExifEntries; i++){
            const e = exifIfdOffset + 2 + i * 12;
            const tag = get16(e);
            if (tag === 0x9003 || tag === 0x9004){
              const valOffset = tiffStart + get32(e + 8);
              const bytes = new Uint8Array(buf, valOffset, 19);
              const str = new TextDecoder().decode(bytes);
              const m = str.match(/^(\d{4}):(\d{2}):(\d{2})/);
              if (m) return `${m[1]}-${m[2]}-${m[3]}`;
            }
          }
        }
      }
      offset += 2 + size;
    }
  } catch(e){ console.warn('EXIF parse error:', e); }
  return null;
}
async function resizeImage(file, maxDim=2400, quality=0.92){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res,rej)=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = rej; i.src = url; });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}

/* ── Media / date helpers ── */
function isVideo(fileOrKey){
  if(typeof fileOrKey === 'string') return /\.(mp4|mov|webm)$/i.test(fileOrKey);
  return /^video\//i.test(fileOrKey.type || '') || /\.(mp4|mov|webm)$/i.test(fileOrKey.name || '');
}
function isVideoKey(key){ return /\.(mp4|mov|webm)$/i.test(key||''); }
function ymd(d){ return d.toISOString().slice(0,10); }
function ymdLocal(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function captureDateFromFile(file){
  const t = file && file.lastModified;
  if(!t) return null;
  const d = new Date(t);
  if(isNaN(d.getTime())) return null;
  if(d.getFullYear() < 1990 || d.getTime() > Date.now() + 86400000) return null;
  return ymdLocal(d);
}
function slug(s){ return (s||'misc').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'misc'; }

/* ── Sheets: ensure photos tab + append/update/delete ── */
async function ensurePhotosTab(){
  const base = SHEET_BASE();
  let created = false;
  try {
    await sheetsApi(`${base}:batchUpdate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ requests:[{ addSheet:{ properties:{ title: PHOTOS_TAB } } }] }),
    });
    created = true;
  } catch(e){ /* tab already exists */ }
  // Ensure the header row exists and includes every expected column. New columns
  // (e.g. `subcategory`) are appended at the end, so existing rows stay aligned.
  let headers = [];
  if(!created){
    try { const rows = await readPhotoRows(); headers = (rows[0] || []).slice(); } catch(e){ headers = []; }
  }
  if(!headers.length){
    await sheetsApi(`${base}/values/${encodeURIComponent(PHOTOS_TAB+'!A1')}?valueInputOption=RAW`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ values: [PHOTO_HEADERS] }),
    });
    return;
  }
  let changed = false;
  for(const h of PHOTO_HEADERS){ if(!headers.includes(h)){ headers.push(h); changed = true; } }
  if(changed){
    const range = `${PHOTOS_TAB}!A1:${String.fromCharCode(64+headers.length)}1`;
    await sheetsApi(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ range, majorDimension:'ROWS', values:[headers] }),
    });
  }
}
async function appendPhotoRow(values){
  const base = SHEET_BASE();
  await sheetsApi(`${base}/values/${encodeURIComponent(PHOTOS_TAB)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ values: [values] }),
  });
}
let _photosSheetGid = null;
async function getPhotosSheetGid(){
  if(_photosSheetGid != null) return _photosSheetGid;
  const data = await sheetsApi(`${SHEET_BASE()}?fields=sheets.properties`);
  const sh = (data.sheets||[]).find(s=>s.properties.title===PHOTOS_TAB);
  _photosSheetGid = sh ? sh.properties.sheetId : null;
  return _photosSheetGid;
}
async function readPhotoRows(){
  const data = await sheetsApi(`${SHEET_BASE()}/values/${encodeURIComponent(PHOTOS_TAB)}?majorDimension=ROWS`);
  return data.values || [];
}
async function updatePhotoRow(photo){
  const rows = await readPhotoRows();
  if(!rows.length) return;
  let headers = rows[0].slice();
  // Self-heal: append any expected columns (e.g. subcategory) that are missing,
  // so edits to photos uploaded before the column existed still persist.
  const missing = PHOTO_HEADERS.filter(h=>!headers.includes(h));
  if(missing.length){
    headers = headers.concat(missing);
    const hdrRange = `${PHOTOS_TAB}!A1:${String.fromCharCode(64+headers.length)}1`;
    await sheetsApi(`${SHEET_BASE()}/values/${encodeURIComponent(hdrRange)}?valueInputOption=RAW`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ range: hdrRange, majorDimension:'ROWS', values:[headers] }),
    });
  }
  const idCol = headers.indexOf('id');
  let rowIdx = -1;
  for(let i=1;i<rows.length;i++){
    if((idCol>=0 && rows[i][idCol]===photo.id) || rows[i][1]===photo.key){ rowIdx = i; break; }
  }
  if(rowIdx<0) return;
  const newRow = headers.map(h=>{
    if(h==='hideFromGallery') return photo.hideFromGallery ? 'TRUE' : 'FALSE';
    return photo[h] != null ? photo[h] : '';
  });
  const range = `${PHOTOS_TAB}!A${rowIdx+1}:${String.fromCharCode(64+headers.length)}${rowIdx+1}`;
  await sheetsApi(`${SHEET_BASE()}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ range, majorDimension:'ROWS', values:[newRow] }),
  });
}
async function deletePhotoRow(photo){
  const rows = await readPhotoRows();
  const idCol = rows.length ? rows[0].indexOf('id') : -1;
  let rowIdx = -1;
  for(let i=1;i<rows.length;i++){
    if((idCol>=0 && rows[i][idCol]===photo.id) || rows[i][1]===photo.key){ rowIdx = i; break; }
  }
  if(rowIdx<0) return;
  const gid = await getPhotosSheetGid();
  if(gid == null) return;
  await sheetsApi(`${SHEET_BASE()}:batchUpdate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ requests:[{ deleteDimension:{ range:{ sheetId: gid, dimension:'ROWS', startIndex: rowIdx, endIndex: rowIdx+1 }}}]}),
  });
}

/* ── Feature-on-homepage (issue #50) ── */
async function loadFeaturedKey(){
  if(!isGsAuthed()) return;
  try { const cfg = await gsReadConfig(); state._featuredKey = cfg.homepage_featured_key || ''; }
  catch(e){ /* config tab may not exist yet */ }
}

/* ── Upload ── */
async function uploadPhoto(file, category, subcategory, caption, dateOverride, onStatus){
  if (!isGsAuthed()) throw new Error('Sign in with Google to upload photos.');
  const today = ymd(new Date());
  const rand = Math.random().toString(36).slice(2,8);
  const catSlug = slug(category);
  const subSlug = subcategory ? slug(subcategory) : '';
  const folder = CAT_PAGE ? 'photography/cats' : 'photography';
  const prefix = subSlug ? `${folder}/${catSlug}/${subSlug}` : `${folder}/${catSlug}`;
  const id = Math.random().toString(36).slice(2,10);
  // Row values follow PHOTO_HEADERS order: id,key,category,title,date,caption,hideFromGallery,subcategory
  const row = (key, date) => [id, key, category, '', date, caption, 'FALSE', subcategory];

  if(isVideo(file)){
    if(file.size > 90*1024*1024) throw new Error('Videos must be no larger than 90 MiB.');
    const ext = (file.name.match(/\.(mp4|mov|webm)$/i)||['.mp4'])[0].toLowerCase();
    const vidDate = dateOverride || captureDateFromFile(file) || today;
    const key = `${prefix}/${vidDate}-${rand}${ext}`;
    const ct = ext==='.webm' ? 'video/webm' : ext==='.mov' ? 'video/quicktime' : 'video/mp4';
    if(onStatus) onStatus('Uploading video…');
    const buf = await file.arrayBuffer();
    await MediaStorage.request({ method:'PUT', key, body: buf, contentType: ct });
    await appendPhotoRow(row(key, vidDate));
    state.photos.push({ id, key, category, subcategory, title:'', date: vidDate, caption });
    return;
  }

  let exifDate = await exifDateFromFile(file);
  let workingFile = file;
  if (isHeic(file)){
    if (onStatus) onStatus('Converting HEIC…');
    const converter = await loadHeic2Any();
    const blob = await converter({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    workingFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
  }
  if (onStatus) onStatus('Resizing…');
  const resized = await resizeImage(workingFile);
  const photoDate = dateOverride || exifDate || captureDateFromFile(file) || today;
  const key = `${prefix}/${photoDate}-${rand}.jpg`;
  if (onStatus) onStatus('Uploading…');
  const buf = await resized.arrayBuffer();
  await MediaStorage.request({ method:'PUT', key, body: buf, contentType:'image/jpeg' });
  // Thumbnail next to the original (issue #20): 640px long edge, ~40 KB, used by
  // tables, grids and the photo wall; full image stays for lightbox/slideshows.
  try {
    const tb = await resizeImage(new Blob([buf], { type:'image/jpeg' }), 640, 0.8);
    await MediaStorage.request({ method:'PUT', key: key + '.thumb.jpg', body: await tb.arrayBuffer(), contentType:'image/jpeg' });
  } catch(e){ console.warn('thumbnail upload failed (original is fine):', e); }
  await appendPhotoRow(row(key, photoDate));
  state.photos.push({ id, key, category, subcategory, title:'', date: photoDate, caption });
}

/* ── Add photos overlay ── */
function openAddPhotos(){
  if (!isGsAuthed()){ alert('Sign in with Google first (Settings).'); return; }
  const cat = activeCategory && activeCategory !== 'Uncategorized' ? activeCategory : '';
  $('#addCategory').value = cat;
  $('#addCategory').readOnly = false;
  $('#addSubcategory').value = cat && activeSub ? activeSub : '';
  $('#addCaption').value = '';
  $('#addDate').value = '';
  $('#addFiles').value = '';
  $('#addStatusMsg').textContent = '';
  buildCatDatalist();
  buildSubDatalist(cat);
  $('#addOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  $('#addCategory').focus();
}
// Refresh the sub-category suggestions to match the typed category.
$('#addCategory').addEventListener('input', ()=> buildSubDatalist($('#addCategory').value.trim()));
function closeAddPhotos(){
  $('#addOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
$('#addPhotosBtn').onclick = openAddPhotos;
$('#addClose').onclick = closeAddPhotos;
$('#addCancel').onclick = closeAddPhotos;
$('#addOverlay').addEventListener('click', e=>{ if(e.target === $('#addOverlay')) closeAddPhotos(); });

$('#addSaveBtn').onclick = async ()=>{
  const category = CAT_PAGE ? PhotoSections.catNames($('#addCategory').value).join(', ') : $('#addCategory').value.trim();
  if(CAT_PAGE && !category){ $('#addStatusMsg').textContent='Enter at least one cat name.'; $('#addCategory').focus(); return; }
  const photoCategory = category || 'Misc';
  if(PhotoSections.isPuck({category}) && !CAT_PAGE){ $('#addStatusMsg').textContent='Add Puck photos on the Cats page.'; return; }
  const subcategory = $('#addSubcategory').value.trim();
  const caption = $('#addCaption').value.trim();
  const dateOverride = $('#addDate').value || '';
  const files = [...$('#addFiles').files];
  if(!files.length){ $('#addFiles').focus(); return; }
  const st = $('#addStatusMsg');
  try {
    await ensurePhotosTab();
    _photosSheetGid = null;   // force re-read of gid after (possible) create
    for(let i=0;i<files.length;i++){
      st.textContent = `File ${i+1}/${files.length}: preparing…`;
      try {
        await uploadPhoto(files[i], photoCategory, subcategory, caption, dateOverride, msg => st.textContent = `File ${i+1}/${files.length}: ${msg}`);
      } catch(err){
        st.textContent = `File ${i+1} failed: ${err.message}`;
        await new Promise(r=>setTimeout(r, 2200));
      }
    }
    st.textContent = 'Done!';
    buildCategoryChips();
    buildCatDatalist();
    renderGrid();
    renderStats();
    refreshGallery();
    setTimeout(closeAddPhotos, 700);
  } catch(e){
    st.textContent = e.message;
  }
};

/* ── Lightbox ── */
let _lbPhotos = [];
let _lbIdx = 0;

function showLightbox(){
  const p = _lbPhotos[_lbIdx];
  if(!p) return;
  const vid = isVideoKey(p.key);
  const imgEl = $('#lightboxImg'), vidEl = $('#lightboxVideo');
  if(vid){
    imgEl.style.display = 'none';
    vidEl.style.display = '';
    vidEl.src = r2PublicUrl(p.key);
  } else {
    vidEl.pause();
    vidEl.style.display = 'none';
    imgEl.style.display = '';
    imgEl.src = r2PublicUrl(p.key);
  }
  $('#lightboxDate').textContent = p.date || '';
  $('#lightboxTitle').value = p.title || '';
  $('#lightboxCategory').value = p.category || '';
  $('#lightboxCategory').readOnly = false;
  $('#lightboxSubcategory').value = p.subcategory || '';
  buildSubDatalist(p.category || '');
  $('#lightboxCaption').value = p.caption || '';
  const canonical = state.photos.find(x=>x.key===p.key);
  $('#lightboxHideFromGallery').checked = !!(canonical && canonical.hideFromGallery);
  updateFeatureBtn(p, vid);
  $('#lightbox').style.display = 'flex';
}
function closeLightbox(){
  $('#lightboxVideo').pause();
  $('#lightbox').style.display = 'none';
}
$('#lightboxClose').onclick = closeLightbox;
$('#lightbox').addEventListener('click', e=>{ if(e.target === $('#lightbox')) closeLightbox(); });
$('#lightboxPrev').onclick = ()=>{ if(!_lbPhotos.length) return; $('#lightboxVideo').pause(); _lbIdx = (_lbIdx-1+_lbPhotos.length)%_lbPhotos.length; showLightbox(); };
$('#lightboxNext').onclick = ()=>{ if(!_lbPhotos.length) return; $('#lightboxVideo').pause(); _lbIdx = (_lbIdx+1)%_lbPhotos.length; showLightbox(); };

function currentLbCanonical(){
  const p = _lbPhotos[_lbIdx];
  if(!p) return null;
  return state.photos.find(x=>x.key===p.key) || p;
}
async function saveLbField(){
  const p = _lbPhotos[_lbIdx];
  if(!p) return;
  const sp = state.photos.find(x=>x.key===p.key) || p;
  sp.title = p.title = $('#lightboxTitle').value.trim();
  const category = CAT_PAGE ? PhotoSections.catNames($('#lightboxCategory').value).join(', ') : $('#lightboxCategory').value.trim();
  if(CAT_PAGE && !category){ alert('Enter at least one cat name.'); return; }
  sp.category = p.category = category;
  sp.subcategory = p.subcategory = $('#lightboxSubcategory').value.trim();
  sp.caption = p.caption = $('#lightboxCaption').value.trim();
  await updatePhotoRow(sp);
  state.photos = state.photos.filter(row=>PhotoSections.includes(row,CAT_PAGE));
  buildCategoryChips(); buildCatDatalist(); buildSubDatalist(sp.category); renderGrid(); renderStats();
}
$('#lightboxTitle').addEventListener('change', saveLbField);
$('#lightboxCategory').addEventListener('change', saveLbField);
$('#lightboxSubcategory').addEventListener('change', saveLbField);
$('#lightboxCaption').addEventListener('change', saveLbField);

$('#lightboxHideFromGallery').addEventListener('change', async ()=>{
  const p = _lbPhotos[_lbIdx];
  if(!p) return;
  const hidden = $('#lightboxHideFromGallery').checked;
  const sp = state.photos.find(x=>x.key===p.key) || p;
  if(hidden) sp.hideFromGallery = true; else delete sp.hideFromGallery;
  p.hideFromGallery = hidden || undefined;
  await updatePhotoRow(sp);
  renderGrid();
  refreshGallery();
});

function updateFeatureBtn(p, isVid){
  const btn = $('#lightboxFeature');
  if(!btn || !p) return;
  btn.style.display = isVid ? 'none' : '';
  const on = state._featuredKey && state._featuredKey === p.key;
  btn.innerHTML = on ? '&#9733; Featured on homepage' : '&#9734; Feature on homepage';
  btn.style.color = on ? 'var(--accent)' : '#fff';
  btn.style.borderColor = on ? 'var(--accent)' : 'rgba(255,255,255,.2)';
}
$('#lightboxFeature').addEventListener('click', async ()=>{
  const p = _lbPhotos[_lbIdx];
  if(!p || isVideoKey(p.key)) return;
  const makeFeatured = state._featuredKey !== p.key;
  const newKey = makeFeatured ? p.key : '';
  const prev = state._featuredKey || '';
  state._featuredKey = newKey;
  updateFeatureBtn(p, false);
  try { await gsWriteConfigValue('homepage_featured_key', newKey); }
  catch(e){ state._featuredKey = prev; updateFeatureBtn(p, false); alert('Could not update homepage feature: ' + e.message); }
});

$('#lightboxDelete').onclick = async ()=>{
  const p = _lbPhotos[_lbIdx];
  if(!p) return;
  if(!confirm('Delete this photo? This cannot be undone.')) return;
  try {
    await MediaStorage.request({ method:'DELETE', key: p.key });
    await deletePhotoRow(p);
    const gi = state.photos.findIndex(x=>x.key===p.key);
    if(gi>=0) state.photos.splice(gi, 1);
    _lbPhotos.splice(_lbIdx, 1);
    if(!_lbPhotos.length){ closeLightbox(); }
    else { _lbIdx = Math.min(_lbIdx, _lbPhotos.length - 1); showLightbox(); }
    buildCategoryChips(); buildCatDatalist(); renderGrid(); renderStats(); refreshGallery();
  } catch(e){ alert('Delete failed: ' + e.message); }
};

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    if($('#lightbox').style.display==='flex'){ closeLightbox(); return; }
    if($('#settingsOverlay').classList.contains('open')) closeSettings();
    else if($('#addOverlay').classList.contains('open')) closeAddPhotos();
  }
  if($('#lightbox').style.display==='flex' && !/input|textarea/i.test((e.target.tagName||''))){
    if(e.key==='ArrowLeft') $('#lightboxPrev').click();
    else if(e.key==='ArrowRight') $('#lightboxNext').click();
  }
});

/* ── Photo storage status ── */
function refreshR2Input(){
  const st = $('#r2Status');
  if(st) st.textContent = isGsAuthed() ? 'Google sign-in ready. Check connection to verify photo access.' : 'Sign in with Google to manage photos.';
}
$('#r2TestBtn').onclick = async ()=>{
  const st = $('#r2Status'), btn = $('#r2TestBtn');
  btn.disabled = true; st.textContent = 'Checking photo access…';
  try { await MediaStorage.check(); st.textContent = 'Photo storage connected.'; }
  catch(e){ st.textContent = e.message; }
  finally { btn.disabled = false; }
};

/* ── Init ── */
const savedTheme = localStorage.getItem(THEME_KEY);
if(savedTheme && savedTheme !== 'default') applyTheme(savedTheme);
GAuth.handleReturn();
if(!GAuth.trySilent()){
  refreshGsStatus();

  loadFeaturedKey();
  loadData();
}
