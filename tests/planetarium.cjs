const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = file => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '..', file)).toString('base64'));
(async () => {
  const m = await load('yard-3d/scenes/planetarium-model.js');
  assert.equal(m.validDate('2024-02-29'), true);
  assert.equal(m.validDate('2025-02-29'), false);
  assert.equal(m.validDate('2026-13-01'), false);
  assert.equal(m.yearDates(2024, '2026-11-01').length, 366);
  assert.equal(m.yearDates(2025, '2026-11-01').length, 365);
  assert.equal(m.yearDates(2026, '2026-11-01').at(-1), '2026-11-01');
  const rows = m.catalog([
    { id: 'b', species: 'Robin', category: 'Bird', date: '2024-03-10' },
    { id: 'a', species: 'Robin', category: 'Bird', date: '2024-02-29' },
    { id: 'c', species: 'Robin', category: 'Other', date: '2024-03-11' },
    { id: 'd', species: 'Robin', category: 'Bird', date: '2023-01-01' },
    { id: 'e', species: 'Fox', category: 'Mammal', date: '2024-04-01' },
    { id: 'f', species: 'Fox', date: '2027-01-01' },
    { id: 'g', species: 'Robin', date: '2025-02-29' },
    { id: 'h', species: '', date: '2024-01-01' },
  ], '2026-11-01');
  assert.equal(rows.length, 5);
  const groups = m.constellations(rows, 2024), robin = groups.find(g => g.species === 'Robin');
  assert.equal(groups.length, 2);
  assert.equal(robin.first, '2024-02-29', 'first is scoped to selected year');
  assert.equal(m.visibleRecords(robin, '2024-02-28').length, 0);
  assert.equal(m.visibleRecords(robin, '2024-03-10', 'Bird').length, 2);
  assert.equal(m.visibleRecords(robin, '2024-03-11', 'Other').length, 1);
  assert.equal(robin.first, '2024-02-29', 'category filtering must not rewrite first sighting');
  assert.deepEqual(m.constellations([], 2024), []);
  const pos = m.starPosition(0, 2, 'Robin-a');
  assert.deepEqual(pos, m.starPosition(0, 2, 'Robin-a'));
  assert.ok(Math.abs(Math.hypot(...pos) - 25) < 1e-8);
  const data = await load('yard-3d/data.js');
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, text: async () => 'sighting_id,key,date,caption,hideFromGallery\na,visible.jpg,2024-02-29,Allowed,FALSE\na,hidden.jpg,2024-02-29,Hidden,TRUE\na,movie.mp4,2024-02-29,Video,FALSE' });
    assert.deepEqual((await data.wildlifePhotos()).map(p => p.key), ['visible.jpg']);
    data.forget();
    global.fetch = async () => ({ ok: true, text: async () => 'id,species,date\n' });
    assert.deepEqual(await data.sightings(), []);
    data.forget();
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(data.sightings(), /HTTP 503/, 'failed source must not masquerade as empty data');
  } finally { global.fetch = originalFetch; }
  console.log('PASS planetarium: leap days, current-year bounds, date validation, first sightings, filters, stable dome layout, hidden media, empty and failed sources');
})().catch(e => { console.error(e); process.exitCode = 1; });
