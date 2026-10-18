/* Forecast snapshots are predictions as seen at capture time, never observations. */
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForecastHistory = api;
})(typeof globalThis === 'object' ? globalThis : this, function(){
  'use strict';
  const headers = ['id', 'captured_at', 'part', 'payload'];
  const number = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  function merge(...lists){
    return [...new Map(lists.flat().filter(s => s && s.id && Number.isFinite(Date.parse(s.capturedAt)) && s.location && ['C','F'].includes(s.units) && Array.isArray(s.days) && Array.isArray(s.alerts) && s.rainfall && Array.isArray(s.rainfall.days)).map(s => [s.id,s])).values()]
      .sort((a,b) => b.capturedAt.localeCompare(a.capturedAt));
  }
  function capture({settings, daily, source, alerts, alertsAvailable, rainfall, rainfallFetched, capturedAt, dayAlerts}){
    if (!daily || !Array.isArray(daily.time) || !daily.time.length || !Number.isFinite(capturedAt)) return null;
    const location = {name:settings.city || '', lat:number(settings.lat), lon:number(settings.lon)};
    if (location.lat == null || location.lon == null) return null;
    const units = settings.units === 'C' ? 'C' : 'F';
    const days = daily.time.map((date,i) => {
      const d = {date, hi:number(daily.temperature_2m_max?.[i]), lo:number(daily.temperature_2m_min?.[i]),
        pop:number(daily.precipitation_probability_max?.[i]), wind:number(daily.wind_speed_10m_max?.[i]),
        // NWS /forecast does not supply precipitation amounts; its legacy zero is not a measurement.
        pcp:source === 'nws' ? null : number(daily.precipitation_sum?.[i])};
      d.risks = dayAlerts ? dayAlerts(d,units) : [];
      return d;
    }).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    if (!days.length) return null;
    const time = new Date(capturedAt).toISOString();
    return {id:`${location.lat},${location.lon}|${units}|${time}`, capturedAt:time,
      kind:'forecast', version:1, location, units, source, days,
      alertsAvailable:!!alertsAvailable, alerts:Array.isArray(alerts) ? alerts : [],
      rainfall: {source:'open-meteo-archive', kind:'model-estimate',
        fetchedAt:rainfallFetched ? new Date(rainfallFetched).toISOString() : null,
        days:Array.isArray(rainfall) ? rainfall.map(r=>({date:r.date, amount:number(r.amount)})) : []}};
  }
  function shouldCapture(history, next){
    if (!next) return false;
    const last = merge(history).find(s => s.location.lat === next.location.lat && s.location.lon === next.location.lon && s.units === next.units);
    // Keep alert changes immediately, even within the usual one-hour interval.
    return !last || Date.parse(next.capturedAt) - Date.parse(last.capturedAt) >= 3600000 ||
      JSON.stringify([last.alertsAvailable,last.alerts]) !== JSON.stringify([next.alertsAvailable,next.alerts]);
  }
  function toRows(snapshots){
    const rows = [headers];
    for (const s of merge(snapshots)){
      const json = JSON.stringify(s);
      // Sheets cells have a 50k character limit. Losslessly split long alert descriptions.
      for (let i=0;i<json.length;i+=30000) rows.push([s.id,s.capturedAt,String(i/30000),json.slice(i,i+30000)]);
    }
    return rows;
  }
  function fromRows(rows){
    if (!rows.length || headers.some((h,i)=>h !== rows[0][i])) return [];
    const groups = new Map();
    for (const r of rows.slice(1)){
      const part = Number(r[2]);
      if (!r[0] || !Number.isInteger(part) || part < 0) continue;
      if (!groups.has(r[0])) groups.set(r[0],[]);
      groups.get(r[0])[part] = r[3] || '';
    }
    const snapshots=[];
    for (const [id,parts] of groups){
      try { const s=JSON.parse(parts.join('')); if (s.id===id) snapshots.push(s); } catch(_) { /* incomplete/corrupt rows do not erase local history */ }
    }
    return merge(snapshots);
  }
  function pendingRows(current, snapshots){
    const keys = new Set(current.slice(1).map(r=>`${r[0]}\n${r[2]}`));
    return toRows(snapshots).slice(1).filter(r=>!keys.has(`${r[0]}\n${r[2]}`));
  }
  function collectorStatus(config,rows,now){
    if (!config.enabled) return 'Scheduled collection is paused in configuration. Saved history remains available.';
    if (rows[0]?.[0] !== 'collector' || rows[0]?.[1] !== 'status_json' || !rows[1]?.[1]) return 'Scheduled collection has not reported a run yet. Setup may still be needed; see Collector runs. Dashboard captures remain available.';
    let s;
    try { s=JSON.parse(rows[1][1]); } catch(e){ return 'Scheduled collector status could not be read. See Collector runs.'; }
    const when=t=>Number.isFinite(Date.parse(t)) ? new Date(t).toLocaleString() : 'never';
    const location=s.location || config.location;
    const base=`Scheduled collector for ${location.city}, °${location.units}. Last saved capture: ${when(s.lastCapture)}. `;
    if (s.state==='paused') return base+'Collection is paused. Resume using the repository pause control.';
    const interval=Number(s.intervalHours) || config.intervalHours;
    const age=now-Date.parse(s.lastCapture);
    const overdue=Number.isFinite(age) && age > (interval+1)*3600000;
    const gap=s.coverage?.missing ? `${s.coverage.missing} missing interval(s) in the last reported coverage window. ` : '';
    const warnings=Array.isArray(s.warnings)?s.warnings:[];
    const sourceWarnings=warnings.filter(x=>x!=='collection_failed').map(x=>String(x).replace(/_/g,' ')).join(', ');
    return base+`Expected every ${interval} hour(s). `+gap+
      (s.state==='error' ? 'Last attempt failed. See Collector runs. ' : sourceWarnings ? `Source gaps: ${sourceWarnings}. ` : '')+
      (overdue ? 'Collection is overdue; recent intervals may be missing. ' : '')+
      `Last attempt: ${when(s.lastAttempt)}.`;
  }
  return {headers, capture, merge, shouldCapture, toRows, fromRows, pendingRows, collectorStatus};
});
