/* 05 · Care orrery: every task in the care calendar as an arc around a year
 * dial (January at 12 o'clock, clockwise). Each kind of care has its own ring;
 * tasks that overlap stack upward, so a ring's height is how many plants need
 * that care at the same time. A hand points at today; tasks under it glow,
 * ones you've logged turn to a check, skipped ones fade. */
const CATS = [
  { id: 'water',   label: 'Watering',            color: '#4fb6ff', re: /\b(water|soak|irrigat)/i },
  { id: 'inout',   label: 'Inside / outside',    color: '#c792ff', re: /bring|indoors|inside|take .*out|outdoors|harden/i },
  { id: 'protect', label: 'Winter protection',   color: '#9fe3ff', re: /cover|wrap|protect|burlap|shelter|insulat|anti-?desiccant|guard|stake/i },
  { id: 'mulch',   label: 'Mulch & clean-up',    color: '#d7a35c', re: /mulch|clean|rake|leaves|debris|divide|cut down|tidy/i },
  { id: 'prune',   label: 'Pruning',             color: '#7ee08a', re: /prun|trim|cut back|shear|deadhead|pinch|shape|thin|remove (dead|spent)/i },
  { id: 'feed',    label: 'Feeding',             color: '#f2cf4d', re: /fertili|feed|compost|top.?dress|amend|lime/i },
  { id: 'pests',   label: 'Pests & checks',      color: '#ff8a6b', re: /pest|spray|inspect|check|scout|beetle|aphid|treat|disease|oil|monitor|watch/i },
  { id: 'plant',   label: 'Planting & moving',   color: '#5fd6c0', re: /plant|transplant|sow|move|repot|pot up|divide/i },
  { id: 'other',   label: 'Other',               color: '#b9c4c6', re: /./ },
];
// Same mapping the plants page uses to decide a task is "done" from the log.
const TASK_LOG_ACTION = [
  [/^(plant|transplant|sow|put in (the )?ground)\b/i, 'planted'],
  [/uncover|unwrap|remove (the )?(cover|wrap|protection|burlap)/i, 'uncovered'],
  [/cover|wrap|protect|burlap|shelter|insulat/i, 'covered'],
  [/prun|trim|cut back|shear|thin|deadhead|pinch|shape/i, 'pruned'],
  [/fertili|feed|compost|top.?dress|amend/i, 'fertilized'],
  [/repot|pot up|root.?prun/i, 'repotted'],
  [/spray|dormant oil|fungicid|insecticid|neem|treat/i, 'sprayed'],
  [/bring.*(in|indoors)|move.*(in|indoors)|overwinter.*in/i, 'brought inside'],
  [/take.*out|move.*out|outdoors|harden/i, 'taken outside'],
  [/water|soak|irrigat/i, 'watered'],
  [/move|relocat|transplant/i, 'moved'],
];
const taskAction = t => { for (const [re, a] of TASK_LOG_ACTION) if (re.test(t || '')) return a; return (t || '').trim().toLowerCase().slice(0, 60); };
const TAU = Math.PI * 2;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const toXZ = (r, a) => [Math.sin(a) * r, -Math.cos(a) * r];
// MM-DD → 0..365 on a non-leap reference year
const ordinal = md => { const [m, d] = md.split('-').map(Number); return Math.round((new Date(2001, m - 1, d) - new Date(2001, 0, 1)) / 864e5); };
const angOf = o => o / 365 * TAU;

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Reading the care calendar…');
    const [care, plants, logRows] = await Promise.all([data.care(), data.plants(), data.log().catch(() => [])]);
    if (!ctx.alive()) return;
    const byId = new Map(plants.map(p => [p.id, p]));
    const tasks = care.filter(t => { const p = byId.get(t.plantId); return p && !p.dead; });
    if (!tasks.length) throw new Error('No care schedule yet. Generate one from Plants → Care calendar.');

    const today = new Date(), tOrd = ordinal(data.todayISO().slice(5));
    // Window occurrence relevant to today (handles Dec → Jan wrap) and done/skip status.
    function status(t){
      const s = ordinal(t.start), e = ordinal(t.end), wraps = s > e;
      const inWin = wraps ? (tOrd >= s || tOrd <= e) : (tOrd >= s && tOrd <= e);
      const y = today.getFullYear(), sy = wraps && tOrd < s ? y - 1 : y;
      const a = `${sy}-${t.start}`, b = `${wraps ? sy + 1 : sy}-${t.end}`;
      const act = taskAction(t.task);
      const done = logRows.some(l => l.plantId === t.plantId && l.action === act && l.date >= a && l.date <= b);
      const skipped = !!t.skipped && t.skipped >= a && t.skipped <= b;
      return { inWin, done, skipped };
    }
    const items = tasks.map(t => {
      const cat = CATS.find(c => c.re.test(t.task));
      const s = ordinal(t.start), e = ordinal(t.end);
      return { t, cat, s, e: e >= s ? e : e + 365, p: byId.get(t.plantId), st: status(t) };
    });

    // Lanes: greedy stacking inside each ring so overlapping windows don't collide.
    const R0 = 3.2, RING = 1.32, LANE = 0.13;
    const used = CATS.filter(c => items.some(i => i.cat === c));
    used.forEach((c, ci) => {
      c.r = R0 + ci * RING;
      const lanes = [];
      for (const it of items.filter(i => i.cat === c).sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s))){
        const spans = [[it.s, it.e]]; if (it.e > 365) spans.push([it.s - 365, it.e - 365]);
        let li = lanes.findIndex(L => !L.some(([a, b]) => spans.some(([x, y]) => x <= b + 2 && y >= a - 2)));
        if (li < 0){ lanes.push([]); li = lanes.length - 1; }
        lanes[li].push(...spans, ...(it.e <= 365 ? [[it.s + 365, it.e + 365]] : []));
        it.lane = li;
      }
      c.lanes = lanes.length;
    });

    scene.add(new THREE.HemisphereLight('#ffffff', colors.light ? '#8a9a9a' : '#1a2629', colors.light ? 1.4 : 1.0));
    const key = new THREE.DirectionalLight('#fff6ea', 1.3); key.position.set(10, 26, 14); scene.add(key);
    ctx.stage.bloomPass.strength = colors.light ? 0.1 : 0.6; ctx.stage.bloomPass.threshold = 0.6; ctx.stage.bloomPass.radius = 0.55;

    const root = new THREE.Group(); scene.add(root);
    const outer = R0 + used.length * RING + 0.8;
    // Dial
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(outer + 1.6, outer + 1.9, 0.4, 128), new THREE.MeshStandardMaterial({ color: colors.panel, roughness: 0.9, metalness: 0.05 }));
    dial.position.y = -0.22; root.add(dial);
    const tickPts = [];
    for (let m = 0; m < 12; m++){
      const a = angOf(ordinal(`${String(m + 1).padStart(2, '0')}-01`));
      const [x0, z0] = toXZ(R0 - 0.9, a), [x1, z1] = toXZ(outer + 1.2, a);
      tickPts.push(x0, 0.001, z0, x1, 0.001, z1);
      const mid = angOf(ordinal(`${String(m + 1).padStart(2, '0')}-15`)), [lx, lz] = toXZ(outer + 0.75, mid);
      const s = ctx.text(MONTHS[m], { size: 0.62, color: colors.ink, weight: 700 }); s.position.set(lx, 0.3, lz); root.add(s);
    }
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3)), new THREE.LineBasicMaterial({ color: colors.line })));
    for (const c of used){
      const ring = new THREE.Mesh(new THREE.RingGeometry(c.r - 0.03, c.r + 0.03, 160), new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; root.add(ring);
      const [lx, lz] = toXZ(c.r, -0.05);
      const s = ctx.text(c.label, { size: 0.38, color: c.color, weight: 700, align: 'right' }); s.position.set(lx - 0.1, 0.25, lz); root.add(s);
    }

    // Arcs
    const arcs = [];
    const checkMat = new THREE.SpriteMaterial({ map: ctx.glyph('✔️', 1).material.map, transparent: true, depthWrite: false });
    for (const it of items){
      const c = it.cat, y = 0.16 + it.lane * LANE, a0 = angOf(it.s), a1 = angOf(it.e + 1);
      const n = Math.max(6, Math.ceil((a1 - a0) / TAU * 140));
      const pts = []; for (let k = 0; k <= n; k++){ const [x, z] = toXZ(c.r, a0 + (a1 - a0) * k / n); pts.push(new THREE.Vector3(x, y, z)); }
      const single = it.e === it.s;
      const geo = single ? new THREE.SphereGeometry(0.09, 10, 8).translate(pts[0].x, y, pts[0].z) : new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 0.045, 6, false);
      const col = new THREE.Color(c.color);
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.18, roughness: 0.4, transparent: true, opacity: it.st.skipped ? 0.22 : it.st.done ? 0.45 : 0.95 });
      if (it.st.done) mat.color.lerp(new THREE.Color('#ffffff'), 0.35);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.it = it; root.add(mesh);
      it.mesh = mesh; arcs.push(it);
      if (it.st.done && it.st.inWin){
        const sp = new THREE.Sprite(checkMat); sp.scale.set(0.38, 0.38, 1); const [x, z] = toXZ(c.r, angOf(tOrd)); sp.position.set(x, y + 0.25, z); root.add(sp);
      }
      ctx.pick(mesh, { tip: () => tipFor(it), hover: (h, on) => { mesh.material.emissiveIntensity = on ? 1.2 : glowFor(it); } });
    }
    function tipFor(it){
      const win = it.t.start === it.t.end ? data.fmtDate('2001-' + it.t.start, { month: 'short', day: 'numeric' }) : `${data.fmtDate('2001-' + it.t.start, { month: 'short', day: 'numeric' })} – ${data.fmtDate('2001-' + it.t.end, { month: 'short', day: 'numeric' })}`;
      const st = it.st.done ? ' · ✓ logged this time round' : it.st.skipped ? ' · skipped this year' : it.st.inWin ? ' · in progress now' : '';
      return `<span class="t-head">${data.esc(it.p.name)}</span><span class="sw" style="background:${it.cat.color}"></span>${data.esc(it.t.task)}<br><span class="k">${win} every year${st}</span>${it.t.notes ? `<span class="t-sub">${data.esc(it.t.notes.slice(0, 200))}</span>` : ''}`;
    }

    // Hand + hub
    const hand = new THREE.Group(); root.add(hand);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, outer + 0.6), new THREE.MeshBasicMaterial({ color: colors.accent }));
    blade.geometry.translate(0, 0.12, -(outer + 0.6) / 2); hand.add(blade);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(outer + 0.4, outer + 0.4, Math.max(1.5, Math.max(...used.map(c => c.lanes)) * LANE + 0.6), 48, 1, true, Math.PI - 0.012, 0.024),   // a thin wedge pointing along the hand (−z)
      new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    fan.geometry.translate(0, (Math.max(1.5, Math.max(...used.map(c => c.lanes)) * LANE + 0.6)) / 2, 0); hand.add(fan);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 24), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb340', emissiveIntensity: 1.1, roughness: 0.3 }));
    hub.position.y = 0.6; root.add(hub);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glow(), color: '#ffcf70', transparent: true, depthWrite: false, opacity: 0.8 })); halo.scale.set(4, 4, 1); halo.position.y = 0.6; root.add(halo);
    let dateLabel = null;
    function setLabel(ord){
      if (dateLabel){ root.remove(dateLabel); dateLabel.material.map.dispose(); dateLabel.material.dispose(); }
      const d = new Date(2001, 0, 1 + Math.round(ord));
      dateLabel = ctx.text(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), { size: 0.7, color: colors.ink, weight: 700, bg: colors.light ? 'rgba(255,255,255,.85)' : 'rgba(8,25,28,.8)', depthTest: false });
      dateLabel.position.set(0, 2.2, 0); root.add(dateLabel);
    }

    let handOrd = tOrd;
    const glowFor = it => {
      const o = handOrd, inWin = (o >= it.s && o <= it.e) || (o + 365 >= it.s && o + 365 <= it.e);
      return inWin ? (it.st.done || it.st.skipped ? 0.35 : 0.95) : 0.12;
    };
    let lastLabelOrd = -1;
    function setHand(ord){
      handOrd = ((ord % 365) + 365) % 365;
      hand.rotation.y = -angOf(handOrd);
      for (const it of arcs) it.mesh.material.emissiveIntensity = glowFor(it);
      if (Math.round(handOrd) !== lastLabelOrd){ lastLabelOrd = Math.round(handOrd); setLabel(handOrd); readoutFor(handOrd); }
    }
    function readoutFor(o){
      const live = arcs.filter(it => (o >= it.s && o <= it.e) || (o + 365 >= it.s && o + 365 <= it.e));
      const isToday = Math.round(o) === tOrd;
      const open = live.filter(it => !it.st.done && !it.st.skipped);
      const byCat = used.map(c => ({ c, n: (isToday ? open : live).filter(it => it.cat === c).length })).filter(x => x.n);
      const day = new Date(2001, 0, 1 + Math.round(o)).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
      ui.readout(`<strong>${isToday ? 'Today, ' : ''}${day}</strong>${isToday ? `${open.length} task${open.length === 1 ? '' : 's'} open${live.length - open.length ? `, ${live.length - open.length} logged or skipped` : ''}` : `${live.length} task${live.length === 1 ? '' : 's'} in their window`}<br>${byCat.map(x => `<span class="sw" style="background:${x.c.color}"></span>${x.n} ${x.c.label.toLowerCase()}`).join('<br>')}`);
    }
    setHand(tOrd);

    let playing = false;
    const slider = ui.range({ label: 'Date', min: 0, max: 364, step: 1, value: tOrd, wide: true, format: v => new Date(2001, 0, 1 + v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), onInput: v => { playing = false; playBtn.textContent = '▶ Play the year'; setHand(v); } });
    const playBtn = ui.button({ label: '▶ Play the year', onClick: b => { playing = !playing; b.textContent = playing ? '❚❚ Pause' : '▶ Play the year'; } });
    ui.button({ label: 'Today', onClick: () => { playing = false; playBtn.textContent = '▶ Play the year'; slider.set(tOrd); setHand(tOrd); } });
    ui.legend(used.map(c => ({ color: c.color, label: `${c.label} (${items.filter(i => i.cat === c).length})`, shape: 'line' })));
    ui.legend([{ shape: 'glyph', glyph: '✔️', label: 'Logged in the journal this time round' }, { color: colors.muted, label: 'Faded: skipped this year', shape: 'line' }]);
    ctx.about(`<p>All <strong>${items.length} care tasks</strong> for your living plants on one dial. January is at 12 o’clock and the year runs clockwise; each colored ring is a kind of care, and every arc is one plant’s yearly window for that task. Where windows overlap, arcs stack upward, so a tall ring means a lot of plants want the same thing at once (spring pruning, fall watering).</p><p>The teal hand is today. Tasks under it glow; tasks you’ve logged as done in the journal turn pale with a ✔️, and skipped ones fade. Drag the date or press <strong>Play the year</strong> to watch the work move around the calendar.</p>`);

    camera.position.set(0, 30, 23); controls.target.set(0, 0, 0.8);
    controls.maxDistance = 90;
    return {
      update(t, dt){
        if (playing){ const v = (handOrd + dt * 22) % 365; slider.set(Math.round(v)); setHand(v); }
        if (!reducedMotion){ hub.scale.setScalar(1 + Math.sin(t * 2) * 0.03); halo.material.opacity = 0.7 + Math.sin(t * 2) * 0.1; }
      },
    };
  },
};
