/* 07 · Memory tunnel: fly down a tunnel lined with every photo in the order
 * it was taken: plant photos as white polaroids, wildlife as amber ones. Year
 * portals glow at each New Year with that year's numbers; wildlife sightings
 * float down the middle and journal entries drift like fireflies.
 *
 * Photos are drawn into texture atlases (128 px cells, frame baked in), loaded
 * nearest-first as you travel; the few cards right in front of you swap to the
 * sharper 640 px thumbnail. Hidden photos and private yard photos stay out. */
const R = 4.6;                       // tunnel radius
const CELL = 128, ATLAS = 2048, PER = (ATLAS / CELL) ** 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const CAT_GLYPH = { Bird: '🐦', Mammal: '🦊', Reptile: '🐍', Fish: '🐟', Amphibian: '🐸', Insect: '🦋' };
const ACTION_COLOR = { watered: '#5fb4ff', 'frost damage': '#ff6b6b', frost: '#bff1ff', covered: '#c9a2ff', uncovered: '#ffe08a', 'brought inside': '#f0a868', 'taken outside': '#8fe39a', 'trunk measurement': '#ffd27a', pruned: '#7ee08a' };

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Gathering every photo, sighting and journal entry…');
    const [pPhotos, wPhotos, sightings, logRows, plants] = await Promise.all([
      data.plantPhotos(), data.wildlifePhotos().catch(() => []), data.sightings().catch(() => []), data.log().catch(() => []), data.plants().catch(() => []),
    ]);
    if (!ctx.alive()) return;
    const byId = new Map(plants.map(p => [p.id, p]));
    const bySighting = new Map(sightings.map(s => [s.id, s]));
    const items = [
      ...pPhotos.filter(p => p.date).map(p => ({ kind: 'plant', key: p.key, date: p.date, caption: p.caption, name: p.yard ? 'The yard' : (byId.get(p.plantId) || {}).name || 'A plant', sub: p.yard ? 'Yard photo' : (byId.get(p.plantId) || {}).category || '' })),
      ...wPhotos.filter(p => p.date).map(p => { const s = bySighting.get(p.sightingId) || {}; return { kind: 'wild', key: p.key, date: p.date, caption: p.caption, name: s.species || 'Wildlife', sub: s.category || 'Wildlife' }; }),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    if (!items.length) throw new Error('No photos to show yet.');

    // Position along the tunnel: each photo advances a step, quiet days a little,
    // so busy months spread out without years of empty tunnel.
    const t0 = data.parseDate(items[0].date);
    const daysFrom = ds => Math.round((data.parseDate(ds) - t0) / 864e5);
    let z = 0, lastDays = 0;
    items.forEach((it, i) => { const d = daysFrom(it.date); z -= (i ? 0.62 : 0) + (d - lastDays) * 0.018; lastDays = d; it.z = z; it.theta = i * GOLDEN; });
    const endZ = z - 6;
    // z for any date (between the photos around it)
    const zOfDate = ds => {
      let lo = 0, hi = items.length - 1;
      if (ds <= items[0].date) return items[0].z + (daysFrom(items[0].date) - daysFrom(ds)) * 0.018;
      if (ds >= items[hi].date) return items[hi].z - (daysFrom(ds) - daysFrom(items[hi].date)) * 0.018;
      while (hi - lo > 1){ const m = (lo + hi) >> 1; if (items[m].date <= ds) lo = m; else hi = m; }
      const a = items[lo], b = items[hi], f = (daysFrom(ds) - daysFrom(a.date)) / Math.max(1, daysFrom(b.date) - daysFrom(a.date));
      return a.z + (b.z - a.z) * f;
    };
    const dateAtZ = zz => { let best = items[0]; for (const it of items){ if (it.z >= zz) best = it; else break; } return best.date; };

    scene.background = new THREE.Color(colors.light ? '#e9f1f1' : '#050d0f');
    scene.fog = new THREE.FogExp2(scene.background, colors.light ? 0.03 : 0.036);
    scene.add(new THREE.AmbientLight('#ffffff', 1));
    ctx.stage.bloomPass.strength = colors.light ? 0.15 : 0.55; ctx.stage.bloomPass.threshold = 1.0; ctx.stage.bloomPass.radius = 0.6;   // only the over-bright portals and fireflies glow

    /* ---------- atlases ---------- */
    const atlases = [];
    function atlasFor(i){
      const a = Math.floor(i / PER);
      if (!atlases[a]){
        const c = document.createElement('canvas'); c.width = c.height = ATLAS;
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
        atlases[a] = { c, g: c.getContext('2d'), tex, dirty: true };
      }
      return atlases[a];
    }
    const cellXY = i => { const k = i % PER; return [(k % (ATLAS / CELL)) * CELL, Math.floor(k / (ATLAS / CELL)) * CELL]; };
    const font = getComputedStyle(document.body).fontFamily;
    function drawFrame(i, img){
      const it = items[i], A = atlasFor(i), [x, y] = cellXY(i), g = A.g;
      const border = 6, bottom = 20, wild = it.kind === 'wild';
      g.fillStyle = wild ? '#f3d9a4' : '#f6f4ee'; g.fillRect(x, y, CELL, CELL);
      const iw = CELL - border * 2, ih = CELL - border - bottom;
      if (img){
        const ar = img.width / img.height, tar = iw / ih;
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        if (ar > tar){ sw = img.height * tar; sx = (img.width - sw) / 2; } else { sh = img.width / tar; sy = (img.height - sh) / 2; }
        g.drawImage(img, sx, sy, sw, sh, x + border, y + border, iw, ih);
      } else {
        g.fillStyle = wild ? '#7a5a2a' : '#35554d'; g.fillRect(x + border, y + border, iw, ih);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `600 13px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(it.name.slice(0, 14), x + CELL / 2, y + border + ih / 2);
      }
      g.fillStyle = '#5a5a55'; g.font = `500 10px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(data.fmtDate(it.date, { month: 'short', day: 'numeric', year: '2-digit' }), x + CELL / 2, y + CELL - bottom / 2);
      A.dirty = true;
    }
    items.forEach((_, i) => drawFrame(i, null));

    /* ---------- cards: one merged mesh per atlas ---------- */
    const CARD = 1.55;
    const tunnel = new THREE.Group(); scene.add(tunnel);
    const cardMeshes = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tmpObj = new THREE.Object3D();
    atlases.forEach((A, a) => {
      const idxs = items.map((_, i) => i).filter(i => Math.floor(i / PER) === a);
      const pos = new Float32Array(idxs.length * 12), uv = new Float32Array(idxs.length * 8), index = [];
      idxs.forEach((i, k) => {
        const it = items[i], th = it.theta;
        tmpObj.position.set(Math.cos(th) * R, Math.sin(th) * R, it.z);
        tmpObj.lookAt(0, 0, it.z + 5);        // tilt toward the traveller
        tmpObj.updateMatrix(); it.matrix = tmpObj.matrix.clone();
        const h = CARD / 2;
        [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([px, py], v) => {
          const p = new THREE.Vector3(px, py, 0).applyMatrix4(tmpObj.matrix);
          pos.set([p.x, p.y, p.z], k * 12 + v * 3);
        });
        const [cx, cy] = cellXY(i), u0 = cx / ATLAS, u1 = (cx + CELL) / ATLAS, v0 = 1 - (cy + CELL) / ATLAS, v1 = 1 - cy / ATLAS;
        uv.set([u0, v0, u1, v0, u1, v1, u0, v1], k * 8);
        const b = k * 4; index.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(index);
      geo.computeBoundingSphere();
      A.tex.flipY = true;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: A.tex, side: THREE.DoubleSide }));
      mesh.userData.idxs = idxs; tunnel.add(mesh); cardMeshes.push(mesh);
      ctx.pick(mesh, { tip: h => tipFor(items[idxs[Math.floor(h.faceIndex / 2)]]), click: h => openPhoto(items[idxs[Math.floor(h.faceIndex / 2)]]) });
    });
    function tipFor(it){
      return `<span class="t-head">${it.kind === 'wild' ? '🐾 ' : ''}${data.esc(it.name)}</span>${data.fmtDate(it.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}${it.sub ? ` · ${data.esc(it.sub)}` : ''}${it.caption ? `<br>${data.esc(it.caption)}` : ''}<span class="t-sub">Click to open</span>`;
    }

    /* ---------- tunnel structure: month rings, year portals, rails ---------- */
    const first = data.parseDate(items[0].date), last = new Date();
    const ringMat = new THREE.MeshBasicMaterial({ color: colors.light ? '#9fb9b9' : '#2d5a5e', transparent: true, opacity: 0.55 });
    const portalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.accent).multiplyScalar(2.2), toneMapped: false });
    const yearStats = new Map();
    for (const it of items){ const y = +it.date.slice(0, 4); const s = yearStats.get(y) || { photos: 0, wild: 0 }; s.photos++; if (it.kind === 'wild') s.wild++; yearStats.set(y, s); }
    for (const s of sightings){ const y = +s.date.slice(0, 4); const st = yearStats.get(y) || { photos: 0, wild: 0 }; st.species = st.species || new Set(); st.species.add(s.species); yearStats.set(y, st); }
    for (const l of logRows){ const y = +l.date.slice(0, 4); const st = yearStats.get(y) || { photos: 0, wild: 0 }; st.journal = (st.journal || 0) + 1; yearStats.set(y, st); }
    const monthLabels = [];
    for (let d = new Date(first.getFullYear(), first.getMonth(), 1, 12); d <= last; d.setMonth(d.getMonth() + 1)){
      const ds = data.isoDate(d), zz = zOfDate(ds), isYear = d.getMonth() === 0;
      if (isYear){
        const portal = new THREE.Mesh(new THREE.TorusGeometry(R + 0.35, 0.09, 12, 120), portalMat); portal.position.z = zz; tunnel.add(portal);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(R + 0.35, 0.5, 8, 120), new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.08, depthWrite: false })); halo.position.z = zz; tunnel.add(halo);
        const st = yearStats.get(d.getFullYear()) || {};
        const lab = ctx.text(String(d.getFullYear()), { size: 1.5, color: colors.accent, weight: 800 }); lab.position.set(0, R - 1.0, zz); tunnel.add(lab);
        const facts = [`${st.photos || 0} photos`, st.species ? `${st.species.size} species seen` : null, st.journal ? `${st.journal} journal entries` : null].filter(Boolean).join(' · ');
        const fl = ctx.text(facts, { size: 0.42, color: colors.ink }); fl.position.set(0, R - 2.1, zz); tunnel.add(fl);
      } else {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.3, 0.025, 6, 96), ringMat); ring.position.z = zz; tunnel.add(ring);
      }
      const ml = ctx.text(d.toLocaleDateString(undefined, { month: 'short' }) + (isYear ? '' : ` ${String(d.getFullYear()).slice(2)}`), { size: 0.36, color: colors.muted });
      ml.position.set(R + 0.1, -R + 0.6, zz); tunnel.add(ml); monthLabels.push(ml);
    }
    const railPts = [];
    for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2; railPts.push(Math.cos(a) * (R + 0.3), Math.sin(a) * (R + 0.3), 4, Math.cos(a) * (R + 0.3), Math.sin(a) * (R + 0.3), endZ); }
    tunnel.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(railPts, 3)), new THREE.LineBasicMaterial({ color: colors.light ? '#b9cccc' : '#1d3d41', transparent: true, opacity: 0.8 })));

    /* ---------- wildlife sightings down the middle ---------- */
    for (const s of sightings){
      const g = ctx.glyph(CAT_GLYPH[s.category] || '🐾', 0.9, colors.light ? 'rgba(255,255,255,.9)' : 'rgba(255,200,120,.22)');
      const zz = zOfDate(s.date), a = (s.id || s.species).split('').reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7);
      g.position.set(Math.cos(a) * 1.6, Math.sin(a) * 1.1, zz); tunnel.add(g);
      ctx.pick(g, { tip: () => `<span class="t-head">${CAT_GLYPH[s.category] || '🐾'} ${data.esc(s.species)}</span>${data.fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}${s.location ? ` · ${data.esc(s.location)}` : ''}${s.notes ? `<span class="t-sub">${data.esc(s.notes)}</span>` : ''}` });
    }
    /* ---------- journal fireflies ---------- */
    const jl = logRows.filter(l => l.date >= items[0].date);
    const flyGeo = new THREE.BufferGeometry(), fpos = new Float32Array(jl.length * 3), fcol = new Float32Array(jl.length * 3), c = new THREE.Color();
    const seeds = jl.map((l, i) => ({ l, a: i * 2.1, r: 0.6 + (i * 0.37 % 1.6), y0: (i * 0.53 % 1.4) - 0.7 }));
    seeds.forEach((s, i) => { c.set(ACTION_COLOR[s.l.action] || '#ffffff').multiplyScalar(colors.light ? 1 : 1.8); fcol.set([c.r, c.g, c.b], i * 3); });
    flyGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); flyGeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ size: 0.3, map: ctx.glow(), vertexColors: true, toneMapped: false, transparent: true, depthWrite: false, blending: colors.light ? THREE.NormalBlending : THREE.AdditiveBlending }));
    tunnel.add(flies);
    const placeFlies = t => { seeds.forEach((s, i) => { const zz = zOfDate(s.l.date); fpos.set([Math.cos(s.a + t * 0.4) * s.r, s.y0 + Math.sin(t * 0.9 + s.a) * 0.15 - 1.4, zz], i * 3); }); flyGeo.attributes.position.needsUpdate = true; flyGeo.computeBoundingSphere(); };
    placeFlies(0);
    ctx.pick(flies, { tip: h => { const s = seeds[h.index]; if (!s) return null; const p = byId.get(s.l.plantId); return `<span class="t-head">📓 ${data.esc(s.l.action)}</span>${data.fmtDate(s.l.date, { month: 'short', day: 'numeric', year: 'numeric' })}${p ? ` · ${data.esc(p.name)}` : ''}${s.l.value != null ? ` · ${s.l.value} in` : ''}${s.l.note ? `<span class="t-sub">${data.esc(s.l.note.slice(0, 140))}</span>` : ''}`; } });

    /* ---------- loading photos nearest-first ---------- */
    const state = new Array(items.length).fill(0);   // 0 none, 1 loading, 2 done
    let active = 0;
    const MAXC = 6;
    function pump(){
      while (active < MAXC){
        let best = -1, bd = Infinity;
        for (let i = 0; i < items.length; i++){
          if (state[i]) continue;
          const dz = items[i].z - camZ;
          const d = dz > 2 ? dz * 3 : -dz;        // ahead of the camera first, behind costs more
          if (d < bd && d < 90){ bd = d; best = i; }
        }
        if (best < 0) return;
        state[best] = 1; active++;
        const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
        const i = best;
        img.onload = () => { active--; state[i] = 2; if (ctx.alive()){ drawFrame(i, img); items[i].img = img; pump(); } };
        img.onerror = () => { if (!img.dataset.fallback){ img.dataset.fallback = 1; img.src = data.imageURL(items[i].key); return; } active--; state[i] = 2; pump(); };
        img.src = data.thumbURL(items[i].key);
      }
    }

    /* ---------- sharp cards right in front (640 px thumbs) ---------- */
    const hiPool = [], HI = 6, hiCache = new Map();
    for (let k = 0; k < HI; k++){
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(CARD, CARD), new THREE.MeshBasicMaterial({ color: '#f6f4ee', side: THREE.DoubleSide }));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      pic.position.z = 0.01; frame.add(pic); frame.visible = false; tunnel.add(frame);
      hiPool.push({ frame, pic, idx: -1 });
    }
    function updateHi(){
      const near = items.map((it, i) => ({ i, d: camZ - it.z })).filter(o => o.d > 1.5 && o.d < 9 && items[o.i].img).sort((a, b) => a.d - b.d).slice(0, HI).map(o => o.i);
      for (const slot of hiPool){ if (slot.idx >= 0 && !near.includes(slot.idx)){ slot.frame.visible = false; slot.idx = -1; } }
      for (const i of near){
        if (hiPool.some(s => s.idx === i)) continue;
        const slot = hiPool.find(s => s.idx < 0); if (!slot) break;
        slot.idx = i;
        const it = items[i];
        slot.frame.matrixAutoUpdate = false; slot.frame.matrix.copy(it.matrix).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.02)); slot.frame.matrixWorldNeedsUpdate = true;
        slot.frame.material.color.set(it.kind === 'wild' ? '#f3d9a4' : '#f6f4ee');
        const use = tex => {
          if (slot.idx !== i) return;
          const ar = tex.image.width / tex.image.height, iw = CARD - 0.14, ih = CARD - 0.36;
          let w = iw, h = iw / ar; if (h > ih){ h = ih; w = ih * ar; }
          slot.pic.material.map = tex; slot.pic.material.needsUpdate = true;
          slot.pic.scale.set(w, h, 1); slot.pic.position.y = (0.36 - 0.14) / 2 / 1;
          slot.frame.visible = true;
        };
        if (hiCache.has(it.key)) use(hiCache.get(it.key));
        else new THREE.TextureLoader().loadAsync(data.thumbURL(it.key)).then(tex => { tex.colorSpace = THREE.SRGBColorSpace; hiCache.set(it.key, tex); if (hiCache.size > 30){ const [k0, t0x] = hiCache.entries().next().value; if (!hiPool.some(s => s.pic.material.map === t0x)){ t0x.dispose(); hiCache.delete(k0); } } use(tex); }).catch(() => {});
      }
    }

    /* ---------- travel ---------- */
    controls.enabled = false;
    let camZ = 6, targetZ = 6, playing = !reducedMotion, look = { x: 0, y: 0 };
    const startZ = 6;
    const slider = ui.range({ label: 'When', min: 0, max: 1000, step: 1, value: 0, wide: true, format: v => data.fmtDate(dateAtZ(startZ + (endZ - startZ) * v / 1000 - 4), { month: 'short', year: 'numeric' }), onInput: v => { playing = false; playBtn.textContent = '▶ Fly'; targetZ = startZ + (endZ - startZ) * v / 1000; } });
    const playBtn = ui.button({ label: playing ? '❚❚ Pause' : '▶ Fly', primary: true, onClick: b => { playing = !playing; b.textContent = playing ? '❚❚ Pause' : '▶ Fly'; if (playing && camZ <= endZ + 1) targetZ = camZ = startZ; } });
    const years = [...yearStats.keys()].filter(y => y >= first.getFullYear()).sort();
    ui.select({ label: 'Jump to', value: '', options: [{ value: '', label: 'A year…' }, ...years.map(y => ({ value: y, label: String(y) }))], onChange: v => { if (!v) return; playing = false; playBtn.textContent = '▶ Fly'; targetZ = zOfDate(`${v}-01-01`) + 4; } });
    const el = ctx.renderer.domElement;
    const onWheel = e => { e.preventDefault(); playing = false; playBtn.textContent = '▶ Fly'; targetZ = Math.max(endZ, Math.min(startZ, targetZ - e.deltaY * 0.02)); };
    const onMove = e => { const r = el.getBoundingClientRect(); look.x = ((e.clientX - r.left) / r.width - 0.5) * 2; look.y = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    let touchY = null;
    const onTouchStart = e => { touchY = e.touches[0].clientY; };
    const onTouchMove = e => { if (touchY == null) return; const dy = e.touches[0].clientY - touchY; touchY = e.touches[0].clientY; playing = false; playBtn.textContent = '▶ Fly'; targetZ = Math.max(endZ, Math.min(startZ, targetZ + dy * 0.06)); e.preventDefault(); };
    const onKey = e => { if (e.target.closest('input,select,textarea')) return; if (e.key === 'ArrowUp'){ targetZ = Math.max(endZ, targetZ - 2); e.preventDefault(); } if (e.key === 'ArrowDown'){ targetZ = Math.min(startZ, targetZ + 2); e.preventDefault(); } };
    el.addEventListener('wheel', onWheel, { passive: false }); el.addEventListener('pointermove', onMove);
    el.addEventListener('touchstart', onTouchStart, { passive: true }); el.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('keydown', onKey);

    // Lightbox
    const dlg = document.createElement('dialog'); dlg.className = 'y3-light';
    dlg.innerHTML = '<button type="button" class="y3-btn ghost">Close</button><img alt=""><p></p>';
    document.body.appendChild(dlg);
    dlg.querySelector('button').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    function openPhoto(it){
      playing = false; playBtn.textContent = '▶ Fly';
      dlg.querySelector('img').src = data.imageURL(it.key); dlg.querySelector('img').alt = it.name;
      dlg.querySelector('p').textContent = `${it.name} · ${data.fmtDate(it.date)}${it.caption ? ' · ' + it.caption : ''}`;
      dlg.showModal();
    }

    ctx.hint('Scroll, swipe or use ↑ / ↓ to travel · move the mouse to look around · click a photo to open it');
    ui.legend([{ color: '#f6f4ee', label: 'Plant photo', shape: 'bar' }, { color: '#f3d9a4', label: 'Wildlife photo', shape: 'bar' }, { color: colors.accent, label: 'New Year portal', shape: 'ring' }, { shape: 'glyph', glyph: '🐦', label: 'Sighting' }, { color: '#5fb4ff', label: 'Journal entry (firefly)', shape: 'dot' }]);
    ctx.about(`<p>Every photo you’ve kept, <strong>${items.length}</strong> of them from ${data.fmtDate(items[0].date, { month: 'long', year: 'numeric' })} on, spiraling around a tunnel in the order they were taken. White frames are plants, amber frames are wildlife. Each <strong>New Year</strong> is a glowing portal with that year’s photo count, species seen and journal entries.</p><p>Wildlife sightings float down the middle as little animals, and every journal entry is a firefly colored by what you did (blue for watering, red for frost damage…). Busy stretches spread out and quiet months pass quickly, so the tunnel is long where life was happening. Hidden photos and private yard photos stay out.</p>`);

    const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3();
    let lastPump = 0, lastHi = 0, lastRead = '';
    camera.position.set(0, 0, camZ); camera.lookAt(0, 0, camZ - 10); camera.fov = 70; camera.updateProjectionMatrix();
    pump();
    return {
      reset(){ targetZ = startZ; playing = false; playBtn.textContent = '▶ Fly'; },
      update(t, dt){
        if (playing){ targetZ -= dt * 3.2; if (targetZ <= endZ){ targetZ = endZ; playing = false; playBtn.textContent = '▶ Fly'; } }
        camZ += (targetZ - camZ) * Math.min(1, dt * (playing ? 6 : 3.5));
        camPos.set(Math.sin(t * 0.3) * 0.15 * (reducedMotion ? 0 : 1), Math.cos(t * 0.23) * 0.1 * (reducedMotion ? 0 : 1), camZ);
        camera.position.copy(camPos);
        lookAt.set(look.x * 2.6, -look.y * 1.8, camZ - 10);
        camera.lookAt(lookAt);
        slider.set(Math.round((camZ - startZ) / (endZ - startZ) * 1000));
        if (t - lastPump > 0.25){ lastPump = t; pump(); }
        if (t - lastHi > 0.2){ lastHi = t; updateHi(); }
        for (const A of atlases) if (A.dirty && (t * 4 | 0) !== A.lastUp){ A.tex.needsUpdate = true; A.dirty = false; A.lastUp = t * 4 | 0; }
        if (!reducedMotion) placeFlies(t);
        const ds = dateAtZ(camZ - 4);
        const ym = ds.slice(0, 7);
        if (ym !== lastRead){
          lastRead = ym;
          const inMonth = items.filter(i => i.date.startsWith(ym)), sp = sightings.filter(s => s.date.startsWith(ym)), jj = logRows.filter(l => l.date.startsWith(ym));
          const names = [...new Set(inMonth.map(i => i.name))];
          ui.readout(`<strong>${data.fmtDate(ym + '-15', { month: 'long', year: 'numeric' })}</strong>${inMonth.length} photo${inMonth.length === 1 ? '' : 's'}${sp.length ? ` · ${sp.length} sighting${sp.length > 1 ? 's' : ''}` : ''}${jj.length ? ` · ${jj.length} journal entr${jj.length > 1 ? 'ies' : 'y'}` : ''}${names.length ? `<br><span class="k">${names.slice(0, 4).map(data.esc).join(', ')}${names.length > 4 ? ` +${names.length - 4}` : ''}</span>` : ''}`);
        }
      },
      dispose(){
        el.removeEventListener('wheel', onWheel); el.removeEventListener('pointermove', onMove);
        el.removeEventListener('touchstart', onTouchStart); el.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('keydown', onKey); dlg.remove();
        for (const tex of hiCache.values()) tex.dispose();
        camera.fov = 45; camera.updateProjectionMatrix();
      },
    };
  },
};
