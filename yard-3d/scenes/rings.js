/* 09 · Rings of the yard: the planting history as a cross-section of a tree.
 * Each growth ring is a year; like real rings, a ring is wider in a year more
 * went in. Every plant stands on its ring at the time of year it arrived
 * (January at 12 o'clock), shaped by category, colored by what it's doing
 * this month (from its overview) and sized by how often it's been photographed
 * and written about. Plants that didn't make it lie down in grey. */
const TAU = Math.PI * 2;
const toXZ = (r, a) => [Math.sin(a) * r, -Math.cos(a) * r];
const CONIFER = /spruce|fir\b|pine|cedar|arborvitae|redwood|juniper|cypress|hemlock|metasequoia|thuja|chamaecyparis|yew|cryptomeria|larch/i;
const CAT_COLOR = { Tree: '#5f9a4f', Flower: '#e07ab0', Bush: '#4e8a5e', Ground: '#8bbf5a', Grass: '#c9b45a', 'House plant': '#5fae8a', Other: '#8fb0a0' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function hash(s){ let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; }

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Counting the rings…');
    const [plants, photos, logRows, ov] = await Promise.all([data.plants(), data.plantPhotos().catch(() => []), data.log().catch(() => []), data.overview().catch(() => [])]);
    if (!ctx.alive()) return;
    const photoN = new Map(), logN = new Map();
    for (const p of photos) photoN.set(p.plantId, (photoN.get(p.plantId) || 0) + 1);
    for (const l of logRows) logN.set(l.plantId, (logN.get(l.plantId) || 0) + 1);
    const ovBy = new Map(ov.map(o => [o.plantId, o]));
    const nowM = new Date().getMonth() + 1;
    const inMonth = (e, m) => e.s <= e.e ? (m >= e.s && m <= e.e) : (m >= e.s || m <= e.e);

    const dated = plants.filter(p => /^\d{4}-\d{2}-\d{2}/.test(p.purchased));
    const undated = plants.filter(p => !/^\d{4}-\d{2}-\d{2}/.test(p.purchased));
    // Every year from the first planting to now, so a year with nothing new shows as a thin ring.
    const thisYear = new Date().getFullYear(), firstYear = Math.min(thisYear, ...dated.map(p => +p.purchased.slice(0, 4)));
    const years = []; for (let y = firstYear; y <= thisYear; y++) years.push(y);
    const perYear = new Map(years.map(y => [y, dated.filter(p => +p.purchased.slice(0, 4) === y)]));

    // Ring radii: pith for undated plants, then one ring per year, width ∝ plantings.
    const PITH = undated.length ? 2.4 : 1.2;
    const rings = []; let r = PITH;
    for (const y of years){ const n = perYear.get(y).reduce((s, p) => s + p.quantity, 0); const w = 0.9 + Math.sqrt(n) * 0.9; rings.push({ y, r0: r, r1: r + w, n }); r += w; }
    const RMAX = r, BARK = 0.9;

    /* ---------- the wood ---------- */
    const S = 2048, wc = document.createElement('canvas'); wc.width = wc.height = S;
    const g = wc.getContext('2d'), C = S / 2, k = (S / 2) / (RMAX + BARK);
    const wood = colors.light ? ['#e8cfa4', '#d9b380', '#b98a58'] : ['#c79a68', '#b3814f', '#8c5d34'];
    g.fillStyle = '#5a3a24'; g.fillRect(0, 0, S, S);
    const wobble = (a, seed) => 1 + 0.012 * Math.sin(a * 5 + seed) + 0.008 * Math.sin(a * 11 + seed * 2.3) + 0.005 * Math.sin(a * 23 + seed * 0.7);
    const ringPath = (rad, seed) => { g.beginPath(); for (let i = 0; i <= 360; i++){ const a = i / 360 * TAU, rr = rad * wobble(a, seed); const [x, z] = toXZ(rr * k, a); i ? g.lineTo(C + x, C + z) : g.moveTo(C + x, C + z); } g.closePath(); };
    // outermost first so inner rings paint over
    ringPath(RMAX, 1); g.fillStyle = wood[1]; g.fill();
    for (let i = rings.length - 1; i >= 0; i--){
      const R1 = rings[i].r1, R0 = rings[i].r0;
      ringPath(R1, i + 2); const grd = g.createRadialGradient(C, C, R0 * k, C, C, R1 * k);
      grd.addColorStop(0, wood[0]); grd.addColorStop(0.75, wood[1]); grd.addColorStop(1, wood[2]); g.fillStyle = grd; g.fill();
      // fine grain
      for (let f = 0; f < 10; f++){ ringPath(R0 + (R1 - R0) * (f + Math.random()) / 10, i * 7 + f); g.strokeStyle = `rgba(90,55,30,${0.06 + Math.random() * 0.08})`; g.lineWidth = 1 + Math.random() * 1.5; g.stroke(); }
      ringPath(R1, i + 2); g.strokeStyle = 'rgba(70,40,20,.75)'; g.lineWidth = 5; g.stroke();
    }
    ringPath(PITH, 99); g.fillStyle = colors.light ? '#f0dcb8' : '#d6ad7a'; g.fill(); g.strokeStyle = 'rgba(70,40,20,.6)'; g.lineWidth = 4; g.stroke();
    // a couple of drying checks (cracks)
    g.strokeStyle = 'rgba(50,28,14,.55)'; g.lineWidth = 3;
    for (const a0 of [0.9, 3.7, 5.2]){ g.beginPath(); let rr = RMAX * 0.98, a = a0; const [x0, z0] = toXZ(rr * k, a); g.moveTo(C + x0, C + z0); while (rr > RMAX * 0.62){ rr -= 0.25; a += (Math.random() - 0.5) * 0.02; const [x, z] = toXZ(rr * k, a); g.lineTo(C + x, C + z); } g.stroke(); }
    const woodTex = new THREE.CanvasTexture(wc); woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.anisotropy = 8;

    scene.background = new THREE.Color(colors.bg);
    scene.add(new THREE.HemisphereLight('#ffffff', colors.light ? '#a09080' : '#2a2018', colors.light ? 1.3 : 1.0));
    const sun = new THREE.DirectionalLight('#fff2dc', 1.9); sun.position.set(-16, 30, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; Object.assign(sun.shadow.camera, { left: -RMAX - 3, right: RMAX + 3, top: RMAX + 3, bottom: -RMAX - 3, near: 1, far: 80 });
    scene.add(sun);
    const THICK = 2.2;
    const barkMat = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 1 });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(RMAX + BARK, RMAX + BARK + 0.25, THICK, 160), [barkMat, new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 }), barkMat]);
    // CylinderGeometry's top cap UVs map the full square, so the canvas lines up.
    log.position.y = -THICK / 2; log.receiveShadow = true; log.castShadow = true; scene.add(log);
    const topY = 0.001;

    // Year labels along a spoke, month ticks on the rim
    rings.forEach((rg, i) => {
      const [x, z] = toXZ((rg.r0 + rg.r1) / 2, i % 2 ? 0.2 : -0.2);   // alternate sides so thin rings' labels don't collide
      const s = ctx.text(`${rg.y}`, { size: 0.95, color: colors.light ? '#3a2614' : '#fff3e2', weight: 800 }); s.position.set(x, 0.75, z); scene.add(s);
      const c = ctx.text(rg.n ? `${rg.n} planted` : 'nothing new', { size: 0.5, color: colors.light ? '#5a4024' : '#f0dcc0', weight: 500 }); c.position.set(x, 0.12, z + 0.0); scene.add(c);
    });
    MONTHS.forEach((m, i) => { const [x, z] = toXZ(RMAX + BARK + 1.4, (i + 0.5) / 12 * TAU); const s = ctx.text(m, { size: 0.85, color: colors.muted, weight: 600 }); s.position.set(x, 0.1, z); scene.add(s); });

    /* ---------- the plants ---------- */
    const geos = {
      trunk: new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8).translate(0, 0.25, 0),
      cone: new THREE.ConeGeometry(0.42, 1.25, 14).translate(0, 1.05, 0),
      ball: new THREE.IcosahedronGeometry(0.48, 1).translate(0, 0.85, 0),
      bush: new THREE.SphereGeometry(0.42, 14, 10, 0, TAU, 0, Math.PI / 2).scale(1, 0.85, 1),
      stem: new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6).translate(0, 0.35, 0),
      petal: new THREE.SphereGeometry(0.11, 10, 8).scale(1, 0.45, 1),
      mat: new THREE.CylinderGeometry(0.5, 0.55, 0.08, 18).translate(0, 0.04, 0),
      blade: new THREE.ConeGeometry(0.04, 0.8, 5).translate(0, 0.4, 0),
      pot: new THREE.CylinderGeometry(0.3, 0.22, 0.32, 16).translate(0, 0.16, 0),
    };
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 });
    const potMat = new THREE.MeshStandardMaterial({ color: '#c06b44', roughness: 0.8 });
    const lostMat = new THREE.MeshStandardMaterial({ color: colors.light ? '#9aa0a0' : '#6b7576', roughness: 0.9, transparent: true, opacity: 0.75 });
    const figures = [];
    let showLost = true, colorBy = 'month';
    function plantColor(p){
      const o = ovBy.get(p.id);
      if (colorBy === 'month' && o && o.calendar.length){
        const e = o.calendar.find(e => e.k === 'bloom' && inMonth(e, nowM)) || o.calendar.find(e => (e.k === 'foliage' || e.k === 'evergreen' || e.k === 'fruit') && inMonth(e, nowM)) || o.calendar.find(e => inMonth(e, nowM));
        if (e) return e.k === 'bare' ? '#9a8a7a' : e.c;
      }
      return CAT_COLOR[p.category] || CAT_COLOR.Other;
    }
    function makeFigure(p){
      const grp = new THREE.Group(), col = plantColor(p), mat = p.dead ? lostMat : new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
      const conifer = CONIFER.test(p.name + ' ' + p.type);
      const add = (geo, m, y = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y += y; mesh.castShadow = true; grp.add(mesh); return mesh; };
      const base = p.container || p.category === 'House plant' ? 0.3 : 0;
      if (base) add(geos.pot, p.dead ? lostMat : potMat);
      if (p.category === 'Tree'){ add(geos.trunk, p.dead ? lostMat : trunkMat, base); add(conifer ? geos.cone : geos.ball, mat, base); }
      else if (p.category === 'Flower'){ add(geos.stem, p.dead ? lostMat : trunkMat, base); for (let i = 0; i < 5; i++){ const pt = add(geos.petal, mat, base + 0.72); pt.position.x = Math.cos(i / 5 * TAU) * 0.13; pt.position.z = Math.sin(i / 5 * TAU) * 0.13; } add(new THREE.SphereGeometry(0.07, 8, 6), p.dead ? lostMat : new THREE.MeshStandardMaterial({ color: '#f5c542' }), base + 0.74); }
      else if (p.category === 'Bush') add(geos.bush, mat, base);
      else if (p.category === 'Ground') add(geos.mat, mat, base);
      else if (p.category === 'Grass'){ for (let i = 0; i < 7; i++){ const b = add(geos.blade, mat, base); b.rotation.z = (i - 3) * 0.12; b.rotation.y = i; } }
      else { add(geos.stem, trunkMat, base); add(geos.bush, mat, base + 0.5); }
      return grp;
    }
    const plantAt = (p, rg) => {
      const d = data.parseDate(p.purchased), a = d ? (data.dayOfYear(d) + 0.5) / data.daysInYear(d.getFullYear()) * TAU : hash(p.id) * TAU;
      const rr = rg ? rg.r0 + (rg.r1 - rg.r0) * (0.22 + 0.56 * hash(p.id + 'r')) : PITH * (0.25 + 0.6 * hash(p.id + 'r'));
      return { a, rr };
    };
    for (const p of [...dated, ...undated]){
      const rg = rings.find(x => x.y === +String(p.purchased).slice(0, 4));
      const { a, rr } = plantAt(p, rg);
      const fig = new THREE.Group(), [x, z] = toXZ(rr, a); fig.position.set(x, topY, z); scene.add(fig);
      const loved = (photoN.get(p.id) || 0) + (logN.get(p.id) || 0);
      const scale = 1.25 + Math.min(1.5, Math.sqrt(loved) * 0.22);
      const n = Math.min(p.quantity, 5);
      for (let q = 0; q < n; q++){
        const f = makeFigure(p);
        if (n > 1){ f.position.set(Math.cos(q / n * TAU) * 0.38, 0, Math.sin(q / n * TAU) * 0.38); f.scale.setScalar(0.7); }
        fig.add(f);
      }
      if (p.dead){ fig.rotation.z = 1.35; fig.rotation.y = hash(p.id) * TAU; fig.position.y = 0.12; }
      fig.userData.target = scale; fig.scale.setScalar(reducedMotion ? scale : 0.001);
      const rec = { p, fig, rg, scale, loved };
      figures.push(rec);
      ctx.pick(fig, { tip: () => tipFor(rec), hover: (h, on) => { fig.userData.hover = on; } });
    }
    function tipFor({ p, loved }){
      const o = ovBy.get(p.id);
      const e = o && o.calendar.find(e => inMonth(e, nowM));
      return `<span class="t-head">${data.esc(p.name)}${p.quantity > 1 ? ` × ${p.quantity}` : ''}</span>${p.type ? `<span class="k">${data.esc(p.type)}</span><br>` : ''}${data.esc(p.category)}${p.container ? ' · in a container' : ''} · ${p.purchased ? 'arrived ' + data.fmtDate(p.purchased) : 'arrival date unknown'}`
        + `<br>${p.dead ? '🪦 Didn’t make it' : '🌱 Living'} · ${photoN.get(p.id) || 0} photos · ${logN.get(p.id) || 0} journal entries`
        + (e && !p.dead ? `<span class="t-sub"><span class="sw" style="background:${e.c}"></span>This month: ${data.esc(e.t)}</span>` : '');
    }
    if (undated.length){ const s = ctx.text(`date unknown · ${undated.length}`, { size: 0.36, color: colors.light ? '#5a4024' : '#f0dcc0' }); s.position.set(0, 0.15, PITH * 0.0 + 0.0); scene.add(s); }

    /* ---------- controls & story ---------- */
    const living = plants.filter(p => !p.dead).length, lost = plants.length - living;
    const busiest = rings.slice().sort((a, b) => b.n - a.n)[0];
    ui.readout(`<strong>${plants.length} plants</strong>${living} living · ${lost} lost${busiest ? `<br><span class="k">Widest ring</span> ${busiest.y}, ${busiest.n} planted` : ''}${undated.length ? `<br><span class="k">In the center</span> ${undated.length} with no arrival date` : ''}`);
    ui.toggle({ label: 'Show plants that didn’t make it', value: true, onChange: v => { showLost = v; figures.forEach(f => { if (f.p.dead) f.fig.visible = v; }); } });
    ui.select({ label: 'Color', value: colorBy, options: [{ value: 'month', label: 'What it’s doing this month' }, { value: 'category', label: 'By category' }], onChange: v => {
      colorBy = v;
      for (const f of figures){ if (f.p.dead) continue; const c = plantColor(f.p); f.fig.traverse(o => { if (o.isMesh && o.material !== trunkMat && o.material !== potMat && o.material.color && o.geometry !== geos.trunk && o.geometry !== geos.stem && o.material.color.getHexString() !== 'f5c542') o.material.color.set(c); }); }
    } });
    ui.button({ label: '▶ Grow the rings again', onClick: () => { growT = 0; figures.forEach(f => f.fig.scale.setScalar(0.001)); } });
    ui.legend([{ shape: 'glyph', glyph: '🌲', label: 'Conifer' }, { shape: 'glyph', glyph: '🌳', label: 'Broadleaf tree' }, { shape: 'glyph', glyph: '🌸', label: 'Flower' }, { shape: 'glyph', glyph: '🪴', label: 'In a container' }, { color: '#8a9292', label: 'Didn’t make it (lying down)', shape: 'dot' }], 'Figures');
    ctx.about(`<p>The yard’s planting history as the cross-section of a tree. Each <strong>growth ring</strong> is a year, and like real rings a ring is <strong>wider in a year when more went in</strong>. Every plant stands on its ring at the time of year it arrived: January is at 12 o’clock and the year runs clockwise, so spring planting bunches up on the right.</p><p>Figures are shaped by category, colored by what each plant is doing <strong>this month</strong> according to its overview, and sized by how much it’s been photographed and written about. The ones that didn’t make it lie on their side in grey. Plants with no arrival date sit in the center.</p>`);

    camera.position.set(4, RMAX * 1.25 + 4, RMAX * 1.35 + 4); controls.target.set(0, 0, 0.6);
    controls.maxDistance = 90;
    // Grow in, ring by ring
    let growT = reducedMotion ? 99 : 0;
    return {
      update(t, dt){
        if (growT < 99){
          growT += dt;
          for (const f of figures){
            const idx = f.rg ? rings.indexOf(f.rg) + 1 : 0, delay = idx * 0.45 + hash(f.p.id) * 0.4;
            const k = Math.max(0, Math.min(1, (growT - delay) / 0.6)), s = f.scale * (1 - Math.pow(1 - k, 3)) * (1 + Math.sin(k * Math.PI) * 0.15);   // ease out with a little overshoot
            f.fig.scale.setScalar(Math.max(0.001, s));
          }
          if (growT > rings.length * 0.45 + 1.4) growT = 99;
        }
        for (const f of figures){ const want = f.fig.userData.hover ? f.scale * 1.25 : f.scale; if (growT >= 99) f.fig.scale.setScalar(f.fig.scale.x + (want - f.fig.scale.x) * Math.min(1, dt * 10)); }
      },
    };
  },
};
