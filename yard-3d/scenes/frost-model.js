// Calendar slots stay fixed across missing months and daylight-saving changes.
export function periodDates(period){
  if (!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period)) throw new Error('Invalid frost period');
  const year = Number(period.slice(0, 4)), month = period.length === 7 ? Number(period.slice(5)) : 1;
  const start = Date.UTC(year, month - 1, 1), end = period.length === 7 ? Date.UTC(year, month, 1) : Date.UTC(year + 1, 0, 1);
  const dates = [];
  for (let day = start; day < end; day += 86400000) dates.push(new Date(day).toISOString().slice(0, 10));
  return dates;
}

export function temperatureGrid(dates, hours){
  const byDate = new Map(dates.map((date, index) => [date, index]));
  const values = Array(dates.length * 24).fill(null), counts = Array(values.length).fill(0);
  for (const hour of hours){
    const day = byDate.get(hour.date);
    if (day === undefined || !Number.isInteger(hour.hour) || hour.hour < 0 || hour.hour > 23 || !Number.isFinite(hour.temp)) continue;
    const index = day * 24 + hour.hour;
    values[index] = (values[index] ?? 0) + hour.temp; counts[index]++;
  }
  return values.map((value, index) => counts[index] ? value / counts[index] : null);
}

export async function loadPeriodMonths(months, load, active = () => true){
  const results = Array(months.length), failed = [];
  let next = 0;
  async function worker(){
    while (active()){
      const index = next++; if (index >= months.length) return;
      try { results[index] = await load(months[index]); }
      catch (_) { results[index] = []; failed.push(months[index]); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, months.length) }, worker));
  return { hours: results.flatMap(rows => rows || []), failed: failed.sort() };
}
