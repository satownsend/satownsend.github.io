/* The yard in 3D: page shell. Picks a scene from the hash, loads its module
 * on demand, and hands it a context (stage + data + UI helpers). */
import { Stage, THREE, textSprite, glyphSprite, glowTexture, themeColors, reducedMotion, TEMP_GRADIENT } from './core.js';
import * as Data from './data.js';

export const SCENES = [
  { id: 'ridgelines', n: '01', title: 'Six years of weather', blurb: 'Every day’s high and low since 2020, one ridge per year', source: 'Weather', href: '/plants/#weather' },
  { id: 'frost',      n: '02', title: 'Frost valley',        blurb: 'Hour-by-hour temperature terrain with your frost and protection logs', source: 'Weather', href: '/plants/#weather' },
  { id: 'rain',       n: '03', title: 'Rain & the watering can', blurb: 'Rain falls from above, your watering rises from below', source: 'Weather', href: '/plants/#weather' },
  { id: 'colors',     n: '04', title: 'The colors of the yard', blurb: 'Each plant’s color through the months, wrapped into a tower', source: 'Seasons', href: '/plants/#year' },
  { id: 'orrery',     n: '05', title: 'Care orrery',         blurb: 'Every care task as an arc around the year, with a hand for today', source: 'Care calendar', href: '/plants/#calendar' },
  { id: 'viewpoints', n: '06', title: 'Yard viewpoints',     blurb: 'Where the yard photos are taken from, on the yard map', source: 'Plants', href: '/plants/' },
  { id: 'tunnel',     n: '07', title: 'Memory tunnel',       blurb: 'Fly through every photo, sighting and journal entry in time', source: 'Backyard year', href: '/backyard-year/' },
  { id: 'redwood',    n: '08', title: 'Dawn redwood time machine', blurb: 'The most photographed tree, grown from its measurements and seasons', source: 'Plants', href: '/plants/' },
  { id: 'rings',      n: '09', title: 'Rings of the yard',   blurb: 'Every plant on the growth ring of the year it arrived', source: 'Backyard year', href: '/backyard-year/' },
];

const $ = s => document.querySelector(s);
const host = $('#stage'), tip = $('#tip'), loading = $('#loading');
const stage = new Stage(host, tip);
let currentId = null, loadToken = 0;

/* ---------- theme picker (same pattern as the other pages) ---------- */
function applyTheme(value){
  if (value === 'default') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = value;
  const t = (window.THEMES || []).find(x => x.id === value);
  const meta = document.querySelector('meta[name=theme-color]'); if (t && meta) meta.content = t.meta;
}
(function initTheme(){
  const sel = $('#themeSelect'); if (!sel || !window.THEMES) return;
  let theme = 'default'; try { theme = localStorage.getItem('satownsend.theme') || 'default'; } catch(e){}
  if (!window.THEMES.some(t => t.id === theme)) theme = 'default';
  sel.innerHTML = window.THEMES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  sel.value = theme; applyTheme(theme);
  sel.addEventListener('change', () => {
    applyTheme(sel.value); try { localStorage.setItem('satownsend.theme', sel.value); } catch(e){}
    if (currentId) load(currentId, { keepCamera: true });   // scenes read the theme's colors
  });
})();

/* ---------- picker ---------- */
const picker = $('#picker');
picker.innerHTML = SCENES.map(s => `<a class="y3-card" href="#${s.id}" data-id="${s.id}">
  <span class="y3-card-n">${s.n}</span><span class="y3-card-t">${s.title}</span>
  <span class="y3-card-b">${s.blurb}</span><span class="y3-card-s">${s.source}</span></a>`).join('');

