/* The yard in 3D: data loaders shared by every scene. Each loader runs once
 * per page view (memoized) and returns plain objects.
 *
 * Sources (all read-only, the same ones the dashboards use):
 * - Plants spreadsheet tabs (public CSV): plants, plant_photos, log,
 *   care_schedule, plant_overview, weather_history, yard_view_pins.
 * - Wildlife spreadsheet: sightings and wildlife photos.
 * - The permanent ERA5 weather archive behind the chatbot Worker (daily per
 *   year, hourly per month), stored in °C / mm and converted to °F / inches.
 * Privacy matches the dashboards: photos marked "hide from gallery" are left
 * out, and yard photos only appear when signed in. */
export const R2 = 'https://pub-59a926166fd84970bea75caf38a52d27.r2.dev';
const PLANTS_SHEET = '1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM';
const WILDLIFE_SHEET = '1Uq2Fgzron3yDZqYFWsUx1cYigp4w8GmQP2pmk33DG54';
const ARCHIVE = 'https://satownsend-chatbot.satownsend.workers.dev/weather-archive';
export const ARCHIVE_START = '2020-10-01';
export const TZ = 'America/New_York';
export const PLACE = 'Lilly, PA';

export const isAuthed = () => { try { return !!(window.GAuth && window.GAuth.isAuthed()); } catch(e){ return false; } };

