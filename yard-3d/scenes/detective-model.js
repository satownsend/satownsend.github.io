export function validDate(value){
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export function shiftDate(date, days){
  if (!validDate(date) || !Number.isInteger(days)) throw new Error('Invalid date offset');
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function eventsFromLog(rows, today){
  return rows.flatMap((row, index) => validDate(row.date) && row.date <= today && row.action ? [{ ...row, key: String(index), plantId: row.plantId || '' }] : [])
    .sort((a, b) => b.date.localeCompare(a.date) || b.key - a.key);
}
export function windowDates(event, before, after, today){
  if (!validDate(event.date) || !validDate(today) || event.date > today) throw new Error('Choose a valid recorded event');
  if (!Number.isInteger(before) || before < 1 || before > 84 || !Number.isInteger(after) || after < 0 || after > 28) throw new Error('Choose 1–84 preceding days and 0–28 following days');
  const start = shiftDate(event.date, -before), end = [shiftDate(event.date, after), today].sort()[0], dates = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function alignDays(dates, weather, log, photos, event){
  const estimates = new Map(weather.filter(row => validDate(row.date)).map(row => [row.date, row]));
  const care = new Map(), images = new Map();
  for (const row of log){
    if (!validDate(row.date) || !(row.plantId === event.plantId || !row.plantId || row.plantId === 'yard')) continue;
    if (!care.has(row.date)) care.set(row.date, []); care.get(row.date).push(row);
  }
  for (const photo of photos){
    if (!validDate(photo.date) || !photo.key || !(photo.plantId === event.plantId || photo.plantId === 'yard')) continue;
    if (!images.has(photo.date)) images.set(photo.date, []); images.get(photo.date).push(photo);
  }
  return dates.map(date => {
    const row = estimates.get(date);
    return { date, hi: finite(row?.hi), lo: finite(row?.lo), pcp: finite(row?.pcp), logs: care.get(date) || [], photos: images.get(date) || [], event: date === event.date };
  });
}
export function coverage(days){
  return { temperature: days.filter(day => day.hi != null && day.lo != null).length, precipitation: days.filter(day => day.pcp != null).length, days: days.length };
}
