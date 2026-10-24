/* Shared temperature chart for forecasts, saved predictions and historical estimates. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=v=>typeof v==='number'&&Number.isFinite(v);
  const label=(sample,zone)=>new Date(sample.time).toLocaleTimeString(undefined,{timeZone:zone,hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  const value=(v,unit,digits=1)=>valid(v)?`${v.toFixed(digits)}${unit}`:'—';
  function readout(s,zone,units){
    return `${label(s,zone)} · Temperature ${value(s.temp,'°'+units)} · Precipitation ${value(s.pcp,units==='C'?' mm':' in',units==='C'?1:3)} · Wind ${value(s.wind,' mph')} · Gust ${value(s.gust,' mph')}`;
  }
  window.HourlyWeatherChart={markup(samples,zone,units){
    const rows=samples.filter(s=>Number.isFinite(Date.parse(s.time))),temps=rows.map(s=>s.temp).filter(valid);
    if(!temps.length)return '<p class="small">No hourly temperature estimates available. Other measurements are listed below.</p>';
    const w=760,h=270,left=66,right=24,top=24,bottom=52,plotW=w-left-right,plotH=h-top-bottom;
    const min=Math.min(...temps),max=Math.max(...temps),step=Math.max(1,Math.ceil((max-min+2)/4)),low=Math.floor((min-1)/step)*step,high=Math.ceil((max+1)/step)*step;
    const first=Date.parse(rows[0].time),span=Math.max(3600000,Date.parse(rows.at(-1).time)-first);
    const x=s=>left+(Date.parse(s.time)-first)*plotW/span,y=v=>top+(high-v)*plotH/(high-low);
    let path='',previous=null;
    rows.forEach(s=>{if(!valid(s.temp)){previous=null;return;}const stamp=Date.parse(s.time);path+=`${previous!==null&&stamp-previous===3600000?'L':'M'}${x(s).toFixed(2)},${y(s.temp).toFixed(2)} `;previous=stamp;});
    let grid='';
    for(let t=low;t<=high;t+=step)grid+=`<line x1="${left}" x2="${w-right}" y1="${y(t)}" y2="${y(t)}" class="hourly-grid"/><text x="${left-10}" y="${y(t)+5}" text-anchor="end">${t}°${esc(units)}</text>`;
    const ticks=rows.filter((s,i)=>i%3===0||i===rows.length-1).filter((s,i,a)=>i===a.length-1||Date.parse(rows.at(-1).time)-Date.parse(s.time)>=2*3600000);
    grid+=ticks.map((s,i)=>`<line x1="${x(s)}" x2="${x(s)}" y1="${top}" y2="${h-bottom}" class="hourly-grid"/><text x="${x(s)}" y="${h-25}" text-anchor="${i===0?'start':i===ticks.length-1?'end':'middle'}">${esc(new Date(s.time).toLocaleTimeString(undefined,{timeZone:zone,hour:'numeric'}))}</text>`).join('');
    const threshold=[units==='C'?0:32,units==='C'?20/9:36].filter(t=>t>=low&&t<=high).map(t=>`<line x1="${left}" x2="${w-right}" y1="${y(t)}" y2="${y(t)}" class="hourly-threshold"/><text x="${left+5}" y="${y(t)-6}">${t.toFixed(units==='C'&&t!==0?1:0)}°${esc(units)} reference</text>`).join('');
    const selected=0,points=rows.map(s=>valid(s.temp)?`<circle cx="${x(s)}" cy="${y(s.temp)}" r="3" fill="var(--accent)"><title>${esc(label(s,zone))}: ${value(s.temp,'°'+units)}</title></circle>`:'').join('');
    const data={rows:rows.map(s=>({...s,x:x(s),y:valid(s.temp)?y(s.temp):null})),zone,units};
    return `<div class="hourly-explorer" data-hourly-chart="${esc(JSON.stringify(data))}"><p class="hourly-reading" aria-live="polite" aria-atomic="true">${esc(readout(rows[selected],zone,units))}</p><div class="hourly-plot-scroll"><svg class="hourly-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Hourly temperature in ${esc(zone)}. Grid labels show degrees and local hours. Use the hour selector below for exact values.">${grid}${threshold}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3"/>${points}<line class="hourly-cursor" x1="${x(rows[selected])}" x2="${x(rows[selected])}" y1="${top}" y2="${h-bottom}"/><circle class="hourly-selected" cx="${x(rows[selected])}" cy="${valid(rows[selected].temp)?y(rows[selected].temp):top}" style="${valid(rows[selected].temp)?'':'display:none'}" r="6"/></svg></div><label class="hourly-selector">Inspect hour <input type="range" min="0" max="${rows.length-1}" value="${selected}" step="1" aria-label="Inspect hourly weather" aria-valuetext="${esc(readout(rows[selected],zone,units))}"></label><p class="small">Hover over the chart or tap to inspect an hour. Use the slider or arrow keys for exact readings. Times use ${esc(zone)}; the reading includes the time zone abbreviation at daylight-saving changes. Gaps mean unavailable temperatures.</p></div>`;
  }};
  function select(root,index,reveal=false){
    const data=JSON.parse(root.dataset.hourlyChart),s=data.rows[index];if(!s)return;
    const reading=readout(s,data.zone,data.units),input=root.querySelector('input');
    input.value=index;input.setAttribute('aria-valuetext',reading);
    const output=root.querySelector('.hourly-reading');if(output.textContent!==reading)output.textContent=reading;
    const line=root.querySelector('.hourly-cursor'),point=root.querySelector('.hourly-selected');
    if(reveal){const scroll=root.querySelector('.hourly-plot-scroll'),svg=root.querySelector('svg');scroll.scrollLeft=s.x*svg.getBoundingClientRect().width/760-scroll.clientWidth/2;}
    line.setAttribute('x1',s.x);line.setAttribute('x2',s.x);point.style.display=s.y===null?'none':'';
    if(s.y!==null){point.setAttribute('cx',s.x);point.setAttribute('cy',s.y);}
  }
  document.addEventListener('input',event=>{const root=event.target.closest('.hourly-explorer');if(root&&event.target.matches('input[type="range"]'))select(root,Number(event.target.value),true);});
  function pointer(event){
    const svg=event.target.closest('svg.hourly-chart'),root=svg?.closest('.hourly-explorer');if(!root)return;
    const data=JSON.parse(root.dataset.hourlyChart),point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    let nearest=0;data.rows.forEach((s,i)=>{if(Math.abs(s.x-point.x)<Math.abs(data.rows[nearest].x-point.x))nearest=i;});select(root,nearest);
  }
  document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')pointer(event);});
  document.addEventListener('click',pointer);
})();
