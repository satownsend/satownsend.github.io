/* Match photographic evidence to a species/date without duplicating observations. */
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WildlifePhotoSightings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  function validDate(value){
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  }
  function filenameDate(name){
    const match = String(name || '').match(/(?:^|\D)((?:19|20)\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?!\d)/);
    const date = match && `${match[1]}-${match[2]}-${match[3]}`;
    return validDate(date) ? date : null;
  }
  function captureDate({ override = '', exif = '', filename = '', today }){
    if (override){ if (!validDate(override) || override > today) throw new Error('Enter a valid capture date no later than today.'); return { date: override, source: 'entered date' }; }
    for (const [date, source] of [[exif, 'capture metadata'], [filenameDate(filename), 'dated filename']]) if (validDate(date) && date <= today) return { date, source };
    throw new Error('Capture date unavailable. Enter Photo date above, then choose this file again.');
  }
  function stableId(species, date){
    let hash = 2166136261; for (const c of normalize(species)){ hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `ph-${date}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }
  function plan(sightings, { species, category = '', date, preferredId = '' }, today){
    if (!normalize(species)) throw new Error('Choose a species first.');
    if (!validDate(date) || date > today) throw new Error('A sighting needs a valid capture date no later than today.');
    const peers = sightings.filter(row => normalize(row.species) === normalize(species));
    const matching = peers.filter(row => row.id && row.date === date);
    const existing = matching.find(row => row.id === preferredId) || matching[0];
    if (existing) return { sighting: existing, create: false };
    const canonical = peers[0]?.species || String(species).trim();
    let id = stableId(canonical, date), suffix = 0;
    while (sightings.some(row => row.id === id)) id = stableId(canonical, date) + '-' + (++suffix);
    return { create: true, sighting: { id, species: canonical, category: category || peers[0]?.category || '', date, location: '', notes: `Created from wildlife media dated ${date}.`, firstOfYear: '' } };
  }
  function sightingValues(row){ return ['id', 'species', 'category', 'date', 'location', 'notes', 'firstOfYear'].map(key => row[key] || ''); }
  function appendRequests(result, photo, tabs){
    const append = (sheetId, values) => ({ appendCells: { sheetId, rows: [{ values: values.map(value => ({ userEnteredValue: { stringValue: String(value) } })) }], fields: 'userEnteredValue' } });
    return [...(result.create ? [append(tabs.sightings, sightingValues(result.sighting))] : []), append(tabs.wildlife_photos, [result.sighting.id, photo.key, photo.date, photo.caption || '', photo.hideFromGallery ? 'TRUE' : 'FALSE'])];
  }
  function reconcile(sightings, photos, today){
    const existing = new Map(sightings.map(row => [row.id, row])), all = [...sightings], created = [], links = [], skipped = [];
    photos.forEach((photo, index) => {
      const observation = existing.get(photo.sighting_id);
      if (!observation?.species || !photo.key || !validDate(photo.date) || photo.date > today){ skipped.push({ index, reason: !observation?.species ? 'missing species/sighting' : 'missing key or invalid/future date' }); return; }
      const result = plan(all, { species: observation.species, category: observation.category, date: photo.date, preferredId: photo.sighting_id }, today);
      if (result.create){ all.push(result.sighting); created.push(result.sighting); }
      if (photo.sighting_id !== result.sighting.id) links.push({ index, key: photo.key, oldId: photo.sighting_id, sightingId: result.sighting.id, date: photo.date, species: result.sighting.species });
    });
    return { created, links, skipped };
  }
  return { normalize, validDate, filenameDate, captureDate, plan, sightingValues, appendRequests, reconcile };
});
