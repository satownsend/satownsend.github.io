/* 02 · Frost valley: a month or year of hourly temperatures as terrain (hour of
 * day × calendar date). A frozen lake fills everything below 32°F; journal
 * entries (frost, damage, covering, bringing pots in…) stand on the terrain
 * where and when you logged them. Gold lines trace sunrise and sunset. */
import { tempColor, disposeTree } from '../core.js';
import { periodDates, temperatureGrid, loadPeriodMonths } from './frost-model.js?v=1';

const XW = 30, ZW = 34;                         // hour axis width, day axis depth
const EVENT = {
  'frost':          { g: '❄️', label: 'Frost logged' },
  'frost damage':   { g: '🥀', label: 'Frost damage' },
  'covered':        { g: '🛡️', label: 'Covered' },
  'uncovered':      { g: '🌤️', label: 'Uncovered' },
  'brought inside': { g: '🏠', label: 'Brought inside' },
  'taken outside':  { g: '🪴', label: 'Taken outside' },
  'watered':        { g: '💧', label: 'Watered' },
};
const PROTECT = new Set(['frost', 'frost damage', 'covered', 'uncovered', 'brought inside', 'taken outside']);
const LAT = 40.4238, LON = -78.6231;

// Sunrise / sunset (NOAA approximation) as local decimal hours.
const hm = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
function sunTimes(dateStr){
  const d = new Date(dateStr + 'T12:00:00Z'), rad = Math.PI / 180;
  const n = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(LAT * rad) * Math.cos(decl)) - Math.tan(LAT * rad) * Math.tan(decl)) / rad;
  const toLocal = utcMin => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + utcMin * 60000); const [h, m] = hm.format(t).split(':').map(Number); return (h % 24) + m / 60; };
  return { rise: toLocal(720 - 4 * (LON + ha) - eq), set: toLocal(720 - 4 * (LON - ha) - eq) };
}
const hourLabel = h => { const hh = Math.floor(h) % 24, m = Math.round((h - Math.floor(h)) * 60); const ap = hh < 12 ? 'AM' : 'PM'; const h12 = hh % 12 || 12; return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`; };

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors } = ctx;
    ctx.status('Reading the journal…');
    const [logRows, byId, info] = await Promise.all([data.log().catch(() => []), data.plantsById().catch(() => new Map()), data.archiveInfo().catch(() => ({}))]);
    if (!ctx.alive()) return;

    // Months the archive covers, newest first.
    const latest = (info.latestAvailable || info.through || data.todayISO()).slice(0, 7);
    const months = [];
    for (let d = new Date(2020, 9, 1); data.isoDate(d).slice(0, 7) <= latest; d.setMonth(d.getMonth() + 1)) months.push(data.isoDate(d).slice(0, 7));
    months.reverse();
    // Default: the month you logged the most frost / protection work.
    const counts = new Map();
    const weight = new Map();   // frost and frost damage count triple when choosing the opening month
    for (const l of logRows) if (PROTECT.has(l.action)){
      const k = l.date.slice(0, 7);
      counts.set(k, (counts.get(k) || 0) + 1);
      weight.set(k, (weight.get(k) || 0) + (l.action.startsWith('frost') ? 3 : 1));
    }
    const month = months.filter(m => weight.has(m)).sort((a, b) => weight.get(b) - weight.get(a) || b.localeCompare(a))[0] || months[0];

    scene.add(new THREE.HemisphereLight(colors.light ? '#ffffff' : '#cfe8ff', colors.light ? '#8a9a8a' : '#1b2a2a', colors.light ? 1.3 : 0.95));
    const sun = new THREE.DirectionalLight('#fff4e0', colors.light ? 1.4 : 1.55);
    sun.position.set(-18, 30, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
    scene.add(sun);
    scene.fog = new THREE.Fog(colors.bg, 70, 130);

    let world = null, loadRequest = 0;
    async function show(ym){
      const request = ++loadRequest;
      ctx.status('Loading hourly temperatures for ' + periodName(ym) + '…');
      const selectedMonths = ym.length === 4 ? months.filter(m => m.startsWith(ym)).sort() : [ym];
      const active = () => ctx.alive() && request === loadRequest;
      const { hours, failed } = await loadPeriodMonths(selectedMonths, data.weatherMonth, active);
      if (!active()) return;
      if (!hours.length) throw new Error('No hourly data for ' + periodName(ym) + ' yet. Choose another period.');
      if (world){ scene.remove(world.root); for (const object of stagePicks) ctx.unpick(object); disposeTree(world.root); stagePicks.clear(); }
      world = buildPeriod(ym, hours, failed);
      scene.add(world.root);
      ctx.status(null);
    }
    const stagePicks = new Set();
    const pick = (o, h) => { stagePicks.add(o); ctx.pick(o, h); };
    const monthName = ym => new Date(ym + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const periodName = period => period.length === 4 ? 'Full year ' + period : monthName(period);

    function buildPeriod(ym, hours, failed){
      const root = new THREE.Group();
      const dates = periodDates(ym), nDays = dates.length, annual = ym.length === 4;
      const dayIndex = new Map(dates.map((date, index) => [date, index]));
      const flat = temperatureGrid(dates, hours), known = flat.filter(v => v != null);
      if (!known.length) throw new Error('No usable hourly temperatures for ' + periodName(ym));
      const T = (d, hr) => flat[d * 24 + hr];
      const tMin = Math.min(...known), tMax = Math.max(...known);
      const base = Math.min(tMin, 32) - 6;
      const S = 10.5 / Math.max(30, tMax - base);
      const yOf = f => (f - base) * S;
      const xOf = hr => (hr / 23 - 0.5) * XW;
      const zOf = d => (d / Math.max(1, nDays - 1) - 0.5) * ZW;

      // Terrain
      const geo = new THREE.PlaneGeometry(XW, ZW, 23, nDays - 1).rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++){
        const hr = i % 24, d = Math.floor(i / 24), t = T(d, hr);
        pos.setY(i, t == null ? 0 : yOf(t));
        tempColor(t, c); col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // Missing archive dates and future hours are holes, never filled temperatures.
      const indices = [];
      for (let d = 0; d < nDays - 1; d++) for (let hr = 0; hr < 23; hr++){
        const a = d * 24 + hr, b = a + 1, c = a + 24, e = c + 1;
        if ([a, b, c, e].every(i => flat[i] != null)) indices.push(a, c, b, b, c, e);
      }
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide }));
      terrain.castShadow = terrain.receiveShadow = true; root.add(terrain);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: colors.light ? '#000' : '#fff', transparent: true, opacity: colors.light ? 0.05 : 0.06 }));
      root.add(wire);
      // Skirt so the terrain reads as a solid block
      const skirt = new THREE.Group();
      const skirtMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.panel).multiplyScalar(colors.light ? 0.92 : 0.8), side: THREE.DoubleSide });
      const edge = (pts) => { const g = new THREE.BufferGeometry(); const v = []; for (let k = 0; k < pts.length - 1; k++){ const [a, b] = [pts[k], pts[k + 1]]; if (a.y == null || b.y == null) continue; v.push(a.x, 0, a.z, b.x, 0, b.z, b.x, a.y2, b.z, a.x, 0, a.z, b.x, a.y2, b.z, a.x, a.y, a.z); } g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); skirt.add(new THREE.Mesh(g, skirtMat)); };
      const knownHeight = t => t == null ? null : yOf(t);
      const side = (fn, len) => { const p = []; for (let k = 0; k < len; k++){ const q = fn(k); p.push(q); } for (let k = 0; k < p.length - 1; k++) p[k].y2 = p[k + 1].y; edge(p); };
      side(k => ({ x: xOf(k), z: zOf(0), y: knownHeight(T(0, k)) }), 24);
      side(k => ({ x: xOf(k), z: zOf(nDays - 1), y: knownHeight(T(nDays - 1, k)) }), 24);
      side(k => ({ x: xOf(0), z: zOf(k), y: knownHeight(T(k, 0)) }), nDays);
      side(k => ({ x: xOf(23), z: zOf(k), y: knownHeight(T(k, 23)) }), nDays);
      root.add(skirt);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(XW + 1.2, 0.5, ZW + 1.2), new THREE.MeshStandardMaterial({ color: colors.panel, roughness: 0.9 }));
      plinth.position.y = -0.25; plinth.receiveShadow = true; root.add(plinth);

      // The frozen lake at 32°F
      const below = known.filter(v => v <= 32).length;
      if (tMin <= 32){
        const lakeGeo = geo.clone();
        for (let i = 0; i < lakeGeo.attributes.position.count; i++) lakeGeo.attributes.position.setY(i, yOf(32));
        lakeGeo.computeVertexNormals();
        const lake = new THREE.Mesh(lakeGeo, new THREE.MeshStandardMaterial({ color: '#8fdcff', emissive: '#2a7fa8', emissiveIntensity: 0.35, transparent: true, opacity: colors.light ? 0.6 : 0.55, roughness: 0.12, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
        root.add(lake);
        // 32°F contour (marching squares)
        const seg = [], lv = 32, yy = yOf(32) + 0.03;
        const interp = (x1, z1, t1, x2, z2, t2) => { const k = (lv - t1) / (t2 - t1); return [x1 + (x2 - x1) * k, z1 + (z2 - z1) * k]; };
        for (let d = 0; d < nDays - 1; d++) for (let hr = 0; hr < 23; hr++){
          const q = [[xOf(hr), zOf(d), T(d, hr)], [xOf(hr + 1), zOf(d), T(d, hr + 1)], [xOf(hr + 1), zOf(d + 1), T(d + 1, hr + 1)], [xOf(hr), zOf(d + 1), T(d + 1, hr)]];
          if (q.some(p => p[2] == null)) continue;
          const pts = [];
          for (let e = 0; e < 4; e++){ const a = q[e], b = q[(e + 1) % 4]; if ((a[2] < lv) !== (b[2] < lv)) pts.push(interp(a[0], a[1], a[2], b[0], b[1], b[2])); }
          for (let k = 0; k + 1 < pts.length; k += 2) seg.push(pts[k][0], yy, pts[k][1], pts[k + 1][0], yy, pts[k + 1][1]);
        }
        const contour = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)),
          new THREE.LineBasicMaterial({ color: colors.light ? '#0a6d9a' : '#e8fbff' }));
        root.add(contour);
        const lab = ctx.text('32°F', { size: 0.7, color: colors.light ? '#0a6d9a' : '#d8f6ff' }); lab.position.set(XW / 2 + 1.6, yOf(32), ZW / 2); root.add(lab);
      }

      // Sunrise / sunset lines
      const sunPts = { rise: [], set: [] };
      for (let d = 0; d < nDays; d++){
        const ds = dates[d], st = sunTimes(ds);
        for (const k of ['rise', 'set']){
          const hr = st[k], h0 = Math.floor(hr), f = hr - h0;
          const t0 = T(d, Math.min(23, h0)), t1 = T(d, Math.min(23, h0 + 1));
          const t = t0 == null || t1 == null ? null : t0 * (1 - f) + t1 * f;
          sunPts[k].push(t == null ? null : new THREE.Vector3(xOf(hr), yOf(t) + 0.08, zOf(d)));
        }
      }
      for (const k of ['rise', 'set']){
        const segments = [];
        for (let d = 1; d < nDays; d++) if (sunPts[k][d - 1] && sunPts[k][d]) segments.push(sunPts[k][d - 1], sunPts[k][d]);
        const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), new THREE.LineBasicMaterial({ color: '#ffc95a' })); root.add(line);
        const first = sunPts[k].find(Boolean);
        if (first){ const lab = ctx.text(k === 'rise' ? 'sunrise' : 'sunset', { size: 0.55, color: '#ffc95a' }); lab.position.copy(first).add(new THREE.Vector3(0, .6, -1.2)); root.add(lab); }
      }

      // Axes: hours along the front, days down the side
      for (const hr of [0, 3, 6, 9, 12, 15, 18, 21, 23]){
        const s = ctx.text(hr === 23 ? '11 PM' : hr === 12 ? 'noon' : hr === 0 ? 'midnight' : hourLabel(hr), { size: 0.55, color: colors.muted });
        s.position.set(xOf(hr), 0.25, ZW / 2 + 1.6); root.add(s);
      }
      for (let d = 0; d < nDays; d++){
        const dt = new Date(dates[d] + 'T12:00:00'), wk = dt.getDay();
        if (annual && !dates[d].endsWith('-01') && d !== nDays - 1) continue;
        if (!annual && nDays > 20 && d % 2 && d !== nDays - 1) continue;
        const s = ctx.text(dt.toLocaleDateString(undefined, annual && d !== nDays - 1 ? { month: 'short' } : { month: 'short', day: 'numeric' }), { size: 0.5, color: wk === 0 || wk === 6 ? colors.ink : colors.muted, align: 'right', weight: 500 });
        s.position.set(-XW / 2 - 0.9, 0.25, zOf(d)); root.add(s);
      }

      // Coldest hour
      let ci = flat.findIndex(v => v != null); flat.forEach((v, i) => { if (v != null && v < flat[ci]) ci = i; });
      const cd = Math.floor(ci / 24), ch = ci % 24;
      const cold = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glow(), color: '#7fd8ff', transparent: true, depthWrite: false, depthTest: false }));
      cold.scale.set(1.6, 1.6, 1); cold.position.set(xOf(ch), yOf(flat[ci]) + 0.2, zOf(cd)); root.add(cold);
      const cl = ctx.text(`coldest · ${Math.round(flat[ci])}°F`, { size: 0.55, color: colors.ink, bg: colors.light ? 'rgba(255,255,255,.8)' : 'rgba(8,25,28,.75)', depthTest: false });
      cl.position.copy(cold.position).add(new THREE.Vector3(0, 1.2, 0)); root.add(cl);

      // Journal pins
      const groups = new Map();
      for (const l of logRows){
        if (!dayIndex.has(l.date) || !EVENT[l.action]) continue;
        const hr = /^\d{1,2}:\d{2}/.test(l.time) ? Math.min(23, (+l.time.split(':')[0]) + (+l.time.split(':')[1]) / 60) : (l.action === 'frost' || l.action === 'frost damage' ? 7 : 12);
        const key = l.date + '|' + l.action + '|' + Math.round(hr);
        if (!groups.has(key)) groups.set(key, { date: l.date, action: l.action, hr, rows: [] });
        groups.get(key).rows.push(l);
      }
      let pinCount = 0;
      for (const gp of groups.values()){
        const d = dayIndex.get(gp.date), h0 = Math.floor(gp.hr), f = gp.hr - h0;
        const t0 = T(d, h0), t1 = T(d, Math.min(23, h0 + 1));
        const t = t0 == null || t1 == null ? null : t0 * (1 - f) + t1 * f;
        const top = yOf(Math.max(t ?? 32, 32)) + 2.2 + (pinCount % 3) * 0.35;
        const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xOf(gp.hr), yOf(t ?? 32), zOf(d)), new THREE.Vector3(xOf(gp.hr), top - 0.45, zOf(d))]),
          new THREE.LineBasicMaterial({ color: colors.ink, transparent: true, opacity: 0.55 }));
        root.add(stem);
        const s = ctx.glyph(EVENT[gp.action].g, 1.45, colors.light ? 'rgba(255,255,255,.9)' : 'rgba(10,30,40,.8)');
        s.position.set(xOf(gp.hr), top, zOf(d)); root.add(s);
        const names = [...new Set(gp.rows.map(r => (byId.get(r.plantId) || {}).name).filter(Boolean))];
        const notes = gp.rows.map(r => r.note).filter(Boolean);
        const temps = gp.rows.map(r => r.temp).filter(v => v != null);
        pick(s, { tip: () => `<span class="t-head">${EVENT[gp.action].g} ${EVENT[gp.action].label}</span>${data.fmtDate(gp.date, { weekday: 'short', month: 'short', day: 'numeric' })}${gp.rows[0].time ? ' · ' + data.esc(gp.rows[0].time) : ''}`
          + (temps.length ? ` · logged ${temps.join(', ')}°F` : '')
          + (names.length ? `<br>${names.slice(0, 8).map(data.esc).join(', ')}${names.length > 8 ? ` +${names.length - 8} more` : ''}` : '')
          + (notes.length ? `<span class="t-sub">“${data.esc(notes[0].slice(0, 140))}”</span>` : '')
          + `<span class="t-sub">Archive estimate then: ${t == null ? 'unavailable' : Math.round(t) + '°F'}</span>` });
        pinCount++;
      }

      // Hover the terrain
      pick(terrain, { tip: h => {
        const hr = Math.round((h.point.x / XW + 0.5) * 23), d = Math.round((h.point.z / ZW + 0.5) * (nDays - 1));
        if (hr < 0 || hr > 23 || d < 0 || d >= nDays) return null;
        const t = T(d, hr), ds = dates[d];
        if (t == null) return null;
        const dayVals = flat.slice(d * 24, d * 24 + 24).filter(v => v != null), lo = Math.min(...dayVals), hi = Math.max(...dayVals);
        return `<span class="t-head">${data.fmtDate(ds, { weekday: 'short', month: 'short', day: 'numeric' })} · ${hourLabel(hr)}</span><span class="sw" style="background:#${tempColor(t).getHexString()}"></span><b>${Math.round(t)}°F</b>${t <= 32 ? ' · below freezing' : ''}<span class="t-sub">That day: ${Math.round(lo)}° to ${Math.round(hi)}°F</span>`;
      } });

      // Period summary
      const nightsBelow = new Set(); for (let d = 0; d < nDays; d++) if (flat.slice(d * 24, d * 24 + 24).some(v => v != null && v <= 32)) nightsBelow.add(d);
      const logged = [...groups.values()].filter(g => PROTECT.has(g.action)).length;
      ui.readout(`<strong>${periodName(ym)}</strong>${below ? `${below} hourly slots at or below 32°F on ${nightsBelow.size} day${nightsBelow.size === 1 ? '' : 's'}` : 'No freezing hours'}<br><span class="k">Coldest</span> ${Math.round(flat[ci])}°F, ${data.fmtDate(dates[cd], { month: 'short', day: 'numeric' })} at ${hourLabel(ch)}<br><span class="k">Journal</span> ${logged ? `${logged} frost or protection entr${logged === 1 ? 'y' : 'ies'}` : 'no frost or protection entries'}<br><span class="k">Coverage</span> ${known.length.toLocaleString()} / ${flat.length.toLocaleString()} hourly slots${known.length < flat.length ? ' · missing/future data stays empty' : ''}${failed.length ? '<br>Unavailable months: ' + failed.map(data.esc).join(', ') : ''}`);
      return { root };
    }

    let mode = 'month', year = month.slice(0, 4);
    const changePeriod = () => show(mode === 'year' ? year : monthSelect.value).catch(e => { if (ctx.alive()) ctx.status('Couldn’t load that period: ' + e.message); });
    ui.select({ label: 'View', value: mode, options: [{ value: 'month', label: 'Month' }, { value: 'year', label: 'Full year' }], onChange: value => { mode = value; monthSelect.parentElement.style.display = mode === 'month' ? '' : 'none'; yearSelect.parentElement.style.display = mode === 'year' ? '' : 'none'; changePeriod(); } });
    const yearSelect = ui.select({ label: 'Year', value: year, options: [...new Set(months.map(m => m.slice(0, 4)))].map(y => ({ value: y, label: y })), onChange: value => { year = value; changePeriod(); } });
    yearSelect.parentElement.style.display = 'none';
    const monthSelect = ui.select({ label: 'Month', value: month, options: months.map(m => ({ value: m, label: monthName(m) + (counts.has(m) ? ` · ${counts.get(m)} frost/protection logs` : '') })), onChange: value => { year = value.slice(0, 4); yearSelect.value = year; changePeriod(); } });
    ui.gradient({ min: -10, max: 100, label: 'Temperature', ticks: [0, 32, 50, 70, 90] });
    ui.legend([{ color: '#bfefff', label: 'Frozen lake: below 32°F', shape: 'bar' }, { color: '#ffc95a', label: 'Sunrise / sunset', shape: 'line' }]);
    ui.legend(Object.values(EVENT).map(e => ({ shape: 'glyph', glyph: e.g, label: e.label })), 'Journal');
    ctx.about(`<p>Every hour of a month or full calendar year as a landscape: <strong>left to right</strong> is the time of day, <strong>front to back</strong> the calendar dates, and height and color are the temperature. The pale <strong>frozen lake</strong> fills everything at or below 32°F, so frost nights show up as valleys sunk under the ice, usually just before the gold sunrise line.</p><p>Pins are what you logged in the plant journal during the selected period: frost, frost damage, covering plants, bringing pots inside. Choose Full year to see January–December, with month labels along the date axis. Missing archived months and future hours stay empty; freezing counts use available hourly slots only. Repeated fall-back hours are averaged into one slot; the missing spring-forward hour stays empty. The month picker opens on the month you logged the most frost work; months with entries are marked. Temperatures are hourly ERA5 estimates for Lilly, so a sheltered corner of the yard can run colder.</p>`);

    camera.position.set(-26, 26, 34); controls.target.set(0, 3, 0);
    controls.maxDistance = 120;
    await show(month);
    return {};
  },
};