/* ---------- CSV ---------- */
export function parseCSV(text){
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (q){
      if (ch === '"'){ if (text[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ','){ row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r'){
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
function toObjects(rows){
  if (!rows.length) return [];
  const h = rows[0].map(x => (x || '').trim());
  return rows.slice(1).filter(r => r.some(c => (c || '').trim())).map(r => {
    const o = {}; h.forEach((k, i) => { if (k) o[k] = (r[i] || '').trim(); }); return o;
  });
}
// Google's CSV endpoint occasionally returns an empty body or a 5xx: retry.
async function csv(url, { allowEmpty = false } = {}){
  let last;
  for (let attempt = 0; attempt < 3; attempt++){
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = toObjects(parseCSV((await r.text()).replace(/^﻿/, '')));
      if (rows.length || allowEmpty) return rows;
      last = new Error('empty');
    } catch(e){ last = e; }
    await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
  }
  if (allowEmpty) return [];
  throw new Error('Could not read the spreadsheet (' + (last && last.message) + ')');
}
const tab = (name, opts) => csv(`https://docs.google.com/spreadsheets/d/${PLANTS_SHEET}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`, opts);
const gid = (sheet, g, opts) => csv(`https://docs.google.com/spreadsheets/d/${sheet}/export?format=csv&gid=${g}`, opts);

const memo = new Map();
function once(key, fn){ if (!memo.has(key)) memo.set(key, fn().catch(e => { memo.delete(key); throw e; })); return memo.get(key); }
export function forget(){ memo.clear(); }

const bool = v => String(v).toUpperCase() === 'TRUE';
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => isoDate(new Date());
export const parseDate = s => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? new Date(s.slice(0, 10) + 'T12:00:00') : null);
export function dayOfYear(d){ const s = new Date(d.getFullYear(), 0, 1, 12); return Math.round((d - s) / 864e5); }
export const daysInYear = y => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
export const fmtDate = (s, o = { month: 'short', day: 'numeric', year: 'numeric' }) => { const d = parseDate(s); return d ? d.toLocaleDateString(undefined, o) : (s || ''); };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cToF = c => c == null ? null : Math.round((c * 9 / 5 + 32) * 10) / 10;
export const mmToIn = mm => mm == null ? null : Math.round(mm / 25.4 * 1000) / 1000;
export function imageURL(key){ return R2 + '/' + String(key).split('/').map(encodeURIComponent).join('/'); }
export const thumbURL = key => imageURL(key + '.thumb.jpg');

/* ---------- plants sheet ---------- */
export const plants = () => once('plants', async () => (await tab('plants')).filter(p => p.id && !bool(p.wishlist)).map(p => ({
  id: p.id, name: p.name || '(unnamed)', type: p.type || '', category: p.category || 'Other', spot: p.spot || '',
  container: bool(p.container), dead: bool(p.dead), quantity: Math.max(1, parseInt(p.quantity, 10) || 1),
  purchased: p.purchased || '', planted: p.planted || '', notes: p.notes || '', thumbKey: p.thumbKey || '',
})));
export const plantsById = async () => new Map((await plants()).map(p => [p.id, p]));

export const log = () => once('log', async () => (await tab('log', { allowEmpty: true })).filter(l => l.date).map(l => ({
  id: l.id, plantId: l.plantId || '', action: (l.action || '').toLowerCase(), date: l.date.slice(0, 10), time: l.time || '',
  note: l.note || '', value: num(l.value), temp: num(l.temp), causedBy: l.causedBy || '',
})));

const rawPhotos = () => once('plantPhotos', async () => (await tab('plant_photos', { allowEmpty: true })).filter(p => p.key));
/** Plant photos the current visitor may see (gallery rules), newest last. */
export async function plantPhotos({ includeHidden = false } = {}){
  const authed = isAuthed();
  return (await rawPhotos()).filter(p => (authed || p.plant_id !== 'yard') && (includeHidden || !bool(p.hideFromGallery)))
    .map(p => ({ key: p.key, plantId: p.plant_id, date: (p.date || '').slice(0, 10), caption: p.caption || '',
      yard: p.plant_id === 'yard', views: (p.viewTags || '').split('|').map(s => s.trim()).filter(Boolean) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** Yard photos by view tag. Signed-in only, exactly like the dashboard. */
export async function yardPhotos(){
  if (!isAuthed()) return [];
  return (await rawPhotos()).filter(p => p.plant_id === 'yard').map(p => ({ key: p.key, date: (p.date || '').slice(0, 10), caption: p.caption || '',
    views: (p.viewTags || '').split('|').map(s => s.trim()).filter(Boolean) }));
}

export const care = () => once('care', async () => (await tab('care_schedule', { allowEmpty: true }))
  .filter(t => t.id && t.plant_id && /^\d{2}-\d{2}$/.test(t.start || ''))
  .map(t => ({ id: t.id, plantId: t.plant_id, task: t.task || '', start: t.start, end: /^\d{2}-\d{2}$/.test(t.end || '') ? t.end : t.start,
    notes: t.notes || '', source: t.source || 'ai', skipped: t.skipped || '' })));

export const overview = () => once('overview', async () => (await tab('plant_overview', { allowEmpty: true })).filter(o => o.plant_id).map(o => {
  let cal = [];
  try { cal = JSON.parse(o.calendar || '[]'); } catch(e){}
  cal = (Array.isArray(cal) ? cal : []).filter(c => c && c.s >= 1 && c.s <= 12 && c.e >= 1 && c.e <= 12 && /^#[0-9a-f]{6}$/i.test(c.c || ''));
  return { plantId: o.plant_id, summary: o.summary || '', height: o.height || '', width: o.width || '', growth: o.growth || '',
    hardiness: o.hardiness || '', sun: o.sun || '', bloom: o.bloom || '', calendar: cal,
    seasons: { spring: o.spring || '', summer: o.summer || '', autumn: o.autumn || '', winter: o.winter || '' } };
}));

export const viewPins = () => once('pins', async () => (await tab('yard_view_pins', { allowEmpty: true })).map(p => ({
  view: p.view, name: (p.view || '').replace(/^view:/, ''), x: num(p.x), y: num(p.y), angle: num(p.angle) ?? 0, fov: num(p.fov) ?? 60,
})).filter(p => p.view && p.x != null && p.y != null));

/** Saved forecast snapshots (the #weather forecast archive). */
export const forecasts = () => once('forecasts', async () => {
  const rows = await tab('weather_history', { allowEmpty: true });
  const groups = new Map();
  for (const r of rows){
    const part = parseInt(r.part, 10);
    if (!r.id || !Number.isInteger(part) || part < 0) continue;
    if (!groups.has(r.id)) groups.set(r.id, []);
    groups.get(r.id)[part] = r.payload || '';
  }
  const out = [];
  for (const [id, parts] of groups){
    try { const s = JSON.parse(parts.join('')); if (s.id === id && Array.isArray(s.days)) out.push(s); } catch(e){}
  }
  return out.filter(s => s.kind === 'forecast').sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
});

/* ---------- wildlife sheet ---------- */
export const sightings = () => once('sightings', async () => (await gid(WILDLIFE_SHEET, 0, { allowEmpty: true })).filter(s => s.species && s.date)
  .map(s => ({ id: s.id, species: s.species, category: s.category || 'Other', date: s.date.slice(0, 10), location: s.location || '', notes: s.notes || '' })));
export const wildlifePhotos = () => once('wildlifePhotos', async () => (await gid(WILDLIFE_SHEET, 518293746, { allowEmpty: true })).filter(p => p.key)
  .map(p => ({ key: p.key, sightingId: p.sighting_id, date: (p.date || '').slice(0, 10), caption: p.caption || '' })));

/* ---------- weather archive (ERA5) ---------- */
async function archive(query){
  const r = await fetch(`${ARCHIVE}?${query}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.items)) throw new Error(j.error || 'The weather archive is unavailable right now.');
  return j;
}
/** Daily estimates for one year: [{date, hi, lo (°F), pcp, rain (in), wind (mph)}]. */
export const weatherYear = y => once('wy' + y, async () => {
  const j = await archive('year=' + y);
  return j.items.filter(d => d.date && d.hi != null && d.lo != null)
    .map(d => ({ date: d.date, hi: cToF(d.hi), lo: cToF(d.lo), pcp: mmToIn(d.pcp) ?? 0, rain: mmToIn(d.rain) ?? 0, wind: d.wind }));
});
export const archiveInfo = () => once('archiveInfo', async () => (await archive('year=' + new Date().getFullYear())).archive || {});
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
/** Hourly estimates for one month ('YYYY-MM'), local hour of day attached. */
export const weatherMonth = ym => once('wm' + ym, async () => {
  const j = await archive('month=' + ym);
  return j.items.filter(h => h.time && h.date && h.date.startsWith(ym) && h.temp != null)
    .map(h => ({ time: h.time, date: h.date, hour: parseInt(hourFmt.format(new Date(h.time)), 10) % 24, temp: cToF(h.temp), pcp: mmToIn(h.pcp) ?? 0, wind: h.wind }));
});
export function archiveYears(){
  const out = []; for (let y = 2020; y <= new Date().getFullYear(); y++) out.push(y); return out;
}
