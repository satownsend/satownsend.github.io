/* Shared weather normalization and garden-risk thresholds for browser and collector. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.WeatherData=api;
})(typeof globalThis==='object'?globalThis:this,function(){
function nwsPeriodsToDaily(periods, units){
  const wantC = units === 'C';
  const byDate = new Map();
  for (const p of periods){
    const date = (p.startTime || '').slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(p);
  }
  const dates = [...byDate.keys()].slice(0, 7);
  const time = dates;
  const hi = [], lo = [], pop = [], wind = [], pcp = [], code = [];
  for (const d of dates){
    const items = byDate.get(d);
    const day = items.find(x => x.isDaytime);
    const night = items.find(x => !x.isDaytime);
    const dayT = day ? day.temperature : null;
    const nightT = night ? night.temperature : null;
    // NWS returns °F for US points by default. Convert if user wants °C.
    const toUserUnit = (t, srcUnit) => {
      if (t == null) return null;
      const isF = (srcUnit || 'F') === 'F';
      if (wantC && isF) return (t - 32) * 5/9;
      if (!wantC && !isF) return t * 9/5 + 32;
      return t;
    };
    const dayU = day ? toUserUnit(dayT, day.temperatureUnit) : null;
    const nightU = night ? toUserUnit(nightT, night.temperatureUnit) : null;
    // High = warmer of the two periods; low = cooler.
    const samples = [dayU, nightU].filter(v => v != null);
    hi.push(samples.length ? Math.max(...samples) : null);
    lo.push(samples.length ? Math.min(...samples) : null);
    // Probability of precipitation: max across periods.
    const pops = items.map(p => p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value).filter(v => v != null);
    pop.push(pops.length ? Math.max(...pops) : null);
    // Wind: parse "5 to 10 mph" / "10 mph" — take the upper bound across periods.
    const winds = items.map(p => {
      const m = String(p.windSpeed || '').match(/(\d+(?:\.\d+)?)\s*(?:to\s*(\d+(?:\.\d+)?))?\s*(mph|km\/h)/i);
      return m ? Number(m[2] || m[1]) * (m[3].toLowerCase() === 'mph' ? 1 : 0.621371) : null;
    }).filter(v => v != null);
    wind.push(winds.length ? Math.max(...winds) : null);
    // /forecast doesn't expose daily precip amount; leave as 0 for legacy rendering. Brief uses
    // pop (probability) as the primary signal, so this is acceptable.
    pcp.push(0);
    code.push(0);
  }
  return {
    time,
    temperature_2m_max: hi,
    temperature_2m_min: lo,
    precipitation_sum: pcp,
    precipitation_probability_max: pop,
    wind_speed_10m_max: wind,
    weather_code: code,
  };
}

function dayAlerts(d, units){
  const u = units==='C' ? '°C' : '°F';
  const pu = units==='C' ? 'mm' : 'in';
  const frostT = units==='C' ? 2 : 36;
  const heatT  = units==='C' ? 31 : 88;
  const windT  = 25;
  const alerts = [];
  if (d.lo != null && d.lo <= frostT){
    alerts.push({label:'Frost risk',
      detail:`Overnight low of ${Math.round(d.lo)}${u}. Cover tender or recently-planted trees with frost cloth, and bring potted plants in or against the house.`});
  }
  if (d.hi != null && d.hi >= heatT){
    alerts.push({label:'Extreme heat',
      detail:`High of ${Math.round(d.hi)}${u}. Deep-water established trees and check container plants twice. Variegated and spring-foliage maples (Shin Deshojo, Ukigumo, Asayake) burn fast — give afternoon shade.`});
  }
  if (d.wind != null && d.wind >= windT){
    alerts.push({label:'High wind',
      detail:`Gusts up to ${Math.round(d.wind)} mph. Move hanging pots (Asayake, Rikuzen Shidare) to a sheltered spot. Check stake ties on young trees.`});
  }
  return alerts;
}

function rainfallFromDaily(d){
  if (!Array.isArray(d?.time) || !Array.isArray(d.precipitation_sum)) throw new Error('Invalid rainfall response');
  return d.time.map((date,i)=>({date,amount:d.precipitation_sum[i] == null ? null : d.precipitation_sum[i]}));
}
return {nwsPeriodsToDaily,dayAlerts,rainfallFromDaily};
});
