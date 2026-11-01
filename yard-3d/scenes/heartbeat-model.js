import { validDate } from '../timeline.js';

export function datedRows(rows, today){ return rows.filter(row => validDate(row.date) && row.date <= today); }
export function recordYears(sources, today){
  const years = new Set();
  for (let year = 2020; year <= Number(today.slice(0, 4)); year++) years.add(year);
  for (const rows of sources) for (const row of datedRows(rows, today)){ const year = Number(row.date.slice(0, 4)); if (year >= 1900) years.add(year); }
  return [...years].sort((a, b) => b - a);
}
export function dateIndex(rows, today){
  const index = new Map();
  for (const row of datedRows(rows, today)){ if (!index.has(row.date)) index.set(row.date, []); index.get(row.date).push(row); }
  return index;
}
export function seasonalWindows(overviews, month){
  return overviews.flatMap(overview => (overview.calendar || []).filter(entry => Number.isInteger(entry.s) && Number.isInteger(entry.e) && entry.s >= 1 && entry.s <= 12 && entry.e >= 1 && entry.e <= 12 && /^#[0-9a-f]{6}$/i.test(entry.c || '') && (entry.s <= entry.e ? month >= entry.s && month <= entry.e : month >= entry.s || month <= entry.e)).map(entry => ({ ...entry, plantId: overview.plantId })));
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function weatherMap(rows){ return new Map(rows.filter(row => validDate(row.date)).map(row => [row.date, { hi: finite(row.hi), lo: finite(row.lo), pcp: finite(row.pcp) != null && row.pcp >= 0 ? row.pcp : null }])); }
export function daySnapshot(date, weather, log, wildlife, photos){
  const care = log.get(date) || [];
  return { date, weather: weather.get(date) || { hi: null, lo: null, pcp: null }, logs: care, watering: care.filter(row => row.action === 'watered'), wildlife: wildlife.get(date) || [], photos: photos.get(date) || [] };
}
export function permittedPhotos(rows, plants, authed, inventoryAvailable = true){
  const ids = new Set(plants.map(plant => plant.id));
  return rows.filter(photo => photo.key && !photo.hideFromGallery && (photo.plantId === 'yard' ? authed : inventoryAvailable && ids.has(photo.plantId)));
}
export function stablePosition(id){
  let hash = 2166136261; for (const c of String(id)){ hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const angle = (hash >>> 0) / 4294967296 * Math.PI * 2, radius = 2 + ((hash >>> 8) % 1000) / 1000 * 11;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius * .7];
}
