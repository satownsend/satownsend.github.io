/* 04 · The colors of the yard: every plant's color calendar (from its AI
 * overview, the same data as the Seasons view) wrapped around a year. One
 * layer per plant; months run around the circle like a clock. Blooms stand
 * proud and glow, fruit are berries, bare months are thin grey threads. */
const KIND = {
  bloom:     { label: 'Bloom',     out: 0.75, h: 1.0, glow: 0.22 },
  foliage:   { label: 'Foliage',   out: 0.0,  h: 0.8, glow: 0.12 },
  fruit:     { label: 'Fruit',     out: 0.35, h: 0.8, glow: 0.18 },
  bark:      { label: 'Bark',      out: -0.35, h: 0.75, glow: 0.05 },
  cone:      { label: 'Cones',     out: 0.2,  h: 0.8, glow: 0.15 },
  evergreen: { label: 'Evergreen', out: 0.0,  h: 0.8, glow: 0.08 },
  bare:      { label: 'Bare',      out: -0.6, h: 0.25, glow: 0 },
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SEASON = [['#7fb2e6', 11, 1], ['#8fd07a', 2, 4], ['#f2c84b', 5, 7], ['#e88a3a', 8, 10]];   // winter, spring, summer, autumn (0-based months)
const TAU = Math.PI * 2;
// Month m (1-12) starts at angle; January at the top (12 o'clock), clockwise.
const ang = m => (m - 1) / 12 * TAU;
const toXZ = (r, a) => [Math.sin(a) * r, -Math.cos(a) * r];

/** A solid annular sector: radii r0..r1, angles a0..a1 (clockwise from 12 o'clock), y0..y1. */
function sector(THREE, r0, r1, a0, a1, y0, y1){
  const seg = Math.max(4, Math.ceil((a1 - a0) / TAU * 96));
  const pos = [], idx = [];
  const v = (r, a, y) => { const [x, z] = toXZ(r, a); pos.push(x, y, z); return pos.length / 3 - 1; };
  const ring = [];
  for (let i = 0; i <= seg; i++){
    const a = a0 + (a1 - a0) * i / seg;
    ring.push([v(r0, a, y0), v(r1, a, y0), v(r1, a, y1), v(r0, a, y1)]);
  }
  for (let i = 0; i < seg; i++){
    const A = ring[i], B = ring[i + 1];
    for (let k = 0; k < 4; k++){ const k2 = (k + 1) % 4; idx.push(A[k], B[k], B[k2], A[k], B[k2], A[k2]); }
  }
  const capA = ring[0], capB = ring[seg];
  idx.push(capA[0], capA[2], capA[1], capA[0], capA[3], capA[2]);
  idx.push(capB[0], capB[1], capB[2], capB[0], capB[2], capB[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Gathering every plant’s seasons…');
    const [ov, plants] = await Promise.all([data.overview(), data.plants()]);
    if (!ctx.alive()) return;
    const byId = new Map(plants.map(p => [p.id, p]));
    let rows = ov.filter(o => o.calendar.length && byId.has(o.plantId) && !byId.get(o.plantId).dead)
      .map(o => ({ o, p: byId.get(o.plantId) }));
    if (!rows.length) throw new Error('No plant overviews with a color calendar yet. Generate them from Plants → AI overviews.');

    const inMonth = (e, m) => e.s <= e.e ? (m >= e.s && m <= e.e) : (m >= e.s || m <= e.e);
    const showiest = r => { const b = r.o.calendar.find(e => e.k === 'bloom') || r.o.calendar.find(e => e.k === 'fruit') || r.o.calendar.find(e => e.k === 'foliage' && /red|orange|gold|yellow|russet|scarlet|purple|crimson|bronze|copper/i.test(e.t)) || r.o.calendar[0]; return b; };
    const hue = hex => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl); return hsl; };

    scene.add(new THREE.HemisphereLight('#ffffff', colors.light ? '#8c9a8c' : '#1d2b2b', colors.light ? 1.35 : 1.0));
    const key = new THREE.DirectionalLight('#fff6e8', 1.5); key.position.set(14, 30, 20); scene.add(key);
    const rim = new THREE.DirectionalLight('#9fd8ff', 0.6); rim.position.set(-20, 10, -16); scene.add(rim);
    ctx.stage.bloomPass.strength = colors.light ? 0.08 : 0.32; ctx.stage.bloomPass.threshold = 0.86;

    const R0 = 6.2, BAND = 1.25;
    let layout = 'tower', sortBy = 'showiest', lens = null, kinds = new Set(Object.keys(KIND));
    const root = new THREE.Group(); scene.add(root);
    const tower = new THREE.Group(); root.add(tower);
    let pieces = [];

    function sortRows(){
      if (sortBy === 'name') rows.sort((a, b) => a.p.name.localeCompare(b.p.name));
      else if (sortBy === 'category') rows.sort((a, b) => a.p.category.localeCompare(b.p.category) || a.p.name.localeCompare(b.p.name));
      else if (sortBy === 'hue') rows.sort((a, b) => { const ha = hue(showiest(a).c), hb = hue(showiest(b).c); return (ha.s < 0.15) - (hb.s < 0.15) || ha.h - hb.h; });
      else rows.sort((a, b) => { const sa = showiest(a), sb = showiest(b); return (sa.k !== 'bloom') - (sb.k !== 'bloom') || sa.s - sb.s || a.p.name.localeCompare(b.p.name); });
    }
    const LAYER = 0.34;
    function place(i){
      if (layout === 'tower') return { y: i * LAYER, r0: R0, r1: R0 + BAND, h: LAYER * 0.82 };
      return { y: 0, r0: 2.4 + i * 0.2, r1: 2.4 + i * 0.2 + 0.17, h: 0.16 };
    }
    function build(){
      for (const p of pieces){ tower.remove(p.mesh); ctx.unpick(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
      pieces = [];
      sortRows();
      const berryGeo = new THREE.SphereGeometry(1, 12, 10);
      // Each kind has its own radial track (bark inside, foliage in the main
      // band, blooms outside, fruit as beads beyond), so nothing overlaps.
      // Entries of the same track that share months split the layer height.
      const track = k => (k === 'bark' || k === 'bare') ? 'inner' : (k === 'bloom') ? 'outer' : (k === 'fruit') ? 'beads' : 'mid';
      const overlaps = (a, b) => { for (let m = 1; m <= 12; m++) if (inMonth(a, m) && inMonth(b, m)) return true; return false; };
      rows.forEach((r, i) => {
        const L = place(i), flat = layout !== 'tower';
        const lanes = new Map();
        for (const e of r.o.calendar){
          const tk = track(e.k), prev = r.o.calendar.filter(x => x !== e && track(x.k) === tk && r.o.calendar.indexOf(x) < r.o.calendar.indexOf(e) && overlaps(x, e));
          lanes.set(e, { lane: prev.length });
        }
        for (const e of r.o.calendar){
          const k = KIND[e.k] || KIND.foliage, tk = track(e.k);
          const nLanes = 1 + Math.max(0, ...r.o.calendar.filter(x => track(x.k) === tk && overlaps(x, e)).map(x => lanes.get(x).lane));
          const lane = lanes.get(e).lane;
          const a0 = ang(e.s), span = ((e.e - e.s + 12) % 12 + 1) / 12 * TAU;
          const w = L.r1 - L.r0;
          let rIn, rOut;
          if (flat){ rIn = L.r0; rOut = L.r1; }
          else if (tk === 'inner'){ rIn = L.r0 - 0.55; rOut = L.r0 - 0.08; }
          else if (tk === 'outer'){ rIn = L.r1 + 0.06; rOut = L.r1 + 0.85; }
          else { rIn = L.r0; rOut = L.r0 + w; }
          const hh = flat ? (e.k === 'bloom' ? 0.7 : e.k === 'bare' ? 0.04 : 0.16) : L.h * (e.k === 'bare' ? 0.3 : 1);
          const y0 = L.y + hh * lane / nLanes, y1 = L.y + hh * (lane + 1) / nLanes - (nLanes > 1 ? 0.02 : 0);
          const col = new THREE.Color(e.c);
          let mesh;
          if (tk === 'beads' && !flat){
            const n = Math.max(3, Math.round(span / TAU * 40));
            mesh = new THREE.InstancedMesh(berryGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.05, emissive: col, emissiveIntensity: k.glow, transparent: true }), n);
            const m4 = new THREE.Matrix4();
            const rb = L.r1 + (r.o.calendar.some(x => x.k === 'bloom' && overlaps(x, e)) ? 1.05 : 0.22);
            for (let j = 0; j < n; j++){ const a = a0 + span * (j + 0.5) / n, [x, z] = toXZ(rb, a); m4.makeScale(0.14, 0.14, 0.14).setPosition(x, L.y + L.h * 0.5, z); mesh.setMatrixAt(j, m4); }
          } else {
            mesh = new THREE.Mesh(sector(THREE, rIn, rOut, a0 + 0.004, a0 + span - 0.004, y0, y1),
              new THREE.MeshStandardMaterial({ color: e.k === 'bare' ? new THREE.Color(colors.light ? '#9aa3a3' : '#56666a') : col, roughness: e.k === 'bloom' ? 0.45 : 0.7, emissive: col, emissiveIntensity: e.k === 'bare' ? 0 : k.glow, transparent: true }));
          }
          mesh.userData = { r, e, kind: e.k };
          tower.add(mesh);
          pieces.push({ mesh, r, e });
          ctx.pick(mesh, { tip: () => tipFor(r, e), hover: (h, on) => highlightRow(on ? r : null) });
        }
      });
      applyLens();
      if (layout === 'tower'){ nowBlade.scale.y = rows.length * LAYER + 0.4; nowBlade.position.y = (rows.length * LAYER + 0.4) / 2 - 0.1; }
      else { nowBlade.scale.y = 2.5; nowBlade.position.y = 0.8; }
      const top = layout === 'tower' ? rows.length * LAYER : 0;
      monthRing.position.y = -0.02; labelRing.position.y = layout === 'tower' ? -0.02 : 0;
      return top;
    }
    let hoverRow = null;
    function highlightRow(r){ hoverRow = r; applyLens(); }
    function applyLens(){
      for (const p of pieces){
        const vis = kinds.has(p.e.k) || (!KIND[p.e.k] && kinds.has('foliage'));
        p.mesh.visible = vis;
        const active = lens == null || inMonth(p.e, lens);
        const op = hoverRow ? (p.r === hoverRow ? 1 : 0.18) : active ? 1 : 0.1;
        p.mesh.material.opacity = op; p.mesh.material.depthWrite = op > 0.5;
      }
    }
    function tipFor(r, e){
      const months = e.s === e.e ? MONTH_FULL[e.s - 1] : `${MONTHS[e.s - 1]}–${MONTHS[e.e - 1]}`;
      const season = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'][e.s - 1];
      const desc = r.o.seasons[season];
      return `<span class="t-head">${data.esc(r.p.name)}</span><span class="sw" style="background:${e.c}"></span>${data.esc(e.t)}<br><span class="k">${(KIND[e.k] || KIND.foliage).label} · ${months}</span>${desc ? `<span class="t-sub">${data.esc(desc.slice(0, 180))}</span>` : ''}`;
    }

    // Floor: month ring with season tints, labels, spokes
    const monthRing = new THREE.Group(); root.add(monthRing);
    const labelRing = new THREE.Group(); root.add(labelRing);
    for (const [c, a, b] of SEASON){
      const a0 = ang(a + 1), a1 = a0 + ((b - a + 12) % 12 + 1) / 12 * TAU;
      const m = new THREE.Mesh(sector(THREE, R0 + 3.2, R0 + 3.9, a0, a1, -0.06, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: colors.light ? 0.55 : 0.4 }));
      monthRing.add(m);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R0 + 4.6, 96), new THREE.MeshStandardMaterial({ color: colors.panel, roughness: 1 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.07; monthRing.add(disc);
    const spokePts = [];
    for (let m = 1; m <= 12; m++){
      const a = ang(m), [x0, z0] = toXZ(1.5, a), [x1, z1] = toXZ(R0 + 4.0, a);
      spokePts.push(x0, -0.03, z0, x1, -0.03, z1);
      const [lx, lz] = toXZ(R0 + 4.9, ang(m) + TAU / 24);
      const s = ctx.text(MONTHS[m - 1], { size: 0.62, color: colors.ink, weight: 700 }); s.position.set(lx, 0.25, lz); labelRing.add(s);
    }
    monthRing.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(spokePts, 3)), new THREE.LineBasicMaterial({ color: colors.line })));

    // "Today" blade
    const now = new Date(), frac = (now.getMonth() + (now.getDate() - 1) / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) / 12;
    const nowA = frac * TAU;
    const nowBlade = new THREE.Mesh(new THREE.PlaneGeometry(R0 + 4, 1), new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    nowBlade.geometry.translate((R0 + 4) / 2, 0, 0);
    nowBlade.rotation.y = Math.PI / 2 - nowA; root.add(nowBlade);
    const [tx, tz] = toXZ(R0 + 5.6, nowA);
    const todayLab = ctx.text('today', { size: 0.55, color: colors.accent, weight: 700 }); todayLab.position.set(tx, 0.9, tz); root.add(todayLab);

    let top = build();

    // Month lens
    function setLens(m){
      lens = m;
      applyLens();
      if (m == null){ ui.readout(defaultReadout()); return; }
      const on = rows.map(r => ({ r, e: r.o.calendar.find(e => inMonth(e, m) && e.k !== 'bare' && e.k !== 'evergreen') })).filter(x => x.e);
      const blooms = on.filter(x => x.e.k === 'bloom');
      const chips = on.slice(0, 18).map(x => `<span class="sw" title="${data.esc(x.r.p.name)}: ${data.esc(x.e.t)}" style="background:${x.e.c}"></span>`).join('');
      ui.readout(`<strong>${MONTH_FULL[m - 1]}</strong>${on.length} plants showing color${blooms.length ? `, ${blooms.length} in bloom` : ''}<br>${chips}${blooms.length ? `<br><span class="k">Blooming:</span> ${blooms.slice(0, 6).map(x => data.esc(x.r.p.name)).join(', ')}${blooms.length > 6 ? '…' : ''}` : ''}`);
      // Turn that month to face the camera
      targetA = ang(m) + TAU / 24;
    }
    function defaultReadout(){
      const cm = now.getMonth() + 1;
      const blooms = rows.filter(r => r.o.calendar.some(e => e.k === 'bloom' && inMonth(e, cm)));
      return `<strong>${rows.length} plants</strong>${rows.reduce((s, r) => s + r.o.calendar.length, 0)} seasonal moments around the year<br><span class="k">This month:</span> ${blooms.length ? `${blooms.length} in bloom` : 'nothing in bloom'}`;
    }
    ui.readout(defaultReadout());

    let targetA = null, playing = false, playT = 0;
    const monthSlider = ui.range({ label: 'Month', min: 0, max: 12, step: 1, value: 0, format: v => v ? MONTH_FULL[v - 1] : 'All year', onInput: v => setLens(v || null) });
    ui.button({ label: '▶ Play the year', onClick: b => { playing = !playing; b.textContent = playing ? '❚❚ Pause' : '▶ Play the year'; if (playing && !lens) { setLens(1); monthSlider.set(1); } } });
    ui.select({ label: 'Layout', value: layout, options: [{ value: 'tower', label: 'Tower' }, { value: 'disc', label: 'Disc (from above)' }], onChange: v => {
      layout = v; top = build();
      if (v === 'disc') ctx.flyTo(new THREE.Vector3(0, 34, 10), new THREE.Vector3(0, 0, 0)); else ctx.flyTo(new THREE.Vector3(31, top * 0.72 + 9, 34), new THREE.Vector3(0, top * 0.45, 0));
    } });
    ui.select({ label: 'Order', value: sortBy, options: [{ value: 'showiest', label: 'By bloom month' }, { value: 'hue', label: 'By color' }, { value: 'category', label: 'By category' }, { value: 'name', label: 'By name' }], onChange: v => { sortBy = v; build(); } });
    for (const k of Object.keys(KIND)){
      ui.toggle({ label: KIND[k].label, value: true, onChange: v => { if (v) kinds.add(k); else kinds.delete(k); applyLens(); } });
    }
    ctx.about(`<p>Each layer of the tower is one plant, and each colored band is a stretch of months when that plant shows that color: <strong>January is at 12 o’clock</strong> and the year runs clockwise. <strong>Blooms</strong> stand proud and glow, <strong>fruit</strong> are beads, <strong>bark</strong> sits inside, and <strong>bare</strong> months are thin grey threads. The teal blade is today.</p><p>Slide the month (or play the year) to light up just what’s showing then, with a count of plants in bloom. The colors are the hex colors from each plant’s AI overview, the same calendar as the Seasons tab. Hover a band for the plant and its description for that season.</p>`);

    camera.position.set(31, top * 0.72 + 9, 34); controls.target.set(0, top * 0.45, 0);
    controls.maxDistance = 120;
    controls.autoRotate = !reducedMotion; controls.autoRotateSpeed = 0.5;
    const stopAuto = () => { controls.autoRotate = false; };
    ctx.renderer.domElement.addEventListener('pointerdown', stopAuto, { once: true });

    return {
      update(t, dt){
        if (targetA != null){
          // Swing the camera around the tower until the chosen month faces us.
          const cur = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
          const wantA = Math.atan2(Math.sin(targetA), -Math.cos(targetA));
          let d = wantA - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < 0.002 || reducedMotion) targetA = null;
          const step = reducedMotion ? d : d * Math.min(1, dt * 3);
          const off = camera.position.clone().sub(controls.target), rr = Math.hypot(off.x, off.z), na = cur + step;
          camera.position.x = controls.target.x + Math.sin(na) * rr; camera.position.z = controls.target.z + Math.cos(na) * rr;
          controls.autoRotate = false;
        }
        if (playing){
          playT += dt;
          if (playT > 1.6){ playT = 0; const m = ((lens || 0) % 12) + 1; monthSlider.set(m); setLens(m); }
        }
      },
      dispose(){ ctx.renderer.domElement.removeEventListener('pointerdown', stopAuto); },
    };
  },
};
