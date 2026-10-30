/* 08 · Dawn redwood time machine: the yard's most photographed tree, grown
 * on a timeline from the day it arrived. Trunk girth follows the trunk
 * measurements in the journal, with the growth between them falling only while
 * the tree is in leaf, so it stands still through bare winters; needle color follows
 * its AI overview's color calendar, so it flushes lime, turns russet and goes
 * bare on schedule. The photo nearest each date stands beside it, and a ring
 * on the ground marks every photo and measurement. World units are feet. */
const MS = 864e5;
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SEASON = m => (m === 12 || m <= 2) ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';

function frondTexture(THREE){
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.lineWidth = 3; g.beginPath(); g.moveTo(32, 124); g.lineTo(32, 6); g.stroke();
  g.lineWidth = 3.2;
  for (let y = 112; y > 10; y -= 6){
    const L = 26 * Math.sin((y - 4) / 124 * Math.PI) + 4;
    g.beginPath(); g.moveTo(32, y); g.lineTo(32 - L, y - 7); g.stroke();
    g.beginPath(); g.moveTo(32, y); g.lineTo(32 + L, y - 7); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function barkTexture(THREE){
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#8b4f36'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 220; i++){
    const x = Math.random() * 256, w = 1 + Math.random() * 4, l = 0.88 + Math.random() * 0.25;
    g.fillStyle = Math.random() < 0.5 ? `rgba(60,28,18,${0.25 + Math.random() * 0.35})` : `rgba(196,120,86,${0.18 + Math.random() * 0.3})`;
    g.fillRect(x, Math.random() * 512 * (1 - l), w, 512 * l);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Finding the dawn redwood…');
    const [plants, photos, logRows, ov] = await Promise.all([data.plants(), data.plantPhotos(), data.log().catch(() => []), data.overview().catch(() => [])]);
    if (!ctx.alive()) return;
    const tree = plants.find(p => p.id === 'p_dawn-redwood') || plants.find(p => /dawn redwood/i.test(p.name) && !/bonsai/i.test(p.name) && !p.dead);
    if (!tree) throw new Error('Couldn’t find the dawn redwood in the plant list.');
    const pics = photos.filter(p => p.plantId === tree.id && p.date).sort((a, b) => a.date.localeCompare(b.date));
    const meas = logRows.filter(l => l.plantId === tree.id && l.action === 'trunk measurement' && l.value != null && !/branch/i.test(l.note || ''))
      .sort((a, b) => a.date.localeCompare(b.date));
    const o = ov.find(x => x.plantId === tree.id);
    const cal = (o && o.calendar.length) ? o.calendar : [{ s: 4, e: 5, k: 'foliage', c: '#a8c75a' }, { s: 6, e: 9, k: 'foliage', c: '#5f8a4a' }, { s: 10, e: 11, k: 'foliage', c: '#b5653a' }, { s: 12, e: 3, k: 'bark', c: '#8b4f36' }];

    const start = data.parseDate(tree.purchased || (pics[0] && pics[0].date) || '2021-06-01');
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const span = (end - start) / MS;

    const heightOf = g => 3.0 * Math.pow(g, 0.62);      // illustrative height (ft) from girth
    const inMonth = (e, m) => e.s <= e.e ? (m >= e.s && m <= e.e) : (m >= e.s || m <= e.e);
    const foliageOf = m => cal.find(e => (e.k === 'foliage' || e.k === 'evergreen') && inMonth(e, m));
    const monthColor = m => { const f = foliageOf(m); return f ? new THREE.Color(f.c) : null; };
    // How much of its foliage the tree has on a date (0 bare … 1 full), from the color calendar.
    function leafAmount(date){
      const m = date.getMonth() + 1, frac = Math.min(1, (date.getDate() - 1) / 30);
      const now = !!foliageOf(m), next = !!foliageOf(m % 12 + 1);
      if (now && next) return 1;
      if (!now && !next) return 0;
      return now ? 1 - Math.max(0, (frac - 0.35) / 0.65) : Math.max(0, (frac - 0.5) * 2);   // shedding : leafing out
    }
    // The tree's "growing clock": days counted only by how leafed-out it was, so
    // it stands still while bare. growClock(day) is the total up to that day.
    const growth = [0];
    for (let d = 1; d <= Math.ceil(span) + 1; d++) growth[d] = growth[d - 1] + leafAmount(new Date(start.getTime() + d * MS));
    const growClock = day => { const c = Math.max(0, Math.min(growth.length - 1, day)), i = Math.floor(c); return growth[i] + ((growth[i + 1] ?? growth[i]) - growth[i]) * (c - i); };
    // Girth (inches at the base) at any date. Measurements are exact; the change
    // between two of them is spread over growing time, not calendar time. Before the
    // first one we ease back toward an estimated sapling girth at arrival.
    const pts = meas.map(m => ({ t: (data.parseDate(m.date) - start) / MS, v: m.value }));
    const g0 = pts.length ? Math.max(3, pts[0].v * 0.55) : 6;
    const growPerYear = growClock(span) / Math.max(1, span / 365.25);
    function girth(day){
      if (!pts.length) return g0 + growClock(day) / Math.max(1, growPerYear) * 5;
      if (day <= pts[0].t){ const total = growClock(pts[0].t); return g0 + (pts[0].v - g0) * (total > 0 ? growClock(day) / total : Math.max(0, day) / Math.max(1, pts[0].t)); }
      for (let i = 1; i < pts.length; i++) if (day <= pts[i].t){
        const a = pts[i - 1], b = pts[i], total = growClock(b.t) - growClock(a.t);
        // Two measurements inside one dormant spell have no growing time between them.
        return a.v + (b.v - a.v) * (total > 0 ? (growClock(day) - growClock(a.t)) / total : (day - a.t) / (b.t - a.t));
      }
      return pts[pts.length - 1].v;
    }

    /* ---------- scene ---------- */
    scene.background = new THREE.Color(colors.light ? '#dfeaf0' : '#0a1517');
    scene.fog = new THREE.Fog(scene.background, 70, 150);
    const hemi = new THREE.HemisphereLight('#dff1ff', '#33402c', 1.0); scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.0); sun.position.set(-20, 40, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 40, bottom: -5, near: 1, far: 100 });
    scene.add(sun);
    const groundMat = new THREE.MeshStandardMaterial({ color: '#4c7a3e', roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 96), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.4, 1.2, 96), new THREE.MeshStandardMaterial({ color: colors.light ? '#b9a88a' : '#3b2f24', roughness: 1 }));
    plinth.position.y = -0.61; scene.add(plinth);

    // Trunk: fluted and buttressed near the base, unit height & radius (scaled later)
    const tg = new THREE.CylinderGeometry(0.3, 1, 1, 64, 40, false).translate(0, 0.5, 0);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++){
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), th = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const butt = Math.exp(-y * 9);                       // flare at the foot
      const flute = 1 + (0.09 + 0.25 * butt) * Math.sin(th * 9) * (1 - y * 0.8);
      const k = flute * (1 + 0.9 * butt) * (1 - y * 0.15);
      tp.setX(i, x * k); tp.setZ(i, z * k);
    }
    tg.computeVertexNormals();
    const barkTex = barkTexture(THREE); barkTex.repeat.set(3, 1);
    const trunk = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 })); trunk.castShadow = true; scene.add(trunk);

    // Crown: whorls of branches with feathery fronds (instanced), unit height
    const crown = new THREE.Group(); scene.add(crown);
    const branchMat = new THREE.MeshStandardMaterial({ color: '#6e4630', roughness: 0.9 });
    const fronds = [];
    const TIERS = 22;
    const branchGeo = new THREE.CylinderGeometry(0.004, 0.009, 1, 5).translate(0, 0.5, 0).rotateZ(-Math.PI / 2);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < TIERS; t++){
      const y = 0.16 + t / TIERS * 0.8, len = 0.22 * Math.pow(1 - (y - 0.16) / 0.86, 0.9) + 0.03;
      const n = 5 + (t % 3);
      for (let b = 0; b < n; b++){
        const a = b / n * Math.PI * 2 + t * 0.7 + rnd() * 0.4;
        const br = new THREE.Mesh(branchGeo, branchMat);
        br.scale.set(len, 1, 1); br.position.y = y; br.rotation.y = a; br.rotation.z = 0.12 + rnd() * 0.12; crown.add(br);
        const nf = 3 + Math.round(len * 10);
        for (let f = 0; f < nf; f++){
          const d = (f + 0.6) / nf * len, droop = d * d * 0.5;
          fronds.push({ x: Math.cos(a) * d, z: -Math.sin(a) * d, y: y + d * 0.18 - droop * 0.4, a, s: 0.05 + (1 - f / nf) * 0.035 + len * 0.12, r: rnd() });
        }
      }
    }
    const frondGeo = new THREE.PlaneGeometry(1, 2);
    const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(THREE), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85, transparent: false });
    const frondMesh = new THREE.InstancedMesh(frondGeo, frondMat, fronds.length);
    frondMesh.castShadow = true; crown.add(frondMesh);
    const dummy = new THREE.Object3D();
    function placeFronds(amount){
      fronds.forEach((f, i) => {
        dummy.position.set(f.x, f.y, f.z);
        dummy.rotation.set(-Math.PI / 2 + 0.25 + f.r * 0.3, f.a + Math.PI / 2 + (f.r - 0.5) * 0.6, (f.r - 0.5) * 0.5, 'YXZ');
        const show = f.r < amount ? 1 : 0;
        dummy.scale.setScalar(f.s * show);
        dummy.updateMatrix(); frondMesh.setMatrixAt(i, dummy.matrix);
      });
      frondMesh.instanceMatrix.needsUpdate = true;
    }
    const fc = new THREE.Color();
    fronds.forEach((f, i) => frondMesh.setColorAt(i, fc.setHSL(0, 0, 0.82 + f.r * 0.3)));

    // Measuring tape at the base
    const tape = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#7a5a00', emissiveIntensity: 0.5, roughness: 0.4 }));
    tape.rotation.x = Math.PI / 2; tape.position.y = 0.45; scene.add(tape);
    let tapeLabel = null;

    // Particles: falling needles in autumn, snow in winter
    const PN = reducedMotion ? 0 : 500;
    const pgeo = new THREE.BufferGeometry(), ppos = new Float32Array(PN * 3);
    const pseed = Array.from({ length: PN }, () => ({ x: (Math.random() - 0.5) * 24, z: (Math.random() - 0.5) * 24, y: Math.random() * 34, v: 0.6 + Math.random() * 0.9, w: Math.random() * 6 }));
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const pmat = new THREE.PointsMaterial({ size: 0.28, map: ctx.glow(), transparent: true, depthWrite: false, color: '#ffffff' });
    const particles = new THREE.Points(pgeo, pmat); particles.visible = false; scene.add(particles);

    // Photo easel
    const easel = new THREE.Group(); easel.position.set(15, 0, 3); scene.add(easel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(11.2, 8.6, 0.3), new THREE.MeshStandardMaterial({ color: '#1e1a17', roughness: 0.5, metalness: 0.2 }));
    frame.position.y = 9; frame.castShadow = true; easel.add(frame);
    const picMat = new THREE.MeshBasicMaterial({ color: '#2a3433' });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 7.8), picMat); pic.position.set(0, 9, 0.16); easel.add(pic);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 9, 8), new THREE.MeshStandardMaterial({ color: '#3a2d22' })); legs.position.y = 4.5; legs.position.z = -0.4; easel.add(legs);
    let capLabel = null;
    easel.rotation.y = -0.65;
    const texCache = new Map(), loader = new THREE.TextureLoader();
    let shownKey = null;
    function showPhoto(ph){
      if (!ph){ picMat.map = null; picMat.color.set('#2a3433'); picMat.needsUpdate = true; shownKey = null; setCaption('No photo yet'); return; }
      if (ph.key === shownKey) return;
      shownKey = ph.key;
      setCaption(data.fmtDate(ph.date, { month: 'long', day: 'numeric', year: 'numeric' }));
      const use = tex => {
        if (shownKey !== ph.key) return;
        const ar = tex.image.width / tex.image.height; let w = 10.4, h = 10.4 / ar; if (h > 7.8){ h = 7.8; w = 7.8 * ar; }
        pic.scale.set(w / 10.4, h / 7.8, 1); picMat.map = tex; picMat.color.set('#ffffff'); picMat.needsUpdate = true;
      };
      if (texCache.has(ph.key)) return use(texCache.get(ph.key));
      loader.loadAsync(data.thumbURL(ph.key)).catch(() => loader.loadAsync(data.imageURL(ph.key))).then(tex => { tex.colorSpace = THREE.SRGBColorSpace; texCache.set(ph.key, tex); use(tex); }).catch(() => {});
    }
    function setCaption(text){
      if (capLabel){ easel.remove(capLabel); capLabel.material.map.dispose(); capLabel.material.dispose(); }
      capLabel = ctx.text(text, { size: 0.75, color: colors.ink, bg: colors.light ? 'rgba(255,255,255,.85)' : 'rgba(10,20,22,.8)' });
      capLabel.position.set(0, 13.9, 0.3); easel.add(capLabel);
    }
    ctx.pick(pic, { tip: () => shownKey ? `<span class="t-head">${data.esc(tree.name)}</span>${data.fmtDate(current.photo.date)}<span class="t-sub">Click to open</span>` : null, click: () => { if (current.photo) openPhoto(current.photo); } });

    // Time ring on the ground: every photo and measurement
    const RING = 12.5, angOfDay = d => d / span * Math.PI * 1.85 - Math.PI * 0.925 + Math.PI;
    const ringPts = []; for (let k = 0; k <= 160; k++){ const a = angOfDay(k / 160 * span); ringPts.push(new THREE.Vector3(Math.sin(a) * RING, 0.06, -Math.cos(a) * RING)); }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts), 200, 0.06, 6, false), new THREE.MeshBasicMaterial({ color: colors.light ? '#2c4a44' : '#cfe7e2', transparent: true, opacity: 0.55 })));
    const dotGeo = new THREE.SphereGeometry(0.22, 12, 8), photoDotMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }), measDotMat = new THREE.MeshBasicMaterial({ color: '#ffd24a' });
    for (const ph of pics){
      const d = (data.parseDate(ph.date) - start) / MS; if (d < 0) continue;
      const a = angOfDay(d), m = new THREE.Mesh(dotGeo, photoDotMat); m.position.set(Math.sin(a) * RING, 0.2, -Math.cos(a) * RING); scene.add(m);
      ctx.pick(m, { tip: () => `<span class="t-head">📷 ${data.fmtDate(ph.date, { month: 'long', day: 'numeric', year: 'numeric' })}</span><span class="t-sub">Click to jump here</span>`, click: () => jump(d) });
    }
    for (const mm of meas){
      const d = (data.parseDate(mm.date) - start) / MS, a = angOfDay(d), m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 16), measDotMat);
      m.position.set(Math.sin(a) * (RING + 0.9), 0.25, -Math.cos(a) * (RING + 0.9)); scene.add(m);
      ctx.pick(m, { tip: () => `<span class="t-head">📏 ${mm.value} in at the base</span>${data.fmtDate(mm.date)}${mm.note ? ` · ${data.esc(mm.note)}` : ''}<span class="t-sub">Click to jump here</span>`, click: () => jump(d) });
    }
    for (let y = start.getFullYear() + 1; y <= end.getFullYear(); y++){
      const d = (new Date(y, 0, 1, 12) - start) / MS, a = angOfDay(d);
      const s = ctx.text(String(y), { size: 0.85, color: colors.ink, weight: 700 }); s.position.set(Math.sin(a) * (RING + 2.2), 0.5, -Math.cos(a) * (RING + 2.2)); scene.add(s);
    }
    const nowMarker = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 16).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: colors.accent })); scene.add(nowMarker);

    /* ---------- state at a day ---------- */
    const current = { day: span, photo: null };
    let lastMonthKey = '';
    function setDay(day){
      day = Math.max(0, Math.min(span, day)); current.day = day;
      const date = new Date(start.getTime() + day * MS), m = date.getMonth() + 1;
      const g = girth(day), h = heightOf(g), rIn = g / (2 * Math.PI) / 12;     // ft
      const rVis = Math.max(rIn * 1.35, 0.12);
      trunk.scale.set(rVis, h * 0.97, rVis);
      crown.scale.set(h, h, h);
      // Seasonal foliage: color by month, eased within the month; bare months drop fronds.
      const frac = Math.min(1, (date.getDate() - 1) / 30);
      const cNow = monthColor(m), cNext = monthColor(m % 12 + 1);
      const amount = leafAmount(date);
      const col = !cNow ? cNext : cNext ? cNow.clone().lerp(cNext, Math.max(0, frac - 0.6) / 0.4) : cNow;
      placeFronds(amount);
      if (col) frondMat.color.copy(col);
      // ground + particles
      const winter = m === 12 || m <= 2, shedding = cNow && !cNext;
      groundMat.color.set(winter ? '#e8eef0' : m === 3 || m === 11 ? '#6f7a52' : '#4c7a3e');
      particles.visible = PN > 0 && (winter || shedding);
      pmat.color.set(winter ? '#ffffff' : (cNow ? cNow.getStyle() : '#b5653a')); pmat.size = winter ? 0.3 : 0.22;
      // tape
      tape.scale.set(rVis * 1.9 + 0.05, rVis * 1.9 + 0.05, 1);
      const measuredNear = meas.find(x => Math.abs((data.parseDate(x.date) - date) / MS) < 20);
      if (tapeLabel){ scene.remove(tapeLabel); tapeLabel.material.map.dispose(); tapeLabel.material.dispose(); }
      tapeLabel = ctx.text(`${measuredNear ? measuredNear.value : '≈ ' + g.toFixed(1)} in at the base`, { size: 0.6, color: '#ffd24a', bg: colors.light ? 'rgba(30,30,30,.75)' : 'rgba(0,0,0,.55)' });
      tapeLabel.position.set(rVis * 2 + 2.6, 1.2, 0); scene.add(tapeLabel);
      // photo nearest on/before
      let ph = null; const ds = data.isoDate(date);
      for (const p of pics){ if (p.date <= ds) ph = p; else break; }
      current.photo = ph; showPhoto(ph);
      // marker on the ring
      const a = angOfDay(day); nowMarker.position.set(Math.sin(a) * RING, 1.3, -Math.cos(a) * RING);
      const mk = `${date.getFullYear()}-${m}-${g.toFixed(1)}-${measuredNear ? 1 : 0}-${amount === 0 ? 1 : 0}`;
      if (mk !== lastMonthKey){
        lastMonthKey = mk;
        const season = o && o.seasons[SEASON(m)];
        ui.readout(`<strong>${MONTH_FULL[m - 1]} ${date.getFullYear()}</strong>${Math.max(0, (date - start) / (365.25 * MS)).toFixed(1)} years in the yard${tree.notes && /age at purchase:\s*(\d+)/i.test(tree.notes) ? ` · about ${Math.floor(+tree.notes.match(/age at purchase:\s*(\d+)/i)[1] + (date - start) / (365.25 * MS))} years old` : ''}<br><span class="k">Trunk</span> ${measuredNear ? `${measuredNear.value} in at the base (measured)` : `≈ ${g.toFixed(1)} in at the base${day < (pts[0] || { t: 0 }).t ? ' (estimated before the first measurement)' : pts.length && day > pts[pts.length - 1].t ? ` (last measured ${data.fmtDate(meas[meas.length - 1].date, { month: 'short', day: 'numeric', year: 'numeric' })})` : ' (between measurements)'}`}${amount === 0 ? '<br><span class="k">Dormant: bare, so not growing</span>' : ''}${season ? `<br><span class="k">${season.slice(0, 120)}</span>` : ''}`);
      }
      slider.set(Math.round(day));
    }
    function jump(d){ playing = false; playBtn.textContent = '▶ Grow'; setDay(d); }

    /* ---------- controls ---------- */
    let playing = false;
    const slider = ui.range({ label: 'Date', min: 0, max: Math.round(span), step: 1, value: Math.round(span), wide: true, format: v => new Date(start.getTime() + v * MS).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), onInput: v => { playing = false; playBtn.textContent = '▶ Grow'; setDay(v); } });
    const playBtn = ui.button({ label: '▶ Grow', primary: true, onClick: b => { playing = !playing; b.textContent = playing ? '❚❚ Pause' : '▶ Grow'; if (playing && current.day >= span - 1) setDay(0); } });
    ui.button({ label: 'Today', onClick: () => jump(span) });
    ui.legend([{ color: '#ffffff', label: `Photo (${pics.length})`, shape: 'dot' }, { color: '#ffd24a', label: `Trunk measurement (${meas.length})`, shape: 'dot' }, { color: colors.accent, label: 'Where you are in time', shape: 'dot' }]);

    // Lightbox
    const dlg = document.createElement('dialog'); dlg.className = 'y3-light';
    dlg.innerHTML = '<button type="button" class="y3-btn ghost">Close</button><img alt=""><p></p>';
    document.body.appendChild(dlg);
    dlg.querySelector('button').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    function openPhoto(ph){ dlg.querySelector('img').src = data.imageURL(ph.key); dlg.querySelector('img').alt = tree.name; dlg.querySelector('p').textContent = `${tree.name} · ${data.fmtDate(ph.date)}${ph.caption ? ' · ' + ph.caption : ''}`; dlg.showModal(); }

    ctx.about(`<p>The <strong>${data.esc(tree.name)}</strong> (${data.esc(tree.type || 'Metasequoia')}), from the day it arrived on ${data.fmtDate(tree.purchased || data.isoDate(start))} to today. Its trunk thickens with the <strong>${meas.length} trunk measurements</strong> you logged at the base. Between measurements it only grows while it’s in leaf, so it <strong>stands still through the bare winter months</strong> and puts on all its growth from spring to fall. Its needles follow the color calendar from its AI overview, flushing lime green in spring, deepening for summer, going russet in fall and dropping for winter, when the cinnamon bark shows.</p><p>The easel shows the photo you took nearest each date (${pics.length} in all), and the ring on the ground is the timeline: white dots are photos, gold pegs are measurements. Click any of them to jump there, or press <strong>Grow</strong>. Girth is measured; the height is illustrative, worked out from the girth.</p>`);

    camera.position.set(-9, 17, 46); controls.target.set(3, 12.5, 0);
    controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * 0.49;
    setDay(span);
    let lastSet = 0;
    return {
      update(t, dt){
        if (playing){
          const d = current.day + dt * span / 45;
          if (d >= span){ playing = false; playBtn.textContent = '▶ Grow'; setDay(span); }
          else if (t - lastSet > 0.05){ lastSet = t; setDay(d); } else current.day = d;
        }
        if (!reducedMotion){
          crown.rotation.z = Math.sin(t * 0.7) * 0.012; crown.rotation.x = Math.cos(t * 0.53) * 0.008;
          nowMarker.position.y = 1.3 + Math.sin(t * 2.5) * 0.18;
        }
        if (particles.visible){
          const winter = pmat.size > 0.25;
          pseed.forEach((p, i) => {
            p.y -= dt * p.v * (winter ? 1.6 : 2.6); if (p.y < 0.1) p.y = 34;
            ppos.set([p.x + Math.sin(t * 0.8 + p.w) * 0.6, p.y, p.z + Math.cos(t * 0.6 + p.w) * 0.6], i * 3);
          });
          pgeo.attributes.position.needsUpdate = true;
        }
      },
      dispose(){ dlg.remove(); for (const tex of texCache.values()) tex.dispose(); },
    };
  },
};