/* ---------- UI helpers handed to scenes ---------- */
const controlsEl = $('#controls'), legendEl = $('#legend'), readoutEl = $('#readout');
function field(label, input){
  const w = document.createElement('label'); w.className = 'y3-field';
  if (label){ const s = document.createElement('span'); s.textContent = label; w.appendChild(s); }
  w.appendChild(input); controlsEl.appendChild(w); return w;
}
const ui = {
  clear(){ controlsEl.innerHTML = ''; legendEl.innerHTML = ''; readoutEl.innerHTML = ''; readoutEl.hidden = true; },
  select({ label, options, value, onChange }){
    const s = document.createElement('select');
    s.innerHTML = options.map(o => `<option value="${Data.esc(o.value)}">${Data.esc(o.label)}</option>`).join('');
    s.value = String(value); s.addEventListener('change', () => onChange(s.value));
    field(label, s); return s;
  },
  range({ label, min, max, step = 1, value, onInput, format = v => v, wide = false }){
    const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
    const out = document.createElement('output'); out.textContent = format(+value);
    const w = field(label, r); w.appendChild(out); if (wide) w.classList.add('wide');
    r.addEventListener('input', () => { out.textContent = format(+r.value); onInput(+r.value); });
    return { el: r, set(v, fire = false){ r.value = v; out.textContent = format(+r.value); if (fire) onInput(+r.value); }, get: () => +r.value };
  },
  toggle({ label, value, onChange, title }){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'y3-pill ghost'; b.textContent = label;
    if (title) b.title = title;
    b.setAttribute('aria-pressed', value ? 'true' : 'false');
    b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); onChange(v); });
    controlsEl.appendChild(b); return { el: b, set(v){ b.setAttribute('aria-pressed', v ? 'true' : 'false'); } };
  },
  button({ label, onClick, primary = false, title }){
    const b = document.createElement('button'); b.type = 'button'; b.className = primary ? 'y3-btn ghost primary' : 'y3-btn ghost';
    b.textContent = label; if (title) b.title = title; b.addEventListener('click', () => onClick(b));
    controlsEl.appendChild(b); return b;
  },
  spacer(){ const s = document.createElement('span'); s.className = 'y3-spacer'; controlsEl.appendChild(s); },
  /** items: [{color, label, shape: 'dot'|'bar'|'line'|'ring'|'glyph', glyph}] */
  legend(items, title){
    const g = document.createElement('div'); g.className = 'y3-leg-group';
    if (title){ const h = document.createElement('span'); h.className = 'y3-leg-title'; h.textContent = title; g.appendChild(h); }
    for (const it of items){
      const i = document.createElement('span'); i.className = 'y3-leg';
      i.innerHTML = it.shape === 'glyph' ? `<span class="y3-glyph">${it.glyph}</span>` : `<i class="${it.shape || 'dot'}" style="--c:${it.color}"></i>`;
      i.appendChild(document.createTextNode(it.label)); g.appendChild(i);
    }
    legendEl.appendChild(g); return g;
  },
  gradient({ stops = TEMP_GRADIENT, min, max, label, unit = '°F', ticks }){
    const g = document.createElement('div'); g.className = 'y3-leg-group';
    const span = max - min;
    const css = stops.filter(s => s.t >= min - 15 && s.t <= max + 15).map(s => `${s.c} ${((s.t - min) / span * 100).toFixed(1)}%`).join(',');
    const tk = (ticks || [min, 32, max]).filter(t => t >= min && t <= max);
    g.innerHTML = `${label ? `<span class="y3-leg-title">${label}</span>` : ''}<span class="y3-grad"><i style="background:linear-gradient(90deg,${css})"></i>${tk.map(t => `<b style="left:${((t - min) / span * 100).toFixed(1)}%">${t}${unit}</b>`).join('')}</span>`;
    legendEl.appendChild(g); return g;
  },
  readout(html){ readoutEl.hidden = !html; readoutEl.innerHTML = html || ''; },
};

/* ---------- loading a scene ---------- */
function setLoading(msg, isError = false, retry = null){
  if (!msg){ loading.hidden = true; return; }
  loading.hidden = false; loading.classList.toggle('err', isError);
  loading.innerHTML = `${isError ? '' : '<span class="y3-spin"></span>'}<span>${Data.esc(msg)}</span>`;
  if (retry){ const b = document.createElement('button'); b.type = 'button'; b.className = 'y3-btn ghost'; b.textContent = 'Try again'; b.onclick = retry; loading.appendChild(b); }
}

