/* 01 · Six years of weather: one ridge per year of daily highs and lows
 * (ERA5 estimates for Lilly, PA), with rain, the freezing line, each year's
 * last spring / first fall freeze, and the frost events logged in the journal. */
import { tempColor } from '../core.js';

const W = 46, GAP = 6, S = 0.1;           // width (a year), year spacing, °F → units
const yOf = f => (f + 10) * S;               // -10°F sits on the floor
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors } = ctx;
    ctx.status('Loading six years of daily weather…');
    const years = data.archiveYears();
    const res = await Promise.allSettled(years.map(y => data.weatherYear(y)));
    const [logRows, byId] = await Promise.all([data.log().catch(() => []), data.plantsById().catch(() => new Map())]);
    if (!ctx.alive()) return;
    let yearsData = years.map((y, i) => ({ y, days: res[i].status === 'fulfilled' ? res[i].value : [] })).filter(d => d.days.length);
    if (!yearsData.length) throw new Error('The weather archive returned no days.');

    const doyX = (doy, y) => (doy / (data.daysInYear(y) - 1) - 0.5) * W;
    const n = yearsData.length;
    const zOf = i => (i - (n - 1) / 2) * GAP;    // newest year nearest the camera

    // Per-year facts: freezes, heat, rain, last spring / first fall freeze.
    for (const yd of yearsData){
      yd.byDoy = new Map(yd.days.map(d => [data.dayOfYear(data.parseDate(d.date)), d]));
      yd.freezes = yd.days.filter(d => d.lo <= 32).length;
      yd.hot = yd.days.filter(d => d.hi >= 90).length;
      yd.rain = yd.days.reduce((s, d) => s + (d.pcp || 0), 0);
      const spring = yd.days.filter(d => d.date.slice(5) < '07-01' && d.lo <= 32);
      const fall = yd.days.filter(d => d.date.slice(5) >= '07-01' && d.lo <= 32);
      yd.lastFrost = spring.length && yd.days[0].date.slice(5) <= '03-01' ? spring[spring.length - 1] : null;
      yd.firstFrost = fall.length ? fall[0] : null;
      yd.season = yd.lastFrost && yd.firstFrost ? Math.round((data.parseDate(yd.firstFrost.date) - data.parseDate(yd.lastFrost.date)) / 864e5) - 1 : null;
    }

    scene.fog = new THREE.Fog(colors.bg, 70, 150);
    const root = new THREE.Group(); scene.add(root);

    // Floor + month grid
    const depth = n * GAP + 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 10, depth + 4),
      new THREE.MeshBasicMaterial({ color: colors.panel, transparent: true, opacity: colors.light ? 0.7 : 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; root.add(floor);
    const gridPts = [];
    for (let m = 0; m <= 12; m++){
      const x = (new Date(2001, m, 1) - new Date(2001, 0, 1)) / 864e5 / 364 * W - W / 2;
      gridPts.push(x, 0, -depth / 2, x, 0, depth / 2);
    }
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3)),
      new THREE.LineBasicMaterial({ color: colors.line, transparent: true, opacity: 0.7 }));
    root.add(grid);
    MONTHS.forEach((m, i) => {
      const x = (new Date(2001, i, 15) - new Date(2001, 0, 1)) / 864e5 / 364 * W - W / 2;
      const s = ctx.text(m, { size: 0.62, color: colors.muted, weight: 600 }); s.position.set(x, 0.35, depth / 2 + 0.9); root.add(s);
    });

    // Freezing plane
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(W, depth),
      new THREE.MeshBasicMaterial({ color: '#9fe3ff', transparent: true, opacity: colors.light ? 0.12 : 0.07, side: THREE.DoubleSide, depthWrite: false }));
    ice.rotation.x = -Math.PI / 2; ice.position.y = yOf(32); root.add(ice);
    const iceEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, depth)), new THREE.LineBasicMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.35 }));
    iceEdge.rotation.x = -Math.PI / 2; iceEdge.position.y = yOf(32); root.add(iceEdge);

    // Temperature scale on the left
    for (const f of [0, 32, 50, 70, 90]){
      const s = ctx.text(f + '°', { size: 0.52, color: f === 32 ? '#9fe3ff' : colors.muted, align: 'right' });
      s.position.set(-W / 2 - 1.2, yOf(f), depth / 2); root.add(s);
      const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W / 2 - 1, yOf(f), depth / 2), new THREE.Vector3(-W / 2, yOf(f), depth / 2)]),
        new THREE.LineBasicMaterial({ color: colors.line })); root.add(tick);
    }

    // Ribbons
    const ribbons = [], c = new THREE.Color();
    let smooth = true, showRain = true;
    const rainGroup = new THREE.Group(); root.add(rainGroup);
    const markers = new THREE.Group(); root.add(markers);

    function series(yd){
      if (!smooth) return yd.days.map(d => ({ d, hi: d.hi, lo: d.lo }));
      const out = [], k = 3;
      for (let i = 0; i < yd.days.length; i++){
        let sh = 0, sl = 0, cnt = 0;
        for (let j = Math.max(0, i - k); j <= Math.min(yd.days.length - 1, i + k); j++){ sh += yd.days[j].hi; sl += yd.days[j].lo; cnt++; }
        out.push({ d: yd.days[i], hi: sh / cnt, lo: sl / cnt });
      }
      return out;
    }
    function buildRibbon(yd, i){
      const pts = series(yd), z = zOf(i);
      const pos = [], col = [], idx = [], top = [], bot = [], topC = [], botC = [];
      let prevDoy = null;
      pts.forEach((p, k) => {
        const doy = data.dayOfYear(data.parseDate(p.d.date)), x = doyX(doy, yd.y);
        pos.push(x, yOf(p.lo), z, x, yOf(p.hi), z);
        tempColor(p.lo, c); col.push(c.r, c.g, c.b);
        tempColor(p.hi, c); col.push(c.r, c.g, c.b);
        if (prevDoy !== null && doy - prevDoy === 1){
          const a = (k - 1) * 2, b = k * 2;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
          top.push(pos[a * 3], pos[a * 3 + 4], z, x, yOf(p.hi), z);
          bot.push(pos[a * 3], pos[a * 3 + 1], z, x, yOf(p.lo), z);
          const ch = tempColor(pts[k - 1].hi, new THREE.Color()).multiplyScalar(1.15), ch2 = tempColor(p.hi, new THREE.Color()).multiplyScalar(1.15);
          topC.push(ch.r, ch.g, ch.b, ch2.r, ch2.g, ch2.b);
        }
        prevDoy = doy;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      const tg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(top, 3)).setAttribute('color', new THREE.Float32BufferAttribute(topC, 3));
      const topLine = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true }));
      const botLine = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(bot, 3)),
        new THREE.LineBasicMaterial({ color: colors.light ? '#2c4a8a' : '#cfe9ff', transparent: true, opacity: 0.45 }));
      const grp = new THREE.Group(); grp.add(mesh, topLine, botLine);
      mesh.userData = { yd, i };
      ctx.pick(mesh, { tip: h => tipFor(yd, h.point.x), hover: (h, on) => slice(on ? h.point.x : null) });
      return grp;
    }
    function rebuild(){
      for (const r of ribbons){ root.remove(r); r.traverse(o => { if (o.isMesh) ctx.unpick(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); }
      ribbons.length = 0;
      yearsData.forEach((yd, i) => { const r = buildRibbon(yd, i); ribbons.push(r); root.add(r); });
    }
    rebuild();

    // Year labels with the year's story
    yearsData.forEach((yd, i) => {
      const s = ctx.text(String(yd.y), { size: 1.05, color: colors.ink, weight: 700, align: 'right' });
      s.position.set(-W / 2 - 1.4, 1.3, zOf(i)); root.add(s);
      const facts = [`${yd.freezes} freezing nights`];
      if (yd.season) facts.push(`${yd.season}-day growing season`);
      if (yd.y === 2020) facts[0] = 'from Oct 1';
      const f = ctx.text(facts.join('\n'), { size: 0.4, color: colors.muted, weight: 500, align: 'right' });
      f.position.set(-W / 2 - 1.4, 0.35, zOf(i)); root.add(f);
    });

    // Rain columns in front of each ridge
    const rainDays = [];
    yearsData.forEach((yd, i) => yd.days.forEach(d => { if (d.pcp >= 0.02) rainDays.push({ yd, i, d }); }));
    const rainMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color: colors.light ? '#2f7fd8' : '#5fb4ff', transparent: true, opacity: 0.85 }), rainDays.length);
    const m4 = new THREE.Matrix4();
    rainDays.forEach((r, k) => {
      const doy = data.dayOfYear(data.parseDate(r.d.date));
      m4.makeScale(1, Math.max(0.05, r.d.pcp * 1.6), 1).setPosition(doyX(doy, r.yd.y), 0, zOf(r.i) + 0.75);
      rainMesh.setMatrixAt(k, m4);
    });
    rainGroup.add(rainMesh);
    ctx.pick(rainMesh, { tip: h => { const r = rainDays[h.instanceId]; return r ? `<span class="t-head">${data.fmtDate(r.d.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>${r.d.pcp.toFixed(2)} in of rain and snow (water)` : null; } });

    // Last spring freeze / first fall freeze diamonds
    const diamondGeo = new THREE.OctahedronGeometry(0.28);
    const iceMat = new THREE.MeshBasicMaterial({ color: '#bff1ff' });
    yearsData.forEach((yd, i) => {
      for (const [d, label] of [[yd.lastFrost, 'Last spring freeze'], [yd.firstFrost, 'First fall freeze']]){
        if (!d) continue;
        const dm = new THREE.Mesh(diamondGeo, iceMat);
        dm.position.set(doyX(data.dayOfYear(data.parseDate(d.date)), yd.y), yOf(d.lo), zOf(i) + 0.05);
        markers.add(dm);
        ctx.pick(dm, { tip: () => `<span class="t-head">${label} ${yd.y}</span>${data.fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })} · low ${Math.round(d.lo)}°F${yd.season ? `<span class="t-sub">${yd.season} frost-free days between the two</span>` : ''}` });
      }
    });

    // Frost events from the journal
    const byDate = new Map();
    for (const l of logRows){
      if (l.action !== 'frost' && l.action !== 'frost damage') continue;
      if (!byDate.has(l.date)) byDate.set(l.date, { frost: [], damage: [] });
      byDate.get(l.date)[l.action === 'frost' ? 'frost' : 'damage'].push(l);
    }
    for (const [date, ev] of byDate){
      const y = +date.slice(0, 4), i = yearsData.findIndex(v => v.y === y);
      if (i < 0) continue;
      const day = yearsData[i].byDoy.get(data.dayOfYear(data.parseDate(date)));
      const temp = ev.frost.find(f => f.temp != null)?.temp ?? (day ? day.lo : 28);
      const g = ctx.glyph(ev.damage.length ? '🥀' : '❄️', 0.95, colors.light ? 'rgba(255,255,255,.85)' : 'rgba(10,30,40,.65)');
      g.position.set(doyX(data.dayOfYear(data.parseDate(date)), y), yOf(temp) + (ev.damage.length ? 1.1 : 0.55), zOf(i) + 0.2);
      markers.add(g);
      const names = [...new Set(ev.damage.map(d => (byId.get(d.plantId) || {}).name).filter(Boolean))];
      ctx.pick(g, { tip: () => `<span class="t-head">${data.fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>`
        + (ev.frost.length ? `Frost logged${ev.frost.some(f => f.temp != null) ? ' at ' + ev.frost.filter(f => f.temp != null).map(f => f.temp + '°F').join(', ') : ''}.` : '')
        + (names.length ? `<br>Frost damage on ${names.length} plant${names.length > 1 ? 's' : ''}: ${names.map(data.esc).join(', ')}` : '')
        + (day ? `<span class="t-sub">Archive low that night: ${Math.round(day.lo)}°F</span>` : '') });
    }

    // Hover slice: the same date across every year
    const sliceGeo = new THREE.BufferGeometry();
    sliceGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3));
    const sliceLines = new THREE.LineSegments(sliceGeo, new THREE.LineBasicMaterial({ color: colors.light ? '#000' : '#fff', transparent: true, opacity: 0.9 }));
    sliceLines.visible = false; root.add(sliceLines);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(depth, 12), new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.y = Math.PI / 2; plane.position.y = 6; plane.visible = false; root.add(plane);
    function slice(x){
      if (x == null){ sliceLines.visible = plane.visible = false; return; }
      const frac = x / W + 0.5, a = sliceGeo.attributes.position.array;
      yearsData.forEach((yd, i) => {
        const doy = Math.round(frac * (data.daysInYear(yd.y) - 1)), d = yd.byDoy.get(doy);
        const lo = d ? yOf(d.lo) : 0, hi = d ? yOf(d.hi) : 0;
        a.set([x, lo - 0.25, zOf(i) + 0.02, x, hi + 0.25, zOf(i) + 0.02], i * 6);
      });
      sliceGeo.attributes.position.needsUpdate = true;
      plane.position.x = x; sliceLines.visible = plane.visible = true;
    }
    function tipFor(yd, x){
      const doy = Math.round((x / W + 0.5) * (data.daysInYear(yd.y) - 1));
      const d = yd.byDoy.get(doy); if (!d) return null;
      const md = d.date.slice(5);
      const others = yearsData.filter(o => o !== yd).map(o => { const od = o.days.find(v => v.date.slice(5) === md); return od ? `${o.y}: ${Math.round(od.hi)}° / ${Math.round(od.lo)}°` : null; }).filter(Boolean);
      return `<span class="t-head">${data.fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>`
        + `High <b>${Math.round(d.hi)}°F</b> · Low <b>${Math.round(d.lo)}°F</b>${d.pcp >= 0.01 ? ` · ${d.pcp.toFixed(2)} in rain` : ''}`
        + (others.length ? `<span class="t-sub">Same date: ${others.join(' · ')}</span>` : '');
    }

    // Latest day marker
    const last = yearsData[n - 1], ld = last.days[last.days.length - 1];
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glow(), color: colors.accent, transparent: true, depthWrite: false }));
    dot.scale.set(1.4, 1.4, 1); dot.position.set(doyX(data.dayOfYear(data.parseDate(ld.date)), last.y), yOf(ld.hi) + 0.35, zOf(n - 1)); root.add(dot);
    const lt = ctx.text('latest · ' + data.fmtDate(ld.date, { month: 'short', day: 'numeric' }), { size: 0.42, color: colors.accent }); lt.position.copy(dot.position).add(new THREE.Vector3(0, 0.75, 0)); root.add(lt);

    // Extremes for the readout
    const all = yearsData.flatMap(v => v.days);
    const cold = all.reduce((a, b) => b.lo < a.lo ? b : a), hot = all.reduce((a, b) => b.hi > a.hi ? b : a);
    const wet = all.reduce((a, b) => (b.pcp || 0) > (a.pcp || 0) ? b : a);
    ui.readout(`<strong>${all.length.toLocaleString()} days</strong><span class="k">Coldest</span> ${Math.round(cold.lo)}°F, ${data.fmtDate(cold.date)}<br><span class="k">Hottest</span> ${Math.round(hot.hi)}°F, ${data.fmtDate(hot.date)}<br><span class="k">Wettest</span> ${wet.pcp.toFixed(2)} in, ${data.fmtDate(wet.date)}`);

    // Controls
    ui.toggle({ label: 'Daily detail', value: false, title: 'Off: each day is averaged with the three days either side, to show the seasons’ shape. On: every raw day.', onChange: v => { smooth = !v; rebuild(); } });
    ui.toggle({ label: 'Rain', value: true, onChange: v => { showRain = v; rainGroup.visible = v; } });
    ui.toggle({ label: 'Freeze markers', value: true, onChange: v => { markers.visible = v; } });
    ui.toggle({ label: 'Freezing plane', value: true, onChange: v => { ice.visible = iceEdge.visible = v; } });
    ui.gradient({ min: -10, max: 100, label: 'Temperature', ticks: [0, 32, 50, 70, 90] });
    ui.legend([{ color: colors.light ? '#2f7fd8' : '#5fb4ff', label: 'Daily rain (column height)', shape: 'bar' },
      { color: '#bff1ff', label: 'Last spring / first fall freeze', shape: 'dot' },
      { shape: 'glyph', glyph: '❄️', label: 'Frost logged' }, { shape: 'glyph', glyph: '🥀', label: 'Frost damage logged' }]);
    ctx.about(`<p>Each ridge is a year, smoothed over a week so the seasons read clearly (turn on <strong>Daily detail</strong> for every raw day). The top edge traces the <strong>highs</strong>, the bottom edge the <strong>lows</strong>, and the color is the temperature itself. Anything poking below the pale <strong>freezing plane</strong> was a frost night. Hover any day to see the same date in every other year.</p><p>The pale diamonds mark each year’s last spring freeze and first fall freeze; the days between them are the frost-free growing season. Blue columns in front of each ridge are daily rain. ❄️ and 🥀 are the frost and frost damage you logged in the plant journal.</p>`);

    camera.position.set(-3, 25, 42); controls.target.set(0, 3, 3);
    controls.maxDistance = 140;
    return {};
  },
};
