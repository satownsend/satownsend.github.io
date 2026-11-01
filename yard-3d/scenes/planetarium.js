import { catalog, constellations, yearDates, visibleRecords, starPosition, hash } from './planetarium-model.js';
import { disposeTree } from '../core.js';

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    const [raw, photoResult] = await Promise.all([data.sightings(), data.wildlifePhotos().then(rows => ({ rows }), () => ({ rows: [], failed: true }))]);
    if (!ctx.alive()) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: data.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const records = catalog(raw, today);
    const years = [...new Set(records.map(r => +r.date.slice(0, 4)))].sort((a, b) => b - a);
    ctx.about('<p>Each species is a constellation; each star is a recorded sighting. The golden halo marks its <strong>first recorded sighting in the selected year</strong>, not its actual arrival. Lines connect records in date order.</p><p>This is an artistic sky, not astronomy or a map of animal locations. Dark gaps mean no sightings were logged, not that wildlife was absent. Use the record list below to explore without animation.</p>');
    ctx.hint('Drag to explore · pinch or scroll to zoom · tap a star · or use the record list below');
    scene.background = new THREE.Color(colors.light ? '#17263f' : '#050b1b');
    ctx.stage.bloomPass.strength = .55;
    let portrait = camera.aspect < 1.2;
    camera.position.set(0, 17, portrait ? 68 : 30); controls.target.set(0, 12, -8);
    controls.minDistance = 12; controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * .7;
    // Faint dome meridians are guides, never invented sighting stars.
    const dome = new THREE.HemisphereLight('#dceaff', '#18263b', 1); scene.add(dome);
    for (let i = 0; i < 7; i++){
      const a = -1.5 + i * .5, pts = [];
      for (let j = 0; j <= 60; j++){ const e = j / 60 * Math.PI / 2; pts.push(new THREE.Vector3(26 * Math.cos(e) * Math.sin(a), 26 * Math.sin(e), -26 * Math.cos(e) * Math.cos(a))); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#385173', transparent: true, opacity: .25 })));
    }
    const panel = document.createElement('section'); panel.className = 'y3-sky-records'; panel.setAttribute('aria-label', 'Wildlife sighting records');
    document.querySelector('#legend').after(panel);
    if (!years.length){
      ui.readout('<strong>No dated sightings yet</strong>Log a wildlife sighting to light the first star.');
      panel.innerHTML = '<p>No valid, nonfuture sighting dates are available. <a href="/wildlife/">Open Wildlife →</a></p>';
      return { dispose(){ panel.remove(); } };
    }
    const ringCanvas = document.createElement('canvas'); ringCanvas.width = ringCanvas.height = 128;
    const ringInk = ringCanvas.getContext('2d'); ringInk.strokeStyle = '#fff'; ringInk.lineWidth = 3;
    ringInk.beginPath(); ringInk.arc(64, 64, 43, 0, Math.PI * 2); ringInk.stroke();
    const ringTexture = new THREE.CanvasTexture(ringCanvas); ringTexture.userData.shared = true;
    const photos = new Map();
    for (const p of photoResult.rows){ if (!photos.has(p.sightingId)) photos.set(p.sightingId, []); photos.get(p.sightingId).push(p); }
    let year = years[0], dates = yearDates(year, today), day = dates.length - 1, category = '', species = '', playing = false, clock = 0;
    let groups = [], visuals = [], sky = null, selected = '', lastRendered = '';
    const palette = ['#9bceff', '#e5b6ff', '#85e4c2', '#ffbe91', '#f4d87e', '#a8baff'];
    panel.innerHTML = '<div class="y3-sky-heading"><h3>Explore the sightings</h3><p class="y3-sky-summary" role="status"></p></div><div class="y3-sky-list" aria-label="Species constellations"></div><div class="y3-sky-detail"></div>';
    const list = panel.querySelector('.y3-sky-list'), detail = panel.querySelector('.y3-sky-detail'), summary = panel.querySelector('.y3-sky-summary');
    ui.select({ label: 'Year', options: years.map(y => ({ value: y, label: y })), value: year, onChange(v){ stop(); year = +v; dates = yearDates(year, today); day = dates.length - 1; slider.el.max = day; slider.set(day); rebuild(); } });
    const categories = [...new Set(records.map(r => r.category))].sort();
    ui.select({ label: 'Category', options: [{ value: '', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))], value: '', onChange(v){ stop(); category = v; refreshOptions(); render(); } });
    const speciesSelect = ui.select({ label: 'Species', options: [{ value: '', label: 'All species' }], value: '', onChange(v){ stop(); species = v; render(); } });
    const slider = ui.range({ label: 'Date', min: 0, max: day, value: day, wide: true, format: v => data.fmtDate(dates[v]), onInput(v){ stop(); day = v; render(); } });
    const play = ui.button({ label: 'Play year', onClick(){ if (playing) stop(); else { if (day >= dates.length - 1) day = 0; playing = true; play.textContent = 'Pause'; clock = 0; slider.set(day); render(); } } });
    ui.button({ label: 'Next sighting', onClick(){ stop(); const next = records.find(r => +r.date.slice(0, 4) === year && r.date > dates[day] && (!category || r.category === category) && (!species || r.species === species)); if (next){ day = dates.indexOf(next.date); slider.set(day); render(); } } });
    ui.legend([{ color: '#b5d9ff', label: 'One star per recorded sighting' }, { color: '#ffdb8e', label: 'First recorded date this year', shape: 'ring' }]);
    function stop(){ playing = false; play.textContent = 'Play year'; }
    function refreshOptions(){
      const available = groups.filter(g => !category || g.categories.includes(category));
      if (!available.some(g => g.species === species)) species = '';
      speciesSelect.innerHTML = '<option value="">All species</option>' + available.map(g => `<option value="${data.esc(g.species)}">${data.esc(g.species)}</option>`).join(''); speciesSelect.value = species;
    }
    function openGroup(name, focus = false){
      stop(); selected = name; lastRendered = ''; render();
      if (focus) detail.querySelector('h4')?.focus({ preventScroll: true });
    }
    function rebuild(){
      if (sky){ visuals.forEach(v => ctx.unpick(v.group)); scene.remove(sky); disposeTree(sky); }
      sky = new THREE.Group(); scene.add(sky); visuals = []; groups = constellations(records, year); refreshOptions();
      groups.forEach((g, i) => {
        const group = new THREE.Group(), color = palette[Math.floor(hash(g.species) * palette.length)], points = [], stars = [];
        sky.add(group);
        g.records.forEach((r, j) => {
          const pos = new THREE.Vector3(...starPosition(i, groups.length, g.species + r.id + r.date + j)); points.push(pos);
          const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glow(), color, transparent: true, depthWrite: false })); star.position.copy(pos); star.scale.setScalar(.85); group.add(star);
          let halo = null;
          if (r.date === g.first){ halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture, color: '#ffd57a', transparent: true, opacity: .8, depthWrite: false })); halo.position.copy(pos); halo.scale.setScalar(1.5); group.add(halo); }
          stars.push({ star, halo, record: r });
        });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .32 })); group.add(line);
        const labelText = g.species.length > 16 ? g.species.replace(/ (?!.* )/, '\n') : g.species;
        const label = ctx.text(labelText, { size: 1, color: '#d9e7ff', depthTest: false }); label.position.copy(points[0]); label.position.y -= 1.15; group.add(label);
        ctx.pick(group, { tip: () => `<b>${data.esc(g.species)}</b><br>${visibleRecords(g, dates[day], category).length} recorded sightings through ${data.esc(data.fmtDate(dates[day]))}<br>Tap to explore`, click: () => openGroup(g.species, true), accept: hit => hit.object.visible });
        visuals.push({ group, stars, line, label, data: g, points });
      });
      lastRendered = ''; render();
    }
    function render(){
      const date = dates[day], shown = [];
      slider.el.setAttribute('aria-valuetext', data.fmtDate(date));
      for (const v of visuals){
        const matches = (!species || v.data.species === species) && (!category || v.data.categories.includes(category));
        const active = visibleRecords(v.data, date, category); v.group.visible = matches && active.length > 0;
        if (v.group.visible) shown.push({ ...v.data, active });
        v.stars.forEach(s => { s.star.visible = s.record.date <= date && (!category || s.record.category === category); if (s.halo) s.halo.visible = s.star.visible; });
        const points = v.points.filter((p, i) => v.stars[i].star.visible);
        v.line.geometry.dispose(); v.line.geometry = new THREE.BufferGeometry().setFromPoints(points);
        if (points.length){ v.label.position.copy(points[0]); v.label.position.y -= 1.15; }
      }
      const count = shown.reduce((n, g) => n + g.active.length, 0);
      ui.readout(`<strong>${data.esc(data.fmtDate(date))}</strong>${shown.length} constellations · ${count} logged sightings${year === +today.slice(0, 4) ? '<br><span class="k">Year so far</span>' : ''}`);
      summary.textContent = `${count} sightings across ${shown.length} species through ${data.fmtDate(date)}.${photoResult.failed ? ' Photos are temporarily unavailable.' : ''}${reducedMotion ? ' Playback uses discrete dates; star pulses are disabled.' : ''}`;
      if (!shown.some(g => g.species === selected)) selected = shown[0]?.species || '';
      list.innerHTML = shown.map(g => `<button type="button" class="y3-btn ghost" aria-pressed="${g.species === selected}" data-species="${data.esc(g.species)}">${data.esc(g.species)} <span>${g.active.length}</span></button>`).join('');
      list.querySelectorAll('button').forEach(b => b.addEventListener('click', () => openGroup(b.dataset.species, true)));
      const g = shown.find(g => g.species === selected), key = JSON.stringify([selected, date, category, year]);
      if (key === lastRendered) return; lastRendered = key;
      if (!g){ detail.innerHTML = '<p>No sightings match this date and these filters. Advance the date or choose another filter.</p>'; return; }
      detail.innerHTML = `<h4 tabindex="-1">${data.esc(g.species)}</h4><p>First recorded in ${year}: <strong>${data.esc(data.fmtDate(g.first))}</strong>. This is a logging milestone, not an arrival date.</p><ol>${g.active.map(r => `<li><time datetime="${r.date}">${data.esc(data.fmtDate(r.date))}</time>${r.date === g.first ? ' <span class="y3-sky-first">First recorded date</span>' : ''}<p>${data.esc(r.category)}${r.location ? ' · ' + data.esc(r.location) : ''}</p>${r.notes ? `<p class="y3-sky-note">${data.esc(r.notes)}</p>` : ''}<a href="/wildlife/?sighting=${encodeURIComponent(r.id)}">Open source record →</a><div class="y3-sky-photos">${(photos.get(r.id) || []).map(p => `<a href="${data.esc(data.imageURL(p.key))}" target="_blank" rel="noopener"><img loading="lazy" src="${data.esc(data.imageURL(p.key))}" alt="${data.esc(p.caption || r.species + (p.date ? ' — photo dated ' + p.date : ''))}"></a>`).join('')}</div></li>`).join('')}</ol>`;
    }
    rebuild();
    return {
      resize(w, h){
        const nextPortrait = w / h < 1.2;
        if (nextPortrait === portrait) return;
        portrait = nextPortrait; camera.position.set(0, 17, portrait ? 68 : 30); controls.target.set(0, 12, -8);
        ctx.stage.rememberHome();
      },
      update(t, dt){
        if (playing){ clock += dt; const interval = reducedMotion ? 1 : 60 / dates.length; if (clock >= interval){ clock %= interval; day = Math.min(day + 1, dates.length - 1); slider.set(day); render(); if (day === dates.length - 1) stop(); } }
        if (!reducedMotion) for (const v of visuals) if (v.group.visible) for (const s of v.stars) if (s.halo){ const burst = s.record.date === dates[day]; s.halo.scale.setScalar(burst ? 1.8 + Math.sin(t * 3) * .35 : 1.3); }
      },
      dispose(){ playing = false; panel.remove(); ringTexture.dispose(); },
    };
  },
};
