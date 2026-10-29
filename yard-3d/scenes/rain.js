/* 03 · Rain & the watering can: a year as twelve wall-calendar months. Rain
 * hangs from above each day (ERA5 daily precipitation), the plants you watered
 * stack up from below (one drop per plant, from the journal), and each day's
 * tile dries from green toward tan the longer it has gone without real rain. */
const BW = 7, BD = 6, GX = 2.2, GZ = 2.4;           // month block size and gaps (tiles)
const CEIL = 7.5;                                    // where the rain hangs from
const MEANINGFUL = 0.1;                              // inches that count as "real rain"

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Reading the watering log…');
    const [logRows, byId] = await Promise.all([data.log().catch(() => []), data.plantsById().catch(() => new Map())]);
    if (!ctx.alive()) return;
    const water = logRows.filter(l => l.action === 'watered');
    const perYear = new Map(); for (const w of water) perYear.set(+w.date.slice(0, 4), (perYear.get(+w.date.slice(0, 4)) || 0) + 1);
    const years = data.archiveYears().filter(y => y >= 2021).reverse();
    let year = [...perYear.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || years[0];

    scene.add(new THREE.HemisphereLight('#ffffff', colors.light ? '#9aa79a' : '#223030', colors.light ? 1.5 : 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 1.3); key.position.set(10, 30, 18); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; Object.assign(key.shadow.camera, { left: -30, right: 30, top: 25, bottom: -25, near: 1, far: 80 });
    scene.add(key);

    let world = null;
    async function show(y){
      year = y;
      ctx.status(`Loading ${y} rain…`);
      const days = await data.weatherYear(y).catch(() => []);
      // Also the end of last year, so January's "days since rain" starts right.
      const prev = await data.weatherYear(y - 1).catch(() => []);
      if (!ctx.alive() || y !== year) return;
      if (world){ scene.remove(world.root); world.root.traverse(o => { ctx.unpick(o); o.geometry && o.geometry.dispose(); if (o.material){ o.material.map && !o.material.map.userData.shared && o.material.map.dispose(); o.material.dispose(); } }); }
      world = buildYear(y, days, prev);
      scene.add(world.root);
      ctx.status(null);
    }

    function buildYear(y, days, prev){
      const root = new THREE.Group();
      const byDate = new Map(days.map(d => [d.date, d]));
      const latest = days.length ? days[days.length - 1].date : `${y}-01-00`;
      const today = data.todayISO();
      // Days since meaningful rain, carried across New Year.
      let since = 0;
      for (const d of prev) since = d.pcp >= MEANINGFUL ? 0 : since + 1;
      if (!prev.length) since = 0;
      const dry = new Map();
      for (const d of days){ dry.set(d.date, since); since = d.pcp >= MEANINGFUL ? 0 : since + 1; }
      const waterBy = new Map();
      for (const w of water) if (w.date.startsWith(String(y))){ if (!waterBy.has(w.date)) waterBy.set(w.date, []); waterBy.get(w.date).push(w); }

      const blockX = m => ((m % 4) - 1.5) * (BW + GX);
      const blockZ = m => (Math.floor(m / 4) - 1) * (BD + GZ);
      const cell = date => {
        const d = data.parseDate(date), m = d.getMonth(), first = new Date(d.getFullYear(), m, 1).getDay();
        const idx = first + d.getDate() - 1, col = idx % 7, row = Math.floor(idx / 7);
        return { x: blockX(m) + (col - 3) * 1, z: blockZ(m) + (row - 2.5) * 1, m };
      };

      // Base slab per month + labels
      const baseMat = new THREE.MeshStandardMaterial({ color: colors.panel, roughness: 0.95 });
      for (let m = 0; m < 12; m++){
        const slab = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.6, 0.3, BD + 0.6), baseMat);
        slab.position.set(blockX(m), -0.15, blockZ(m)); slab.receiveShadow = true; root.add(slab);
        const lab = ctx.text(new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long' }), { size: 0.62, color: colors.ink, weight: 700, align: 'left' });
        lab.position.set(blockX(m) - BW / 2, 0.15, blockZ(m) - BD / 2 - 0.75); root.add(lab);
        if (m < 4) ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((w, i) => {
          const s = ctx.text(w, { size: 0.36, color: colors.muted }); s.position.set(blockX(m) + (i - 3), 0.15, blockZ(m) - BD / 2 - 0.2); root.add(s);
        });
      }

      // Day tiles
      const allDates = [];
      for (let d = new Date(y, 0, 1, 12); d.getFullYear() === y; d.setDate(d.getDate() + 1)) allDates.push(data.isoDate(d));
      const tileGeo = new THREE.BoxGeometry(0.88, 0.14, 0.88);
      const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), allDates.length);
      tiles.receiveShadow = true;
      const m4 = new THREE.Matrix4(), c = new THREE.Color();
      const wet = new THREE.Color(colors.light ? '#5fae6a' : '#3f9a5a'), parched = new THREE.Color(colors.light ? '#d8b26a' : '#b8894a');
      const none = new THREE.Color(colors.light ? '#dfe6e6' : '#25393c');
      allDates.forEach((ds, i) => {
        const p = cell(ds); m4.makeTranslation(p.x, 0.07, p.z); tiles.setMatrixAt(i, m4);
        if (byDate.has(ds)) c.copy(wet).lerp(parched, Math.min(1, dry.get(ds) / 14));
        else c.copy(none);
        if (ds === today) c.lerp(new THREE.Color(colors.accent), 0.6);
        tiles.setColorAt(i, c);
      });
      root.add(tiles);
      ctx.pick(tiles, { tip: h => tipFor(allDates[h.instanceId]) });

      // Rain: columns hanging from the ceiling, length ∝ rain
      const rainy = days.filter(d => d.pcp >= 0.01);
      const rainMat = new THREE.MeshStandardMaterial({ color: colors.light ? '#3a8ee0' : '#6cbcff', transparent: true, opacity: 0.8, roughness: 0.3, emissive: colors.light ? '#000' : '#16456e', emissiveIntensity: 0.6 });
      const rainCols = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 1, 4, 10).translate(0, -0.5 - 0.2, 0), rainMat, rainy.length);
      const len = p => Math.min(4.2, 0.12 + p * 2.6);   // capsule scale; drawn length is 1.4×
      rainy.forEach((d, i) => {
        const p = cell(d.date), l = len(d.pcp), w = 0.45 + Math.min(0.55, d.pcp * 0.5);
        m4.compose(new THREE.Vector3(p.x, CEIL, p.z), new THREE.Quaternion(), new THREE.Vector3(w, l, w)); rainCols.setMatrixAt(i, m4);
      });
      root.add(rainCols);
      ctx.pick(rainCols, { tip: h => tipFor(rainy[h.instanceId].date) });
      // Cloud ceiling
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(4 * (BW + GX) + 2, 3 * (BD + GZ) + 2), new THREE.MeshBasicMaterial({ color: colors.light ? '#9fb7c9' : '#cfe7ff', transparent: true, opacity: colors.light ? 0.12 : 0.05, side: THREE.DoubleSide, depthWrite: false }));
      ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL + 0.02; root.add(ceil);

      // Falling drops under the heavier rain days
      const heavy = rainy.filter(d => d.pcp >= 0.15), DROPS = 3;
      const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: colors.light ? '#2f7fd8' : '#a8dcff', transparent: true, opacity: 0.8 }), heavy.length * DROPS);
      const dropState = heavy.flatMap(d => { const p = cell(d.date), top = CEIL - 1.4 * len(d.pcp) - 0.1; return Array.from({ length: DROPS }, (_, k) => ({ x: p.x + (Math.random() - 0.5) * 0.4, z: p.z + (Math.random() - 0.5) * 0.4, top, phase: Math.random() + k / DROPS })); });
      root.add(drops);

      // Watering: a stack of drops per plant watered
      const stacks = [...waterBy.entries()];
      const discs = [];
      for (const [ds, ws] of stacks){ const p = cell(ds); ws.forEach((w, k) => discs.push({ ds, k, n: ws.length, p, w })); }
      const discMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 18), new THREE.MeshStandardMaterial({ color: colors.light ? '#0f9a8c' : '#4dd0c1', roughness: 0.35, metalness: 0.1, emissive: colors.light ? '#000' : '#0d5e56', emissiveIntensity: 0.5 }), discs.length);
      discMesh.castShadow = true;
      discs.forEach((d, i) => { const h = Math.min(0.2, 3.2 / d.n); m4.compose(new THREE.Vector3(d.p.x, 0.2 + d.k * h, d.p.z), new THREE.Quaternion(), new THREE.Vector3(1, h / 0.2, 1)); discMesh.setMatrixAt(i, m4); });
      root.add(discMesh);
      ctx.pick(discMesh, { tip: h => tipFor(discs[h.instanceId].ds) });
      for (const [ds, ws] of stacks){
        if (ws.length < 4) continue;
        const p = cell(ds), h = Math.min(0.2, 3.2 / ws.length);
        const s = ctx.text(String(ws.length), { size: 0.42, color: colors.ink, weight: 700 }); s.position.set(p.x, 0.55 + ws.length * h, p.z); root.add(s);
      }

      function tipFor(ds){
        const d = byDate.get(ds), ws = waterBy.get(ds) || [];
        const head = `<span class="t-head">${data.fmtDate(ds, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
        if (!d) return head + (ds > today ? 'Still to come.' : ds > latest ? 'Weather estimate not in yet (the archive runs about five days behind).' : 'No weather estimate for this day.')
          + (ws.length ? `<br>💧 Watered ${ws.length} plant${ws.length > 1 ? 's' : ''}` : '');
        const names = [...new Set(ws.map(w => (byId.get(w.plantId) || {}).name).filter(Boolean))];
        return head + (d.pcp >= 0.01 ? `🌧️ <b>${d.pcp.toFixed(2)} in</b> of rain` : 'No rain') + `<br><span class="k">Days since ≥${MEANINGFUL} in:</span> ${dry.get(ds)}`
          + (names.length ? `<br>💧 Watered <b>${names.length}</b>: ${names.slice(0, 10).map(data.esc).join(', ')}${names.length > 10 ? ` +${names.length - 10} more` : ''}` : '');
      }

      // Summary
      const totalRain = days.reduce((s, d) => s + (d.pcp || 0), 0);
      const wDays = stacks.map(([ds]) => ds), withDry = wDays.filter(ds => dry.has(ds));
      const afterDry = withDry.filter(ds => dry.get(ds) >= 5).length;
      const longest = (() => { let best = 0, end = null; for (const d of days){ const v = dry.get(d.date); if (v > best){ best = v; end = d.date; } } return { best, end }; })();
      ui.readout(`<strong>${y}</strong>🌧️ ${totalRain.toFixed(1)} in of rain through ${data.fmtDate(latest, { month: 'short', day: 'numeric' })}<br>💧 ${water.filter(w => w.date.startsWith(String(y))).length} waterings on ${wDays.length} day${wDays.length === 1 ? '' : 's'}${withDry.length >= 3 ? `, ${Math.round(afterDry / withDry.length * 100)}% after 5+ dry days` : ''}${longest.best ? `<br><span class="k">Longest dry spell</span> ${longest.best} days, to ${data.fmtDate(longest.end, { month: 'short', day: 'numeric' })}` : ''}`);

      return {
        root,
        update(t){
          if (reducedMotion || !dropState.length) return;
          dropState.forEach((s, i) => {
            const f = (t * 0.55 + s.phase) % 1, yy = s.top - f * (s.top - 0.2);
            m4.makeTranslation(s.x, yy, s.z); drops.setMatrixAt(i, m4);
          });
          drops.instanceMatrix.needsUpdate = true;
        },
      };
    }

    ui.select({ label: 'Year', value: year, options: years.map(y => ({ value: y, label: `${y}${perYear.has(y) ? ` · ${perYear.get(y)} waterings` : ''}` })), onChange: v => show(+v) });
    ui.legend([{ color: colors.light ? '#3a8ee0' : '#6cbcff', label: 'Rain that day (hangs from above)', shape: 'bar' },
      { color: colors.light ? '#0f9a8c' : '#4dd0c1', label: 'One drop per plant you watered', shape: 'dot' }]);
    ui.legend([{ color: colors.light ? '#5fae6a' : '#3f9a5a', label: 'Recent rain', shape: 'bar' }, { color: colors.light ? '#d8b26a' : '#b8894a', label: '2 weeks without ≥0.1 in', shape: 'bar' }], 'Ground');
    ctx.about(`<p>A year laid out like a wall calendar. <strong>Rain hangs from the sky</strong> over each day it fell, longer for heavier rain, and the <strong>watering you logged rises from the ground</strong>, one teal drop per plant. The tiles themselves dry out from green toward tan the longer it has been since a real rain (at least ${MEANINGFUL} in).</p><p>Read it for the conversation between the two: watering towers should sit in the tan stretches, and rain columns should make them unnecessary. Rain is the ERA5 estimate for Lilly, which runs about five days behind, so the newest days show as empty grey tiles.</p>`);

    camera.position.set(0, 30, 30); controls.target.set(0, 1.5, 1);
    controls.maxDistance = 110;
    await show(year);
    return { update: (t, dt) => world && world.update && world.update(t, dt) };
  },
};
