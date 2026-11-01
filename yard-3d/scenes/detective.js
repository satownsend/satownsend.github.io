import { tempColor, disposeTree } from '../core.js';
import { eventsFromLog, windowDates, alignDays, coverage } from './detective-model.js?v=1';

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors } = ctx;
    ctx.status('Reading dated plant events…');
    const [logs, plants, photoResult] = await Promise.all([
      data.log(), data.plantsById().catch(() => new Map()),
      data.plantPhotos().then(rows => ({ rows, failed: false }), () => ({ rows: [], failed: true })),
    ]);
    if (!ctx.alive()) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: data.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const events = eventsFromLog(logs, today), esc = data.esc;
    const name = id => plants.get(id)?.name || (!id || id === 'yard' ? 'Yard-wide' : 'Plant ' + id);
    const panel = document.createElement('section'); panel.className = 'y3-detective'; panel.setAttribute('aria-label', 'Weather detective records');
    document.querySelector('#legend').after(panel);
    ctx.about('<p>Choose a recorded event, then unfold the days around it. Temperature and precipitation are <strong>modeled ERA5 estimates for Lilly, PA</strong>, in °F and inches, using America/New_York dates. Rainfall here means total precipitation, including snow water equivalent. Green markers are logged watering, not measured rainfall or inferred water amounts.</p><p>Weather is context, <strong>not proof of why a plant bloomed, grew or was damaged</strong>. An air-temperature threshold is not an observation of frost. Missing weather stays unavailable; no matching journal or photo record does not establish that no care or change occurred.</p>');
    ctx.hint('Drag to orbit · tap a date column · or use Inspect day and the source records below');
    if (!events.length){
      ui.readout('<strong>No dated plant events yet</strong>Add a journal observation or measurement on Plants.');
      panel.innerHTML = '<h3>Weather detective</h3><p>No valid, nonfuture journal events are available. <a href="/plants/">Open Plants journal →</a></p>';
      return { dispose(){ panel.remove(); } };
    }
    let event = events.find(row => /frost damage|bloom|measure|height|trunk|girth/.test(row.action)) || events[0];
    let plant = event.plantId, before = 28, after = 7, days = [], index = 0, serial = 0, world = null, picks = [], failedYears = [];
    panel.innerHTML = '<h3>Investigate the record</h3><p class="y3-detective-status" role="status"></p><div class="y3-detective-event"></div><div class="y3-detective-day"></div>';
    const status = panel.querySelector('[role=status]'), eventEl = panel.querySelector('.y3-detective-event'), detail = panel.querySelector('.y3-detective-day');
    const eventLabel = row => `${row.date} · ${name(row.plantId)} · ${row.action}${row.value != null ? ' · ' + row.value : ''}${row.note ? ' · ' + row.note.slice(0, 65) : ''}`;
    const selected = () => events.filter(row => plant === '*' || row.plantId === plant);
    const plantsAvailable = [...new Set(events.map(row => row.plantId))].sort((a, b) => name(a).localeCompare(name(b)));
    const plantSelect = ui.select({ label: 'Plant', value: plant, options: [{ value: '*', label: 'All plants' }, ...plantsAvailable.map(id => ({ value: id, label: name(id) }))], onChange(value){ plant = value; const matches = selected(); event = matches[0]; refreshEvents(); loadWindow(); } });
    plantSelect.setAttribute('aria-label', 'Investigate plant');
    const eventSelect = ui.select({ label: 'Recorded event', value: event.key, options: selected().map(row => ({ value: row.key, label: eventLabel(row) })), onChange(value){ event = events.find(row => row.key === value); loadWindow(); } });
    eventSelect.setAttribute('aria-label', 'Recorded plant event');
    function refreshEvents(){ eventSelect.innerHTML = selected().map(row => `<option value="${esc(row.key)}">${esc(eventLabel(row))}</option>`).join(''); eventSelect.value = event.key; }
    ui.range({ label: 'Days before', min: 1, max: 84, value: before, format: value => value + ' days', onInput(value){ before = value; schedule(); } });
    ui.range({ label: 'Days after', min: 0, max: 28, value: after, format: value => value + ' days', onInput(value){ after = value; schedule(); } });
    const inspect = ui.range({ label: 'Inspect day', min: 0, max: 0, value: 0, wide: true, format: value => days[value]?.date || 'Loading…', onInput(value){ index = value; renderDay(); } });
    inspect.el.setAttribute('aria-label', 'Inspect investigation date');
    ui.button({ label: 'Previous day', onClick(){ index = Math.max(0, index - 1); inspect.set(index); renderDay(); } });
    ui.button({ label: 'Next day', onClick(){ index = Math.min(days.length - 1, index + 1); inspect.set(index); renderDay(); } });
    ui.button({ label: 'Return to event', onClick(){ index = days.findIndex(day => day.event); inspect.set(index); renderDay(); } });
    ui.button({ label: 'Retry weather', onClick(){ data.forget(); loadWindow(); } });
    ui.legend([{ color: '#f3b955', label: 'Selected logged event', shape: 'line' }, { color: '#78b9eb', label: 'Modeled precipitation', shape: 'bar' }, { color: '#82ca9a', label: 'Logged watering / care' }, { color: '#d2a5e9', label: 'Permitted photo records' }, { color: '#8c9aa3', label: '× unavailable weather', shape: 'line' }]);
    ui.gradient({ min: -10, max: 100, label: 'Modeled temperature', ticks: [0, 32, 70, 100] });
    scene.add(new THREE.HemisphereLight('#eff8ff', colors.panel, 1.6));
    const sun = new THREE.DirectionalLight('#fff4df', 2); sun.position.set(-10, 22, 14); scene.add(sun);
    ctx.stage.bloomPass.strength = .12;
    function frame(){ camera.position.set(-16, 26, camera.aspect < 1 ? 68 : 34); controls.target.set(0, 3, 1); }
    frame(); controls.minDistance = 10; controls.maxDistance = 120;
    let timer;
    let photoSerial = 0, photoAuth = data.isAuthed();
    ctx.onFrame(() => {
      const authed = data.isAuthed(); if (authed === photoAuth) return;
      photoAuth = authed;
      const token = ++photoSerial;
      // Remove previously permitted yard media immediately when sign-in ends.
      if (!authed){ photoResult.rows = photoResult.rows.filter(photo => photo.plantId !== 'yard'); loadWindow(); }
      data.plantPhotos().then(rows => ({ rows, failed: false }), () => ({ rows: [], failed: true })).then(result => {
        if (!ctx.alive() || token !== photoSerial || authed !== data.isAuthed()) return;
        Object.assign(photoResult, result); loadWindow();
      });
    });
    function schedule(){ clearTimeout(timer); serial++; timer = setTimeout(loadWindow, 180); }
    async function loadWindow(){
      clearTimeout(timer);
      const request = ++serial, chosen = event;
      const dates = windowDates(chosen, before, after, today);
      const years = [...new Set(dates.filter(date => date >= data.ARCHIVE_START && date <= today).map(date => Number(date.slice(0, 4))))];
      ctx.status('Loading the weather around this event…'); status.textContent = 'Loading the selected window…';
      inspect.el.disabled = true; detail.replaceChildren();
      try {
        const result = await Promise.allSettled(years.map(year => data.weatherYear(year, { preserveMissing: true })));
        if (!ctx.alive() || request !== serial) return;
        failedYears = years.filter((_, i) => result[i].status === 'rejected');
        const weather = result.flatMap(row => row.status === 'fulfilled' ? row.value : []);
        const allowedPhotos = photoResult.rows.filter(photo => photo.plantId !== 'yard' || data.isAuthed());
        days = alignDays(dates, weather, logs, allowedPhotos, chosen);
        index = days.findIndex(day => day.event);
        inspect.el.max = days.length - 1; inspect.set(index); inspect.el.disabled = false;
        buildLandscape(); renderDay(); ctx.status(null);
      } catch (error){ if (ctx.alive() && request === serial) { ctx.status(null); status.textContent = 'Could not build this window: ' + error.message + '. Choose another event or retry weather.'; } }
    }
    function logHTML(row){
      return `<li><strong>${esc(row.action)}</strong> · ${esc(name(row.plantId))}${row.plantId !== chosenPlant() ? ' · yard context' : ''}${row.time ? ' · ' + esc(row.time) : ''}${row.temp != null ? `<p>Logged observation: ${esc(row.temp)}°F</p>` : ''}${row.value != null ? `<p>Recorded value: ${esc(row.value)} (see the source for its measurement definition and units)</p>` : ''}${row.note ? `<p class="y3-detective-note">${esc(row.note)}</p>` : ''}${row.causedBy ? `<p>Attribution entered in source: ${esc(row.causedBy)}. This is the author's record, not a finding of this view.</p>` : ''}<span class="y3-detective-source">Record ID: ${esc(row.id || 'not supplied')}</span>${row.sourceURL ? `<a target="_blank" rel="noopener" href="${esc(row.sourceURL)}">Open original journal record →</a>` : '<a href="/plants/">Open Plants journal →</a>'}</li>`;
    }
    const chosenPlant = () => event.plantId;
    const number = (value, suffix, digits = 1) => value == null ? 'unavailable' : value.toFixed(digits) + suffix;
    function renderDay(focus = false){
      const day = days[index]; if (!day) return;
      inspect.el.setAttribute('aria-valuetext', day.date);
      const c = coverage(days);
      status.textContent = `${datesLabel()} · ${days.length} calendar days. Modeled temperatures: ${c.temperature}/${c.days} days; precipitation: ${c.precipitation}/${c.days} days.${failedYears.length ? ' Weather archive unavailable for ' + failedYears.join(', ') + '; use Retry weather.' : ''}${photoResult.failed ? ' Photo records could not be loaded; their absence cannot be assessed.' : ''}`;
      ui.readout(`<strong>${esc(name(event.plantId))}</strong>${esc(event.action)} · ${esc(event.date)}<br><span class="k">Inspecting ${esc(day.date)}</span><br>Weather is modeled context; care and event markers are recorded observations.`);
      eventEl.innerHTML = `<h4>Selected event · ${esc(event.date)}</h4><ul>${logHTML(event)}</ul><p class="y3-detective-caution">Nearby weather is context, not proof of the event’s cause.</p>`;
      const photos = day.photos.filter(photo => photo.plantId !== 'yard' || data.isAuthed());
      detail.innerHTML = `<h4 tabindex="-1">${esc(data.fmtDate(day.date))}${day.event ? ' · event date' : ''}</h4><div class="y3-detective-weather"><h5>Modeled ERA5 estimates</h5><p>Daily low: <strong>${number(day.lo, '°F')}</strong> · high: <strong>${number(day.hi, '°F')}</strong><br>Precipitation (rain + snow water equivalent): <strong>${number(day.pcp, ' in', 3)}</strong></p><a target="_blank" rel="noopener" href="https://satownsend-chatbot.satownsend.workers.dev/weather-archive?year=${day.date.slice(0, 4)}">Open source weather archive for ${day.date.slice(0, 4)} →</a></div><h5>Recorded care and notes</h5>${day.logs.length ? `<ul>${day.logs.map(logHTML).join('')}</ul>` : '<p>No matching care logs recorded for this date. This does not establish that no care occurred.</p>'}<h5>Dated photo records</h5>${photoResult.failed ? '<p>Photo records unavailable. Retry the scene to reload them.</p>' : photos.length ? `<div class="y3-detective-photos">${photos.map(photo => `<a target="_blank" rel="noopener" href="${esc(data.imageURL(photo.key))}">${/\.(mp4|webm|mov|m4v)$/i.test(photo.key) ? 'Open recorded video' : `<img loading="lazy" src="${esc(data.imageURL(photo.key))}" alt="${esc(photo.caption || name(photo.plantId) + ' · ' + photo.date)}">`}<span>${esc(name(photo.plantId))} · ${esc(photo.date)}${photo.caption ? ' · ' + esc(photo.caption) : ''}</span></a>`).join('')}</div>` : '<p>No permitted photo record for this date. This is a gap in the record, not evidence that nothing changed.</p>'}`;
      if (world){ const cursor = world.getObjectByName('inspected-date'); cursor.position.x = x(index); }
      if (focus) detail.querySelector('h4').focus({ preventScroll: true });
    }
    const datesLabel = () => days[0].date + ' – ' + days.at(-1).date;
    const x = i => -22 + i / Math.max(1, days.length - 1) * 44;
    function buildLandscape(){
      if (world){ picks.forEach(object => ctx.unpick(object)); scene.remove(world); disposeTree(world); } picks = [];
      world = new THREE.Group(); scene.add(world);
      const temperatures = days.flatMap(day => [day.lo, day.hi]).filter(value => value != null);
      const low = Math.min(0, ...temperatures) - 5, high = Math.max(50, ...temperatures);
      const y = value => 1 + (value - low) / Math.max(20, high - low) * 12;
      const step = 44 / Math.max(1, days.length - 1);
      const base = new THREE.Mesh(new THREE.BoxGeometry(46, .4, 24), new THREE.MeshStandardMaterial({ color: colors.panel, roughness: .9 })); base.position.y = -.25; world.add(base);
      for (const [label, z] of [['Temperature (°F)', -6], ['Precipitation (in)', 0], ['Care logs', 6], ['Photos', 10]]){
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-22, .05, z), new THREE.Vector3(22, .05, z)]), new THREE.LineBasicMaterial({ color: colors.muted, transparent: true, opacity: .35 })); world.add(line);
        const text = ctx.text(label, { size: .55, color: colors.ink, align: 'right' }); text.position.set(-23, .25, z); world.add(text);
      }
      const vertices = [], rgb = [];
      for (let i = 1; i < days.length; i++){
        const a = days[i - 1], b = days[i]; if ([a.lo, a.hi, b.lo, b.hi].some(value => value == null)) continue;
        for (const [j, value] of [[i - 1, a.lo], [i - 1, a.hi], [i, b.hi], [i - 1, a.lo], [i, b.hi], [i, b.lo]]){
          vertices.push(x(j), y(value), -6); const color = tempColor(value); rgb.push(color.r, color.g, color.b);
        }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3)); geo.computeVertexNormals();
      world.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .8 })));
      function marker(i, z, color, count, photo = false){
        const mesh = photo ? ctx.glyph('📷', .9) : new THREE.Mesh(new THREE.SphereGeometry(.22 + Math.min(count, 10) * .025, 10, 8), new THREE.MeshStandardMaterial({ color }));
        mesh.position.set(x(i), .7, z); world.add(mesh);
      }
      function gap(i, z){
        const a = new THREE.Vector3(x(i) - .15, .1, z - .15), b = new THREE.Vector3(x(i) + .15, .1, z + .15);
        const c = new THREE.Vector3(x(i) - .15, .1, z + .15), d = new THREE.Vector3(x(i) + .15, .1, z - .15);
        world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([a, b, c, d]), new THREE.LineBasicMaterial({ color: '#8c9aa3' })));
      }
      const maxRain = Math.max(.25, ...days.map(day => day.pcp ?? 0));
      days.forEach((day, i) => {
        if (day.lo == null || day.hi == null) gap(i, -6);
        if (day.pcp == null) gap(i, 0);
        else { const h = .08 + day.pcp / maxRain * 7; const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(.7, step * .65), h, 1), new THREE.MeshStandardMaterial({ color: '#78b9eb' })); bar.position.set(x(i), h / 2, 0); world.add(bar); }
        if (day.logs.length) marker(i, 6, day.logs.some(row => row.action === 'watered') ? '#82ca9a' : colors.accent2, day.logs.length);
        if (day.photos.length) marker(i, 10, '#d2a5e9', day.photos.length, true);
        if (day.event){ const flag = new THREE.Mesh(new THREE.BoxGeometry(.12, 16, 21), new THREE.MeshBasicMaterial({ color: '#f3b955', transparent: true, opacity: .12, depthWrite: false })); flag.position.set(x(i), 8, 2); world.add(flag); const label = ctx.text('EVENT', { size: .6, color: '#f3b955' }); label.position.set(x(i), 17, -6); world.add(label); }
        const target = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.25, step * .9), 18, 22), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); target.position.set(x(i), 9, 2); world.add(target); picks.push(target);
        ctx.pick(target, { tip: () => `<span class="t-head">${esc(day.date)}${day.event ? ' · selected event' : ''}</span>Modeled: ${number(day.lo, '°F')}–${number(day.hi, '°F')}<br>Precipitation: ${number(day.pcp, ' in', 3)}<br>${day.logs.length} matching log records · ${photoResult.failed ? 'photo catalog unavailable' : day.photos.length + ' permitted photo records'}<span class="t-sub">Select to inspect original records below. No record does not mean no activity.</span>`, click(){ index = i; inspect.set(i); renderDay(true); } });
        if (i % Math.max(1, Math.ceil(days.length / 8)) === 0 || i === days.length - 1){ const label = ctx.text(data.fmtDate(day.date, { month: 'short', day: 'numeric' }), { size: .55, color: colors.muted }); label.position.set(x(i), .2, 13); world.add(label); }
      });
      const cursor = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .15, -9), new THREE.Vector3(0, .15, 12)]), new THREE.LineBasicMaterial({ color: colors.ink })); cursor.name = 'inspected-date'; world.add(cursor);
    }
    await loadWindow();
    return { resize(){ frame(); ctx.stage.rememberHome(); }, dispose(){ serial++; photoSerial++; clearTimeout(timer); panel.remove(); } };
  },
};
