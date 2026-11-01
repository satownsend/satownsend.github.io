/* Pure calendar and constellation model. UTC arithmetic avoids DST gaps. */
export function validDate(s){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
}
export function yearDates(year, today){
  const out = [];
  for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += 86400000){
    const date = new Date(t).toISOString().slice(0, 10);
    if (date > today) break;
    out.push(date);
  }
  return out;
}
export function catalog(rows, today){
  return rows.filter(r => r.species?.trim() && validDate(r.date) && r.date <= today)
    .map(r => ({ ...r, species: r.species.trim(), category: r.category || 'Other' }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
}
export function constellations(rows, year){
  const groups = new Map();
  for (const row of rows.filter(r => +r.date.slice(0, 4) === +year)){
    if (!groups.has(row.species)) groups.set(row.species, { species: row.species, records: [], categories: [] });
    const group = groups.get(row.species);
    group.records.push(row);
    if (!group.categories.includes(row.category)) group.categories.push(row.category);
  }
  return [...groups.values()].sort((a, b) => a.species.localeCompare(b.species)).map(g => ({
    ...g, records: g.records.sort((a, b) => a.date.localeCompare(b.date)),
    first: g.records.reduce((d, r) => r.date < d ? r.date : d, g.records[0].date),
  }));
}
export function visibleRecords(group, date, category = ''){
  return group.records.filter(r => r.date <= date && (!category || r.category === category));
}
export function hash(s){ let n = 2166136261; for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0) / 4294967296; }
// Stable across filtering and scrubbing; each species occupies a patch of a dome.
export function starPosition(index, count, key){
  const cols = Math.ceil(Math.sqrt(count * 1.8)), rows = Math.ceil(count / cols);
  const azimuth = ((index % cols + .5) / cols - .5) * 2.5 + (hash(key + 'x') - .5) * .23;
  const elevation = .12 + (Math.floor(index / cols) + .5) / rows * 1.12 + (hash(key + 'y') - .5) * .17;
  const r = 25;
  return [r * Math.cos(elevation) * Math.sin(azimuth), r * Math.sin(elevation), -r * Math.cos(elevation) * Math.cos(azimuth)];
}
