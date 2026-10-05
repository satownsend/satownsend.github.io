/* Digital photo frame (issue #72).
 *
 * A full-screen slideshow of the site's photos, meant to run on a Raspberry Pi
 * (or any browser in kiosk mode). The pages are tiny stubs — /plants-slideshow/,
 * /all-slideshow/, /slideshow/ … — that all load this script; the section comes
 * from the path (`/<section>-slideshow/`) or from `?src=` (comma list or `all`).
 *
 * Everything it reads is public (sheet CSV exports + the R2 public bucket), so no
 * login is needed. Photo rules match the homepage slideshow: videos and photos
 * flagged hide-from-gallery are skipped, wishlist plants are skipped.
 *
 * Options (query string):
 *   src=plants,wildlife | all      which sections (default: from the path, else all)
 *   interval=20                    seconds per photo
 *   fit=contain|cover              letterbox (default) or fill the screen
 *   caption=0  clock=1  kb=1       hide caption / show clock / slow drift
 *   shuffle=0                      newest-first instead of random
 * Keys: space pause · ←/→ · c caption · k clock · f fullscreen. Click/tap = next.
 */
(function(){
  'use strict';
  const R2_PUBLIC = 'https://pub-59a926166fd84970bea75caf38a52d27.r2.dev';
  // Sheet ids / tab gids mirror index.html (see README → Configuration reference).
  const SOURCES = {
    plants:      { label:'Plants',      icon:'🌱', sheet:'1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM', items:0, photos:396120968,  idField:'plant_id',      nameOf:p=>p.name, skip:p=>p && p.wishlist==='TRUE' },
    beer:        { label:'Beer',        icon:'🍺', sheet:'1BXFTqV6xCZU63IutRAeAFPrZKLyDPkuGQ-SykIdAy_k', items:0, photos:1135128185, idField:'brew_id',       nameOf:b=>b.name },
    instruments: { label:'Instruments', icon:'🎸', sheet:'1dWWWIFBpWvNOIBuxA1EIoaffKckDFhsHvPDzhbxdnYg', items:0, photos:617283945,  idField:'instrument_id', nameOf:i=>i.name || i.type || '' },
    wildlife:    { label:'Wildlife',    icon:'🦉', sheet:'1Uq2Fgzron3yDZqYFWsUx1cYigp4w8GmQP2pmk33DG54', items:0, photos:518293746,  idField:'sighting_id',   nameOf:s=>s.species },
    photography: { label:'Photography', icon:'📷', sheet:'1JXlI9RgLfwrpYgMZxyo8TipEiEn675Bwpnr9ORxUJFA', photosByName:'photos', standalone:true, nameOf:p=>p.title || p.category || '' },
  };
  const ALL = Object.keys(SOURCES);
  const REFRESH_MS = 60 * 60 * 1000;      // re-read the sheets hourly
  const RELOAD_MS  = 24 * 60 * 60 * 1000; // full reload daily (keeps a Pi's memory tidy)

  /* ── options ── */
  const q = new URLSearchParams(location.search);
  const pathSrc = (location.pathname.match(/\/([a-z]+)-slideshow\/?/) || [])[1];
  let srcs = (q.get('src') || pathSrc || 'all').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if(srcs.includes('all')) srcs = ALL.slice();
  srcs = srcs.filter(s => SOURCES[s]);
  if(!srcs.length) srcs = ALL.slice();
  const interval = Math.max(3, parseFloat(q.get('interval')) || 20) * 1000;
  const shuffle = q.get('shuffle') !== '0';
  const body = document.body;
  if(q.get('fit') === 'cover') body.classList.add('fit-cover');
  if(q.get('caption') === '0') body.classList.add('no-caption');
  body.classList.toggle('no-clock', q.get('clock') !== '1'); // stubs start with no-clock so it never flashes
  if(q.get('kb') === '1'){ body.classList.add('kb'); body.style.setProperty('--kb-dur', (interval/1000 + 2) + 's'); }

  /* ── CSV ── */
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
    return rows.slice(1).map(r=>{ const o={}; hdr.forEach((h,i)=> o[h]=r[i]||''); return o; });
  }
  async function fetchCsv(url){
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const text = (await r.text()).replace(/^﻿/, '');
    if(/^\s*</.test(text)) throw new Error('Not CSV'); // Google sometimes answers with HTML
    return csvToObjects(parseCSV(text));
  }
  const byGid  = (id, gid)  => fetchCsv(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  const byName = (id, name) => fetchCsv(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`);
  const isVideo = k => /\.(mp4|mov|webm|m4v)$/i.test(k || '');

  /* ── load one section → [{key, name, date, section, icon}] ── */
  async function loadSource(key){
    const s = SOURCES[key];
    const photos = s.photosByName ? await byName(s.sheet, s.photosByName) : await byGid(s.sheet, s.photos);
    const items = s.standalone ? null : await byGid(s.sheet, s.items).catch(()=>[]);
    const byId = items ? new Map(items.map(it => [it.id, it])) : null;
    const out = [];
    for(const p of photos){
      if(!p.key || p.hideFromGallery === 'TRUE' || isVideo(p.key)) continue;
      let name = '';
      if(s.standalone) name = s.nameOf(p);
      else {
        const it = byId.get(p[s.idField]);
        if(s.skip && s.skip(it)) continue;
        name = it ? (s.nameOf(it) || '') : '';
      }
      out.push({ key:p.key, name, date:p.date || '', section:s.label, icon:s.icon });
    }
    return out;
  }
  async function loadAll(){
    const groups = await Promise.all(srcs.map(k => loadSource(k).catch(e => { console.warn(k, 'failed:', e); return null; })));
    if(groups.every(g => g === null)) throw new Error('Could not read any photo list');
    const pool = groups.flat().filter(Boolean);
    if(shuffle) for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    else pool.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    return pool;
  }

  /* ── slideshow ── */
  const $ = s => document.querySelector(s);
  const st = { pool:[], idx:-1, current:'A', timer:null, paused:false, errors:0, loadedAt:0 };
  function esc(s){ const d=document.createElement('div'); d.textContent = s==null ? '' : String(s); return d.innerHTML; }
  function fmtDate(d){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); if(!m) return d || '';
    return new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  }
  function msg(text){ const el = $('#msg'); el.textContent = text || ''; el.classList.toggle('on', !!text); }

  function show(i){
    if(!st.pool.length) return;
    st.idx = (i + st.pool.length) % st.pool.length;
    const item = st.pool[st.idx];
    const a = $('#imgA'), b = $('#imgB');
    const incoming = st.current === 'A' ? b : a, outgoing = st.current === 'A' ? a : b;
    incoming.onload = ()=>{
      incoming.classList.add('is-current'); outgoing.classList.remove('is-current');
      st.current = st.current === 'A' ? 'B' : 'A'; st.errors = 0;
      $('#caption').innerHTML =
        `<span class="sec">${item.icon} ${esc(item.section)}</span>` +
        (item.name ? `<span class="name">${esc(item.name)}</span>` : '') +
        (item.date ? `<span class="date">${esc(fmtDate(item.date))}</span>` : '');
      preload(st.idx + 1);
      schedule();
    };
    incoming.onerror = ()=>{ st.errors++; if(st.errors < st.pool.length) show(st.idx + 1); else msg('Photos are not loading right now — retrying.'); };
    incoming.src = `${R2_PUBLIC}/${item.key}`;
  }
  function preload(i){ if(!st.pool.length) return; const im = new Image(); im.src = `${R2_PUBLIC}/${st.pool[(i + st.pool.length) % st.pool.length].key}`; }
  function schedule(){ clearTimeout(st.timer); if(!st.paused) st.timer = setTimeout(()=> show(st.idx + 1), interval); }
  function next(){ clearTimeout(st.timer); show(st.idx + 1); }
  function prev(){ clearTimeout(st.timer); show(st.idx - 1); }
  function togglePause(){ st.paused = !st.paused; body.classList.toggle('paused', st.paused); schedule(); }

  async function start(first){
    try {
      const pool = await loadAll();
      if(!pool.length){ msg('No photos to show yet.'); setTimeout(()=> start(true), 60 * 1000); return; }
      msg('');
      if(first || !st.pool.length){ st.pool = pool; show(0); }
      else {
        // Hourly refresh: keep our place, pick up anything new, drop anything deleted.
        const cur = st.pool[st.idx] && st.pool[st.idx].key;
        st.pool = pool;
        const at = pool.findIndex(p => p.key === cur);
        st.idx = at >= 0 ? at : -1;
      }
      st.loadedAt = Date.now();
    } catch(e){
      console.warn(e);
      if(!st.pool.length){ msg('Could not load the photo list — retrying in a minute.'); setTimeout(()=> start(true), 60 * 1000); }
    }
  }

  /* ── clock ── */
  function tickClock(){
    const el = $('#clock'); if(!el) return;
    const n = new Date();
    el.innerHTML = `${esc(n.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }))}<span class="d">${esc(n.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' }))}</span>`;
  }
  setInterval(tickClock, 15 * 1000); tickClock();

  /* ── keep the screen on, hide the cursor, controls ── */
  async function wakeLock(){ try { if(navigator.wakeLock && !document.hidden) await navigator.wakeLock.request('screen'); } catch(e){} }
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ wakeLock(); schedule(); } });
  wakeLock();

  let cursorT;
  document.addEventListener('mousemove', ()=>{ body.classList.add('show-cursor'); clearTimeout(cursorT); cursorT = setTimeout(()=> body.classList.remove('show-cursor'), 2000); });
  $('#stage').addEventListener('click', next);
  document.addEventListener('keydown', e=>{
    if(e.key === ' '){ e.preventDefault(); togglePause(); }
    else if(e.key === 'ArrowRight') next();
    else if(e.key === 'ArrowLeft') prev();
    else if(e.key === 'c') body.classList.toggle('no-caption');
    else if(e.key === 'k') body.classList.toggle('no-clock');
    else if(e.key === 'f'){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(()=>{}); }
  });

  /* ── go ── */
  document.title = (srcs.length === ALL.length ? 'All photos' : srcs.map(k => SOURCES[k].label).join(' + ')) + ' · photo frame';
  start(true);
  setInterval(()=> start(false), REFRESH_MS);
  setTimeout(()=> location.reload(), RELOAD_MS);
})();