async function load(id, { keepCamera = false } = {}){
  const meta = SCENES.find(s => s.id === id) || SCENES[0];
  const token = ++loadToken;
  currentId = meta.id;
  const cam = keepCamera ? { pos: stage.camera.position.clone(), target: stage.controls.target.clone() } : null;
  document.querySelectorAll('.y3-card').forEach(c => { const on = c.dataset.id === meta.id; c.classList.toggle('on', on); if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); });
  // On phones the picker is a sideways strip: bring the chosen card into it.
  const activeCard = picker.querySelector(`[data-id="${meta.id}"]`);
  if (activeCard && picker.scrollWidth > picker.clientWidth) picker.scrollTo({ left: activeCard.offsetLeft - 16, behavior: reducedMotion ? 'auto' : 'smooth' });
  $('#sceneNum').textContent = meta.n;
  $('#sceneTitle').textContent = meta.title;
  $('#sceneBlurb').textContent = meta.blurb;
  $('#sceneSource').innerHTML = `From <a href="${meta.href}">${Data.esc(meta.source)}</a>`;
  $('#sceneAbout').innerHTML = '';
  $('#hint').textContent = 'Drag to orbit · scroll or pinch to zoom · right-drag to pan · hover for details';
  const i = SCENES.indexOf(meta);
  $('#prevScene').textContent = '← ' + SCENES[(i + SCENES.length - 1) % SCENES.length].title;
  $('#nextScene').textContent = SCENES[(i + 1) % SCENES.length].title + ' →';
  document.title = `${meta.title} · The yard in 3D · satownsend.com`;

  stage.token++;
  stage.clear(); ui.clear(); stage.resetCameraDefaults();
  setLoading('Loading ' + meta.title.toLowerCase() + '…');
  try {
    const mod = await import(`./scenes/${meta.id}.js?v=1`);
    if (token !== loadToken) return;
    const colors = themeColors();
    stage.scene.background = new THREE.Color(colors.bg);
    const ctx = {
      THREE, stage, scene: stage.scene, camera: stage.camera, controls: stage.controls, renderer: stage.renderer,
      data: Data, ui, colors, reducedMotion,
      alive: () => token === loadToken,
      status: msg => { if (token === loadToken) setLoading(msg); },
      about: html => { if (token === loadToken) $('#sceneAbout').innerHTML = html; },
      hint: text => { if (token === loadToken) $('#hint').textContent = text; },
      pick: (obj, handler) => { stage.pickables.set(obj, handler); return obj; },
      unpick: obj => stage.pickables.delete(obj),
      onFrame: fn => { stage.frameFns.push(fn); return fn; },
      text: textSprite, glyph: glyphSprite, glow: glowTexture,
      flyTo: (p, t, ms, done) => stage.flyTo(p, t, ms, done),
    };
    const handle = await mod.default.build(ctx);
    if (token !== loadToken){ if (handle && handle.dispose) handle.dispose(); return; }
    stage.current = handle || {};
    stage.rememberHome();
    if (cam){ stage.camera.position.copy(cam.pos); stage.controls.target.copy(cam.target); }
    setLoading(null);
  } catch(e){
    if (token !== loadToken) return;
    console.error(e);
    setLoading("Couldn't load this view: " + (e.message || e), true, () => { Data.forget(); load(meta.id); });
  }
}

/* ---------- routing & chrome ---------- */
function route(){
  const id = (location.hash || '').slice(1);
  const known = SCENES.some(s => s.id === id);
  if (!known && id){ history.replaceState(null, '', '#' + SCENES[0].id); }
  const next = known ? id : SCENES[0].id;
  if (next !== currentId) load(next);
}
window.addEventListener('hashchange', () => { route(); });
picker.addEventListener('click', e => {
  const a = e.target.closest('.y3-card'); if (!a) return;
  if (a.dataset.id === currentId){ e.preventDefault(); return; }
  // Keep the viewer in sight when choosing from far down the page.
  requestAnimationFrame(() => { const r = $('#viewer').getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.5) $('#viewer').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }); });
});
function step(d){
  const i = SCENES.findIndex(s => s.id === currentId);
  location.hash = SCENES[(i + d + SCENES.length) % SCENES.length].id;
}
$('#prevScene').addEventListener('click', () => step(-1));
$('#nextScene').addEventListener('click', () => step(1));
document.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' && e.shiftKey){ step(1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' && e.shiftKey){ step(-1); e.preventDefault(); }
});
$('#resetView').addEventListener('click', () => { if (stage.current && stage.current.reset) stage.current.reset(); else stage.goHome(); });
$('#snapBtn').addEventListener('click', () => stage.snapshot('yard-3d-' + currentId));
$('#fullBtn').addEventListener('click', () => {
  const v = $('#viewer');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  $('#fullBtn').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  document.body.classList.toggle('y3-is-full', !!document.fullscreenElement);
});
if (!document.fullscreenEnabled) $('#fullBtn').hidden = true;

route();
