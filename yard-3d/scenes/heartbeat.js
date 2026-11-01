import { Timeline, yearDates } from '../timeline.js?v=1';
import { datedRows, recordYears, dateIndex, seasonalWindows, weatherMap, daySnapshot, permittedPhotos, stablePosition } from './heartbeat-model.js?v=1';

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Gathering the yard’s year…');
    const safe = promise => promise.then(rows => ({ rows, failed: false }), () => ({ rows: [], failed: true }));
    const [plants, overviews, logs, wildlife, photos] = await Promise.all([safe(data.plants()), safe(data.overview()), safe(data.log()), safe(data.sightings()), safe(data.plantPhotos())]);
    if (!ctx.alive()) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: data.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const esc = data.esc, byId = new Map(plants.rows.map(plant => [plant.id, plant]));
    const name = id => byId.get(id)?.name || (!id || id === 'yard' ? 'Yard-wide' : 'Plant ' + id);
    const logIndex = dateIndex(logs.rows, today), wildlifeIndex = dateIndex(wildlife.rows, today);
    let photoIndex = dateIndex(permittedPhotos(photos.rows, plants.rows, data.isAuthed(), !plants.failed), today);
    let years = recordYears([logs.rows, wildlife.rows, permittedPhotos(photos.rows, plants.rows, data.isAuthed(), !plants.failed)], today);
    let year = years[0], dates = yearDates(year, today), timeline = new Timeline(dates.length), weather = new Map(), weatherFailed = false;
    let request = 0, day = null, season = [], lastMonth = '', effectTime = 0, disposed = false;
    const panel = document.createElement('section'); panel.className = 'y3-heartbeat'; panel.setAttribute('aria-label', 'Heartbeat day records'); document.querySelector('#legend').after(panel);
    panel.innerHTML = '<div class="y3-heartbeat-heading"><h3>The records behind this moment</h3><p class="y3-heartbeat-status" role="status"></p></div><p class="y3-heartbeat-playing" hidden>Pause to open this day’s original records and photos.</p><div class="y3-heartbeat-detail"></div>';
    panel.addEventListener('error', event => { const image = event.target; if (image.tagName !== 'IMG') return; const original = image.dataset.original; if (original) { delete image.dataset.original; image.src = original; } else image.hidden = true; }, true);
    const status = panel.querySelector('[role=status]'), detail = panel.querySelector('.y3-heartbeat-detail'), playingHint = panel.querySelector('.y3-heartbeat-playing');
    ctx.about('<p>One calendar year plays in about <strong>60 seconds at 1×</strong>. The current year ends at today and is labeled year so far. Scrub or pause to open the current day’s records. Playback starts paused and pauses when this scene leaves the viewport or the page is hidden.</p><p>Falling particles represent <strong>modeled ERA5 precipitation</strong>, including rain and snow water equivalent, not an observed rain type or gauge. Ripples represent <strong>logged watering</strong>, with no inferred water volume. Colors are <strong>expected monthly windows from the current AI plant overviews</strong>, not dated observations of bloom or foliage. Wildlife and photo markers appear only on their recorded dates. Empty records do not prove no activity occurred. Effects are illustrative; pausing lists every record.</p><p>The garden is a schematic arrangement of the current plant catalog, not a reconstruction, a location map, or evidence of historical plant size. Missing weather stays unavailable. Use the sources below for the recorded observations and modeled context.</p>');
    ctx.hint('Play the year · scrub to a date · pause to inspect records below');
    const yearSelect = ui.select({ label: 'Year', value: year, options: years.map(value => ({ value, label: String(value) + (value === Number(today.slice(0, 4)) ? ' · year so far' : '') })), onChange(value){ pause(); year = Number(value); loadYear(); } }); yearSelect.setAttribute('aria-label', 'Heartbeat year');
    const play = ui.button({ label: 'Play year', onClick(){ if (timeline.playing) pause(); else start(); } });
    ui.button({ label: 'Restart year', onClick(){ timeline.seek(0); start(); } });
    const slider = ui.range({ label: 'Date', min: 0, max: dates.length - 1, value: 0, wide: true, format: index => dates[index] || '', onInput(index){ timeline.pause(); timeline.seek(index); renderDay(); } }); slider.el.setAttribute('aria-label', 'Heartbeat date');
    slider.el.parentElement.querySelector('output').setAttribute('aria-live', 'off');
    const jumpLabel = document.createElement('label'); jumpLabel.className = 'y3-field'; jumpLabel.textContent = 'Jump to date';
    const jump = document.createElement('input'); jump.type = 'date'; jump.setAttribute('aria-label', 'Jump to heartbeat date'); jump.style.cssText = 'width:auto;max-width:100%;min-height:44px'; jumpLabel.append(jump); document.querySelector('#controls').append(jumpLabel);
    jump.addEventListener('change', () => { const index = dates.indexOf(jump.value); if (index < 0) { if (day) jump.value = day.date; return; } timeline.pause(); timeline.seek(index); renderDay(); });
    ui.select({ label: 'Speed', value: '1', options: [.25, .5, 1, 2, 4].map(value => ({ value, label: value + '×' })), onChange(value){ timeline.setSpeed(Number(value)); } }).setAttribute('aria-label', 'Heartbeat playback speed');
    ui.button({ label: 'Previous day', onClick(){ timeline.pause(); timeline.seek(timeline.index - 1); renderDay(); } });
    ui.button({ label: 'Next day', onClick(){ timeline.pause(); timeline.seek(timeline.index + 1); renderDay(); } });
    ui.button({ label: 'Retry weather', onClick(){ pause(); data.forget(); loadYear(true); } });
    ui.legend([{ color: '#83c5ed', label: 'Modeled precipitation', shape: 'line' }, { color: '#73d4ae', label: 'Logged watering ripple', shape: 'ring' }, { color: '#d5a4e8', label: 'Dated photo records' }, { color: '#f6d18b', label: 'Recorded wildlife' }, { color: colors.muted, label: 'Neutral plants: no expected color window' }]);
    // Two instanced draws keep the plant catalog inexpensive on small screens.
    scene.add(new THREE.HemisphereLight('#f4f8ff', '#23392e', 1.6));
    const sun = new THREE.DirectionalLight('#fff0d7', 2); sun.position.set(-10, 24, 10); scene.add(sun);
    ctx.stage.bloomPass.strength = .12;
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(17, 18, .9, 64), new THREE.MeshStandardMaterial({ color: colors.panel, roughness: .95 })); ground.position.y = -.6; ground.scale.z = .75; scene.add(ground);
    const count = plants.rows.length;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .14, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#7f6350' }), count);
    const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff', roughness: .85 }), count);
    const matrix = new THREE.Object3D(), positions = new Map();
    plants.rows.forEach((plant, i) => {
      const [x, z] = stablePosition(plant.id); positions.set(plant.id, [x, z]);
      const height = plant.category === 'Tree' ? 1.7 : plant.category === 'Shrub' ? 1 : .6;
      matrix.position.set(x, .6, z); matrix.scale.setScalar(1); matrix.updateMatrix(); trunks.setMatrixAt(i, matrix.matrix);
      matrix.position.y = 1.1 + height / 2; matrix.scale.set(1, height, 1); matrix.updateMatrix(); crowns.setMatrixAt(i, matrix.matrix); crowns.setColorAt(i, new THREE.Color(colors.muted));
    });
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true; if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true; scene.add(trunks, crowns);
    ctx.pick(crowns, { tip(hit){ const plant = plants.rows[hit.instanceId]; if (!plant) return null; const expected = season.filter(entry => entry.plantId === plant.id); return `<span class="t-head">${esc(plant.name)}</span>${expected.length ? 'Expected monthly colors: ' + expected.map(entry => esc(entry.t || entry.k || 'seasonal color')).join(', ') : 'No expected color window for this month.'}<span class="t-sub">Schematic marker; not an observed plant size or location. Pause for source records.</span>`; }, click(){ pause(); } });
    const mobile = matchMedia('(max-width:700px), (pointer:coarse)').matches, rainBudget = mobile ? 256 : 640;
    const dropPositions = new Float32Array(rainBudget * 3), rainSeed = [];
    for (let i = 0; i < rainBudget; i++){ const a = i * 2.399963, radius = Math.sqrt((i + .5) / rainBudget) * 16; rainSeed.push([Math.sin(a) * radius, (i * .618034) % 1, Math.cos(a) * radius * .75]); }
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
    const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: '#83c5ed', size: .11, transparent: true, opacity: .8 })); scene.add(rain);
    const ripples = Array.from({ length: 32 }, () => { const mesh = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#73d4ae', transparent: true, opacity: .8, depthWrite: false })); mesh.rotation.x = -Math.PI / 2; mesh.visible = false; scene.add(mesh); return mesh; });
    // Neutral wildlife tokens avoid implying a species that was not recorded.
    const animals = Array.from({ length: 8 }, () => { const sprite = ctx.glyph('🐾', 1.3); sprite.visible = false; scene.add(sprite); return sprite; });
    const photoMarker = ctx.glyph('📷', 1.5); photoMarker.position.set(0, 4.8, 0); photoMarker.visible = false; scene.add(photoMarker);
    const title = ctx.text('THE YARD’S HEARTBEAT', { size: .65, color: colors.ink }); title.position.set(0, .2, 14); scene.add(title);
    const frame = () => { camera.position.set(-12, 22, camera.aspect < 1 ? 53 : 34); controls.target.set(0, 2, 0); };
    frame(); controls.minDistance = 12; controls.maxDistance = 90;
    let yearLoading = false;
    function pause(){ timeline.pause(); if (day) renderDay(); }
    function start(){ if (yearLoading) return; timeline.play(); renderDay(); }
    function updateButton(){ play.textContent = timeline.playing ? 'Pause' : timeline.index > 0 && timeline.index < dates.length - 1 ? 'Resume' : 'Play year'; play.setAttribute('aria-pressed', String(timeline.playing)); }
    async function loadYear(keepDate = false){
      const token = ++request, selectedYear = year, oldIndex = timeline.index, speed = timeline.speed;
      timeline.pause(); yearLoading = true; updateButton(); play.disabled = slider.el.disabled = true;
      detail.replaceChildren(); status.textContent = 'Loading selected year…'; ctx.status('Loading the yard’s ' + year + ' records…');
      dates = yearDates(year, today); timeline = new Timeline(dates.length, { speed }); slider.el.max = dates.length - 1; jump.min = dates[0]; jump.max = dates.at(-1); jump.disabled = true;
      try {
        const rows = year >= 2020 ? await data.weatherYear(year, { preserveMissing: true }) : [];
        if (!ctx.alive() || token !== request) return;
        weather = weatherMap(rows); weatherFailed = false;
      } catch (_){ if (!ctx.alive() || token !== request) return; weather = new Map(); weatherFailed = true; }
      if (!ctx.alive() || token !== request || selectedYear !== year) return;
      if (keepDate) timeline.seek(oldIndex);
      lastMonth = ''; yearLoading = false; play.disabled = slider.el.disabled = jump.disabled = false; renderDay(); ctx.status(null);
    }
    function sourceWarnings(){
      return [[plants, 'Plant inventory'], [overviews, 'Expected seasonal colors'], [logs, 'Care logs'], [wildlife, 'Wildlife records'], [photos, 'Photo records']].filter(([result]) => result.failed).map(([, label]) => label + ' unavailable').concat(weatherFailed ? ['Weather archive unavailable; use Retry weather'] : []);
    }
    function format(value, suffix, digits = 1){ return value == null ? 'unavailable' : value.toFixed(digits) + suffix; }
    const priority = { bloom: 0, fruit: 1, foliage: 2, evergreen: 3, cone: 4, bark: 5, bare: 6 };
    function renderDay(){
      if (yearLoading || disposed) return;
      day = daySnapshot(dates[timeline.index], weather, logIndex, wildlifeIndex, photoIndex); effectTime = 0;
      slider.set(timeline.index); slider.el.setAttribute('aria-valuetext', day.date); jump.value = day.date; updateButton();
      const month = day.date.slice(5, 7);
      if (month !== lastMonth){
        lastMonth = month; season = seasonalWindows(overviews.rows, Number(month)).filter(entry => byId.has(entry.plantId));
        plants.rows.forEach((plant, i) => { const entry = season.filter(row => row.plantId === plant.id).sort((a, b) => (priority[a.k] ?? 9) - (priority[b.k] ?? 9))[0]; crowns.setColorAt(i, new THREE.Color(entry?.c || colors.muted)); }); if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      }
      const wetPlants = [...new Set(day.watering.map(row => row.plantId || 'yard'))];
      ripples.forEach((mesh, i) => { mesh.visible = i < wetPlants.length; const [x, z] = positions.get(wetPlants[i]) || [0, 0]; mesh.position.set(x, .02, z); mesh.scale.setScalar(1); mesh.material.opacity = .7; });
      const species = [...new Set(day.wildlife.map(row => row.species))];
      animals.forEach((sprite, i) => { sprite.visible = i < species.length; const [x, z] = stablePosition(species[i] || i); sprite.position.set(x, 4 + i % 3, z); });
      photoMarker.visible = day.photos.length > 0;
      const count = day.weather.pcp == null || day.weather.pcp === 0 ? 0 : Math.min(rainBudget, Math.max(12, Math.round(day.weather.pcp * 200)));
      rainGeo.setDrawRange(0, count); rain.visible = count > 0;
      for (let i = 0; i < rainBudget; i++){ const [x, phase, z] = rainSeed[i]; dropPositions[i * 3] = x; dropPositions[i * 3 + 1] = 2 + phase * 10; dropPositions[i * 3 + 2] = z; } rainGeo.attributes.position.needsUpdate = true;
      const warnings = sourceWarnings(), fullDays = yearDates(year, `${year}-12-31`).length;
      const temperatureDays = dates.filter(date => weather.get(date)?.hi != null && weather.get(date)?.lo != null).length, rainDays = dates.filter(date => weather.get(date)?.pcp != null).length;
      ui.readout(`<strong>${esc(data.fmtDate(day.date))}</strong>${year === Number(today.slice(0, 4)) ? `Year so far · ${dates.length}/${fullDays} calendar days<br>` : ''}Modeled: ${format(day.weather.lo, '°F')}–${format(day.weather.hi, '°F')} · precipitation ${format(day.weather.pcp, ' in', 3)}<br>${logs.failed ? 'Care logs unavailable' : `${day.watering.length} watering records`} · ${wildlife.failed ? 'Wildlife unavailable' : `${day.wildlife.length} sightings`} · ${photos.failed ? 'Photo records unavailable' : `${day.photos.length} permitted photos${plants.failed ? ' (plant photos withheld)' : ''}`}<br><span class="k">Colors are expected, not observed. ${timeline.playing ? 'Playing' : 'Paused'}${reducedMotion ? ' · static effects' : ''}</span>`);
      playingHint.hidden = !timeline.playing; detail.hidden = timeline.playing;
      if (timeline.playing){ detail.replaceChildren(); const message = `Playing ${year}${year === Number(today.slice(0, 4)) ? ' so far' : ''}. Pause to inspect the selected date.`; if (status.textContent !== message) status.textContent = message; }
      else {
        status.textContent = `${dates[0]} – ${dates.at(-1)}. Modeled temperature coverage ${temperatureDays}/${dates.length} days; precipitation ${rainDays}/${dates.length} days.${warnings.length ? ' ' + warnings.join('. ') + '.' : ''}${reducedMotion ? ' Reduced motion: precipitation and ripples stay static.' : ''}`;
        renderRecords();
      }
    }
    function renderRecords(){
      const allowedPhotos = day.photos.filter(photo => photo.plantId !== 'yard' || data.isAuthed());
      const grouped = new Map(); for (const entry of season){ if (!grouped.has(entry.plantId)) grouped.set(entry.plantId, []); grouped.get(entry.plantId).push(entry); }
      detail.innerHTML = `<h4 tabindex="-1">${esc(data.fmtDate(day.date))} · paused records</h4><h5>Modeled weather · ERA5, Lilly, PA</h5><p>Low ${format(day.weather.lo, '°F')} · high ${format(day.weather.hi, '°F')} · precipitation ${format(day.weather.pcp, ' in', 3)}. Missing values stay unavailable.</p><a href="/plants/#weather">Open weather dashboard →</a><h5>Logged watering and care</h5>${logs.failed ? '<p>Care source unavailable; activity cannot be assessed.</p>' : day.logs.length ? `<ul tabindex="0" aria-label="Daily care records">${day.logs.map(row => `<li><strong>${esc(row.action)}</strong> · ${esc(name(row.plantId))}${row.time ? ' · ' + esc(row.time) : ''}${row.value != null ? `<p>Recorded value: ${esc(row.value)}; see the source for definition and units.</p>` : ''}${row.temp != null ? `<p>Logged temperature: ${esc(row.temp)}°F</p>` : ''}${row.note ? `<p class="y3-heartbeat-note">${esc(row.note)}</p>` : ''}${row.sourceURL ? `<a href="${esc(row.sourceURL)}" target="_blank" rel="noopener">Original journal record →</a>` : ''}</li>`).join('')}</ul>` : '<p>No care logs recorded for this date; this does not prove no care occurred.</p>'}<p><a href="/plants/">Open Plants journal →</a></p><h5>Recorded wildlife</h5>${wildlife.failed ? '<p>Wildlife source unavailable.</p>' : day.wildlife.length ? `<ul tabindex="0" aria-label="Daily wildlife sightings">${day.wildlife.map(row => `<li><strong>${esc(row.species)}</strong>${row.location ? ' · ' + esc(row.location) : ''}${row.notes ? `<p class="y3-heartbeat-note">${esc(row.notes)}</p>` : ''}${row.id ? `<a href="/wildlife/?sighting=${encodeURIComponent(row.id)}">Open sighting →</a>` : ''}</li>`).join('')}</ul>` : '<p>No sightings recorded for this date; this does not establish wildlife absence.</p>'}<a href="/wildlife/">Open wildlife dashboard →</a><h5>Dated photo records</h5>${photos.failed ? '<p>Photo records unavailable; coverage cannot be assessed.</p>' : allowedPhotos.length ? `<div class="y3-heartbeat-photos">${allowedPhotos.map(photo => `<a href="${esc(data.imageURL(photo.key))}" target="_blank" rel="noopener">${/\.(mp4|webm|mov|m4v)$/i.test(photo.key) ? 'Open video' : `<img loading="lazy" src="${esc(data.thumbURL(photo.key))}" data-original="${esc(data.imageURL(photo.key))}" alt="${esc(photo.caption || name(photo.plantId) + ' · ' + day.date)}">`}<span>${esc(name(photo.plantId))} · ${esc(day.date)}${photo.caption ? ' · ' + esc(photo.caption) : ''}</span></a>`).join('')}</div>` : '<p>No permitted photos recorded for this date. This is a gap in the photo record.</p>'}<p><a href="/plants/">Open plant photo dashboard →</a></p><details><summary>Expected seasonal colors · ${grouped.size} plant calendars this month</summary><p>Current AI overview windows, not observations of this day or year. Neutral markers have no expected window. Markers are schematic, not measured plant size, location or historical presence.</p>${overviews.failed ? '<p>Seasonal overview source unavailable.</p>' : grouped.size ? `<ul tabindex="0" aria-label="Expected monthly color windows">${[...grouped].map(([id, entries]) => `<li><strong>${esc(name(id))}</strong> · ${entries.map(entry => `<span class="y3-heartbeat-swatch" style="background:${entry.c}"></span>${esc(entry.t || entry.k || 'seasonal color')}`).join(' · ')}</li>`).join('')}</ul>` : '<p>No expected color windows are recorded for this month.</p>'}<a href="/plants/#year">Open Seasons →</a></details>`;
    }
    function updateEffects(dt){
      if (!day || reducedMotion || !timeline.playing) return;
      effectTime += dt;
      if (rain.visible){ for (let i = 0; i < rainBudget; i++) dropPositions[i * 3 + 1] = 2 + ((rainSeed[i][1] + 1 - effectTime * .8 % 1) % 1) * 10; rainGeo.attributes.position.needsUpdate = true; }
      ripples.forEach((mesh, i) => { if (!mesh.visible) return; const phase = (effectTime * 1.5 + i * .17) % 1; mesh.scale.setScalar(.4 + phase * 2); mesh.material.opacity = .8 * (1 - phase); });
    }
    function onVisibility(){ if (document.hidden) pause(); }
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new IntersectionObserver(entries => { if (!entries[0].isIntersecting && timeline.playing) pause(); }); observer.observe(ctx.stage.host);
    let photoAuth = data.isAuthed(), photoRequest = 0;
    function refreshPhotos(){
      const allowed = permittedPhotos(photos.rows, plants.rows, photoAuth, !plants.failed);
      photoIndex = dateIndex(allowed, today); years = recordYears([logs.rows, wildlife.rows, allowed], today);
      yearSelect.innerHTML = years.map(value => `<option value="${value}">${value}${value === Number(today.slice(0, 4)) ? ' · year so far' : ''}</option>`).join('');
      if (!years.includes(year)){ timeline.pause(); year = years[0]; yearSelect.value = year; loadYear(); }
      else { yearSelect.value = year; if (day) renderDay(); }
    }
    function checkAuth(){
      const authed = data.isAuthed(); if (authed === photoAuth) return;
      photoAuth = authed; const token = ++photoRequest;
      refreshPhotos();
      safe(data.plantPhotos()).then(result => { if (!ctx.alive() || token !== photoRequest || authed !== data.isAuthed()) return; Object.assign(photos, result); refreshPhotos(); });
    }
    await loadYear();
    return {
      update(_time, dt){ checkAuth(); if (yearLoading) return; const wasPlaying = timeline.playing; const changed = timeline.advance(dt); if (changed || wasPlaying !== timeline.playing) renderDay(); updateEffects(dt); },
      resize(){ frame(); ctx.stage.rememberHome(); },
      dispose(){ disposed = true; request++; photoRequest++; timeline.pause(); observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); panel.remove(); },
    };
  },
};
