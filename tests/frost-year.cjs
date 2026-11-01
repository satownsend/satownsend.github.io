const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../yard-3d/scenes/frost-model.js'));
  const { periodDates, temperatureGrid, loadPeriodMonths } = await import('data:text/javascript;base64,' + source.toString('base64'));
  assert.equal(periodDates('2024').length, 366);
  assert.equal(periodDates('2025').length, 365);
  assert.equal(periodDates('2024-02').length, 29);
  assert.equal(periodDates('2025-02').length, 28);
  assert.equal(periodDates('2024')[59], '2024-02-29');
  assert.equal(periodDates('2024').at(-1), '2024-12-31');
  assert.throws(() => periodDates('2026-13'));
  const dates = periodDates('2026'), hours = [
    { date: '2026-01-01', hour: 0, temp: 20 },
    { date: '2026-11-01', hour: 1, temp: 30 },
    { date: '2026-11-01', hour: 1, temp: 34 },
    { date: '2025-12-31', hour: 0, temp: -100 },
    { date: '2026-01-01', hour: 24, temp: -100 },
    { date: '2026-01-01', hour: 1, temp: NaN },
  ];
  const values = temperatureGrid(dates, hours);
  assert.equal(values.length, 8760);
  assert.equal(values[0], 20); assert.equal(values[1], null);
  assert.equal(values[dates.indexOf('2026-11-01') * 24 + 1], 32);
  assert.equal(values[dates.indexOf('2026-03-08') * 24 + 2], null, 'spring-forward hour stays empty');
  assert.equal(values.at(-1), null, 'no future or missing hours invented');
  assert.equal(values.filter(v => v != null && v <= 32).length, 2);
  let active = 0, peak = 0;
  const months = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);
  const result = await loadPeriodMonths(months, async month => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    if (month === '2024-02') throw new Error('unavailable');
    return [{ date: month + '-01', hour: 0, temp: 40 }];
  });
  assert.equal(peak, 3); assert.equal(result.hours.length, 11); assert.deepEqual(result.failed, ['2024-02']);
  let calls = 0, alive = true;
  await loadPeriodMonths(months, async () => { calls++; alive = false; return []; }, () => alive);
  assert.equal(calls, 1, 'obsolete year stops requesting queued months');
  console.log('PASS Frost valley: leap years, month lengths, DST averaging, missing hours, bounded parallel requests, partial failures and cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
