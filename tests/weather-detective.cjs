const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const moduleAt = file => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, file)).toString('base64'));
(async () => {
  const { validDate, shiftDate, eventsFromLog, windowDates, alignDays, coverage } = await moduleAt('../yard-3d/scenes/detective-model.js');
  assert(validDate('2024-02-29')); assert(!validDate('2025-02-29')); assert(!validDate('2026-04-31'));
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  const event = { id: 'e1', date: '2026-01-02', action: 'frost damage', plantId: 'tree', note: '<unsafe>' };
  const logs = [event, { date: '2026-01-01', plantId: 'tree', action: 'watered' }, { date: '2026-01-01', plantId: 'yard', action: 'covered' }, { date: '2026-01-01', plantId: 'other', action: 'watered' }, { date: '2027-01-01', action: 'bloom' }, { date: '2025-02-29', action: 'bloom' }];
  const catalog = eventsFromLog(logs, '2026-01-04');
  assert.equal(catalog.length, 4); assert.equal(catalog[0].id, 'e1');
  const dates = windowDates(event, 3, 7, '2026-01-04');
  assert.deepEqual(dates, ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.throws(() => windowDates(event, 85, 0, '2026-01-04'));
  assert.throws(() => windowDates(event, 3, 0, '2025-12-31'));
  const weather = [{ date: '2026-01-01', hi: 31, lo: 10, pcp: 0 }, { date: '2026-01-02', hi: 32, lo: null, pcp: null }, { date: '2026-01-03', hi: NaN, lo: 0, pcp: .5 }];
  const photos = [{ date: event.date, key: 'plant.jpg', plantId: 'tree' }, { date: event.date, key: 'yard.jpg', plantId: 'yard' }, { date: event.date, key: 'other.jpg', plantId: 'other' }];
  const days = alignDays(dates, weather, logs, photos, event);
  assert.equal(days[0].hi, null); assert.equal(days[0].pcp, null);
  assert.equal(days[2].pcp, 0, 'known dry day differs from a gap');
  assert.equal(days[3].pcp, null); assert(days[3].event); assert.equal(days[3].photos.length, 2);
  assert.equal(days[2].logs.length, 2, 'only selected plant and yard-wide context');
  assert.equal(days[4].hi, null); assert.equal(days[4].lo, 0);
  assert.deepEqual(coverage(days), { temperature: 1, precipitation: 2, days: 6 });
  assert.equal(logs[0].note, '<unsafe>');

  const oldFetch = global.fetch, oldWindow = global.window; let signedIn = false;
  global.window = { GAuth: { isAuthed: () => signedIn } };
  global.fetch = async url => {
    if (String(url).includes('weather-archive')) return { ok: true, json: async () => ({ items: [{ date: '2026-01-01', hi: 0, lo: -5, pcp: null }, { date: '2026-01-02', hi: null, lo: -1, pcp: 0 }] }) };
    if (String(url).includes('sheet=log')) return { ok: true, text: async () => 'date,id,plantId,action,note\n2026-01-01,event-id,tree,bloom,"hello, world"\n' };
    return { ok: true, text: async () => 'key,plant_id,date,hideFromGallery\nplant.jpg,tree,2026-01-01,FALSE\nhidden.jpg,tree,2026-01-01,TRUE\nyard.jpg,yard,2026-01-01,FALSE\n' };
  };
  try {
    const data = await moduleAt('../yard-3d/data.js');
    const strict = await data.weatherYear(2026, { preserveMissing: true });
    assert.equal(strict.length, 2); assert.equal(strict[0].pcp, null); assert.equal(strict[1].pcp, 0); assert.equal(strict[1].hi, null);
    const legacy = await data.weatherYear(2026); assert.equal(legacy.length, 1); assert.equal(legacy[0].pcp, 0);
    const loaded = await data.log(); assert.equal(loaded[0].note, 'hello, world');
    assert.equal(new URL(loaded[0].sourceURL).searchParams.get('tq'), 'select * where B = "event-id"');
    assert.equal(data.logRecordSource('', 0), null);
    assert.deepEqual((await data.plantPhotos()).map(photo => photo.key), ['plant.jpg']);
    signedIn = true; assert.deepEqual((await data.plantPhotos()).map(photo => photo.key), ['plant.jpg', 'yard.jpg']);
  } finally { global.fetch = oldFetch; global.window = oldWindow; }
  console.log('PASS weather detective: leap/cross-year windows, future exclusion, exact source queries, modeled gaps vs zero, plant/yard alignment and permitted photos');
})().catch(error => { console.error(error); process.exitCode = 1; });
