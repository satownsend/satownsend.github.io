const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../yard-3d/scan/model.js'), 'utf8');
  const { scanExtension, frameBounds } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(scanExtension('yard.SPZ'), 'spz');
  for (const name of ['yard.jpg', 'yard.glb', 'scan.html', '']) assert.throws(() => scanExtension(name));
  const wide = frameBounds([-10, -2, -5], [10, 6, 5], 2, 55);
  const phone = frameBounds([-10, -2, -5], [10, 6, 5], .5, 55);
  assert.deepEqual(wide.center, [0, 2, 0]);
  assert(phone.distance > wide.distance, 'portrait camera must back away to fit the whole scene');
  assert(wide.near > 0 && wide.far > wide.distance + wide.radius);
  for (const [min, max] of [[[0,0,0],[0,0,0]], [[NaN,0,0],[1,1,1]], [[2,0,0],[1,1,1]], [[0,0,0],[Infinity,1,1]]]) assert.throws(() => frameBounds(min, max, 1, 55));

  const oldWindow = global.window, oldFetch = global.fetch;
  let signedIn = false, reads = 0;
  global.window = { GAuth: { isAuthed: () => signedIn } };
  global.fetch = async () => { reads++; return { ok: true, text: async () => 'key,plant_id,date,hideFromGallery,viewTags\nphotos/visible.jpg,yard,2026-10-01,FALSE,Porch\nphotos/hidden.jpg,yard,2026-10-01,TRUE,Porch\nphotos/plant.jpg,tree,2026-10-01,FALSE,\n' }; };
  try {
    const data = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../yard-3d/data.js')).toString('base64'));
    assert.deepEqual(await data.yardPhotos(), []); assert.equal(reads, 0);
    signedIn = true;
    assert.deepEqual((await data.yardPhotos()).map(p => p.key), ['photos/visible.jpg']);
    signedIn = false; assert.deepEqual(await data.yardPhotos(), []);
  } finally { global.window = oldWindow; global.fetch = oldFetch; }
  console.log('PASS yard scan: format checks, portrait framing, invalid bounds, signed-out and hidden-photo exclusion');
})().catch(error => { console.error(error); process.exitCode = 1; });
