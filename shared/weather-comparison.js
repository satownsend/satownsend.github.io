/* Compare Lilly calendar dates using ERA5 plus labeled provisional recent estimates. */
(function(){
  'use strict';
  const location={name:'Lilly, PA 15938',lat:40.4238,lon:-78.6231,timezone:'America/New_York',units:'F'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>typeof v==='number'&&Number.isFinite(v);
  const format=(v,suffix,digits=1)=>number(v)?v.toFixed(digits)+suffix:'unavailable';
  const monthDay=date=>date.slice(5);
  const yearNow=()=>Number(HistoricalWeather.dateAt(Date.now(),location.timezone).slice(0,4));
  const slots=[];
  for(let d='2000-01-01';d<='2000-12-31';d=HistoricalWeather.shift(d,1))slots.push(monthDay(d));
  // Do not parse February 29 in a non-leap year: WebKit can reject that
  // invalid ISO date instead of normalizing it, aborting the entire chart.
  const leap=year=>year%4===0&&(year%100!==0||year%400===0);
  const exists=(year,md)=>md!=='02-29'||leap(year);
  const pretty=md=>new Date(`2000-${md}T12:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  const color=WeatherCalendar.temperatureF;
  const colors=['var(--accent)','var(--accent2)','var(--cool)','#b58de8','#ef82b4','#d6b955','#84ba68'];
  const yearColor=year=>colors[year-2020]||`hsl(${((year-2020)*137.508)%360} 60% 48%)`;
  const yearDash=year=>['none','8 4','2 4'][(year-2020)%3];
  const yearBorder=year=>['solid','dashed','dotted'][(year-2020)%3];
  const ranges={full:['01-01','12-31'],spring:['03-01','05-31'],summer:['06-01','08-31'],autumn:['09-01','11-30']};
  let root,years=[],datasets=new Map(),errors=new Map(),request=0,loading=false,selected=0,lastInteraction=0,view=null,pinnedBand=null,hoverBand=null,focusBand=null;
  const $=s=>root.querySelector(s);
  const WATERING_KEY='plants.compareWatering';
  let showWatering=false,watering=new Map(),wateringSignature='';
  let hoveredYear=null,focusedYear=null,pinnedYear=null;
  try{showWatering=localStorage.getItem(WATERING_KEY)==='1';}catch(_){}
  function updateWatering(){
    const records=typeof window.getComparisonWatering==='function'?window.getComparisonWatering():[];
    const signature=JSON.stringify(records);
    if(signature===wateringSignature)return false;
    wateringSignature=signature;watering=WateringEvents.byDate(records);return true;
  }
  function wateringFor(year,md){return watering.get(`${year}-${md}`)||[];}
  function wateringSummary(year,md){
    const events=wateringFor(year,md);
    const names=[...new Set(events.map(e=>e.name))];
    return `${year}-${md}: ${events.length} watering record${events.length===1?'':'s'}${events.length?' — '+names.slice(0,4).join(', '):''}${names.length>4?`; +${names.length-4} more. Inspect the date for all plants.`:''}`;
  }
  function wateringReading(md){
    if(!showWatering)return;
    $('#compareWateringReading').innerHTML=`<h4>Watering on ${esc(pretty(md))}</h4>${years.map(year=>{
      const events=wateringFor(year,md);
      return `<section><strong class="compare-year-key" style="--year-color:${yearColor(year)}">${year}</strong>${events.length?` · ${events.length} record${events.length===1?'':'s'}`:''}${!exists(year,md)?'<p>Not a date in this year.</p>':events.length?`<ul tabindex="0" aria-label="${year} watering records">${events.map(e=>`<li><strong>${esc(e.name)}</strong>${e.time?` · ${esc(e.time)}`:''}${e.note?`<p>${esc(e.note)}</p>`:''}</li>`).join('')}</ul>`:'<p>No watering recorded for this date.</p>'}</section>`;
    }).join('')}<p class="small">These are logged actions. No record does not mean a plant was not watered; no water amount is inferred or added to precipitation.</p>`;
  }
  function selection(){return [...root.querySelectorAll('[data-compare-year]:checked')].map(el=>Number(el.value)).sort((a,b)=>a-b);}
  function range(){
    let [from,to]=ranges[$('#compareSeason').value]||[$('#compareFrom').value.trim(),$('#compareTo').value.trim()];
    if(!slots.includes(from)||!slots.includes(to)||from>to)throw new Error('Enter a start and end as MM-DD, within one calendar year (for example, 10-01 to 12-31).');
    const notes=[],matching=$('#compareMatching').checked;
    if(!matching)notes.push('Showing the entire selected period; dates before the archive began, future dates and missing records remain unavailable.');
    if(matching&&years.includes(2020)&&from<'10-01'){from='10-01';notes.push('2020 starts on October 1, your move-in date; all years use that same starting date.');}
    if(matching&&years.includes(yearNow())){
      const data=datasets.get(yearNow()),cutoff=data?.comparison?.cutoff||data?.archive?.latestAvailable||HistoricalWeather.shift(HistoricalWeather.dateAt(Date.now(),location.timezone),-1);
      if(cutoff.slice(0,4)!==String(yearNow())){to='00-00';}
      else if(to>monthDay(cutoff)){to=monthDay(cutoff);notes.push(`All years stop at ${pretty(to)}, the latest completed local date (${cutoff}).`);}
    }
    return {from,to,notes,days:slots.filter(md=>md>=from&&md<=to)};
  }
  function series(year,days){
    const map=new Map((datasets.get(year)?.items||[]).map(d=>[monthDay(d.date),d]));
    let sum=0,intact=true,available=0,temperatures=0,expected=0,includesRecent=false;
    const points=days.map(md=>{
      if(!exists(year,md))return {md,applicable:false};
      expected++;
      const day=map.get(md)||null;
      if(number(day?.hi))temperatures++;
      if(number(day?.pcp)){sum+=day.pcp;available++;}else intact=false;
      if(day?.provisional)includesRecent=true;
      return {md,applicable:true,day,total:intact?sum:null,includesRecent};
    });
    return {year,points,available,temperatures,expected,sum,complete:expected>0&&available===expected};
  }
  function render(){
    let period;
    try{period=range();}catch(e){$('#compareStatus').textContent=e.message;$('#compareResults').innerHTML='';view=null;return;}
    if(!period.days.length){$('#compareStatus').textContent='This period has no completed, archived dates in common. Choose a different period or change the years.';$('#compareResults').innerHTML='';view=null;return;}
    hoverBand=null;focusBand=null;hoveredYear=null;focusedYear=null;
    if(pinnedYear!==null&&!years.includes(pinnedYear))pinnedYear=null;
    const rows=years.map(y=>series(y,period.days)),w=Math.max(680,period.days.length*3+100),left=76,right=24,plot=w-left-right,step=plot/period.days.length;
    const x=i=>left+(i+.5)*step;
    selected=Math.min(selected,period.days.length-1);
    view={period,rows,w,left,step,x};
    const ticks=period.days.map((md,i)=>({md,i})).filter(({md,i})=>i===0||md.endsWith('-01'));
    const labels=(y)=>ticks.map(({md,i})=>`<text x="${left+i*step}" y="${y}">${esc(new Date(`2000-${md}T12:00:00Z`).toLocaleDateString(undefined,{month:'short',timeZone:'UTC'}))}</text>`).join('');
    const heatHeight=35+rows.length*48;
    const heat=rows.map((row,r)=>`<text x="8" y="${58+r*48}">${row.year}</text>${row.points.map((p,i)=>`<rect x="${left+i*step}" y="${38+r*48}" width="${Math.max(.5,step-.4)}" height="28" class="wc-${p.applicable?color(p.day?.hi):'not-date'}${p.day?.provisional?' compare-provisional':''}" data-day-index="${i}"><title>${esc(`${row.year}-${p.md}: ${p.applicable?(p.day?.provisional?'provisional recent high ':'ERA5 estimated high ')+format(p.day?.hi,'°F'):'not a date in this year'}`)}</title></rect>`).join('')}`).join('');
    const max=Math.max(1,...rows.flatMap(row=>row.points.map(p=>p.total||0))),ceil=Math.ceil(max/4)*4,h=290,top=24,bottom=48,plotH=h-top-bottom,y=n=>top+(ceil-n)*plotH/ceil;
    view.y=y;
    let grid='';
    for(let i=0;i<=4;i++){const n=ceil*i/4;grid+=`<line x1="${left}" x2="${w-right}" y1="${y(n)}" y2="${y(n)}" class="compare-grid"/><text x="${left-10}" y="${y(n)+5}" text-anchor="end">${n.toFixed(1)} in</text>`;}
    grid+=ticks.map(({i})=>`<line x1="${left+i*step}" x2="${left+i*step}" y1="${top}" y2="${h-bottom}" class="compare-grid"/>`).join('');
    const lines=rows.map((row,r)=>{
      let path='',last=false;
      const points=row.points.map((p,i)=>{
        if(!p.applicable)return '';
        if(!number(p.total)){last=false;return '';}
        path+=`${last?'L':'M'}${x(i).toFixed(2)},${y(p.total).toFixed(2)} `;last=true;
        return `<circle cx="${x(i)}" cy="${y(p.total)}" r="${p.day?.provisional?3.5:2}" fill="${p.day?.provisional?'var(--panel)':yearColor(row.year)}" stroke="${yearColor(row.year)}"/>`;
      }).join('');
      return `<g class="compare-year-line" data-compare-line-year="${row.year}"><path d="${path}" fill="none" stroke="${yearColor(row.year)}" stroke-width="3" stroke-dasharray="${yearDash(row.year)}"/>${points}</g>`;
    }).join('');
    const rainHeight=showWatering?h+24+rows.length*30:h;
    const wateringLanes=showWatering?rows.map((row,r)=>{
      const laneY=h+18+r*30;
      return `<text x="8" y="${laneY+5}">${row.year}</text><line class="compare-water-line" x1="${left}" x2="${w-right}" y1="${laneY}" y2="${laneY}"/>${row.points.map((p,i)=>{
        const events=wateringFor(row.year,p.md);if(!p.applicable||!events.length)return '';
        const markerWidth=Math.min(16,step*.8);
        return `<g data-watering-year="${row.year}" data-watering-index="${i}"><title>${esc(wateringSummary(row.year,p.md))}</title><rect x="${x(i)-markerWidth/2}" y="${laneY-12}" width="${markerWidth}" height="24" fill="transparent"/><path transform="translate(${x(i)} ${laneY}) scale(${markerWidth/16} 1)" d="M 0 -8 C -10 2, -5 8, 0 8 C 5 8, 10 2, 0 -8 Z" fill="${yearColor(row.year)}"/></g>`;
      }).join('')}`;
    }).join(''):'';
    const summaries=rows.map((row,r)=>`<p><span class="compare-year-key" style="--year-color:${yearColor(row.year)}">${row.year}</span> · Daily highs ${row.temperatures}/${row.expected} days · Precipitation ${row.available}/${row.expected} days · ${row.complete?'Total':'Available-day sum'}: <strong>${row.available?format(row.sum,' in',2):'unavailable'}</strong>${row.complete?'':' (incomplete; totals cannot be compared)'}${row.points.some(p=>p.day?.provisional)?' · Includes provisional recent estimates':''}${errors.has(row.year)?` · ${esc(errors.get(row.year))}`:''}</p>`).join('');
    const freshness=years.map(year=>{
      const c=datasets.get(year)?.comparison;if(!c)return '';
      return `${year}: latest data ${c.latestAvailable||'unavailable'}${c.provisionalCount?`; recent model estimates ${c.provisionalFrom}–${c.provisionalThrough} (provisional)`:'; ERA5 archive'}${c.recentError?`; ${c.recentError}`:''}.`;
    }).filter(Boolean).join(' ');
    $('#compareStatus').textContent=`${loading?'Loading latest years… ':''}${pretty(period.from)}–${pretty(period.to)} in each selected year. ${period.notes.join(' ')} ${freshness} Checks for newer data automatically while open. Missing data stays empty.`;
    const temperatureKey=WeatherCalendar.temperatureLegend().replace(/<span class="wc-([^\"]+)"/g,'<button type="button" class="wc-$1" data-temperature-band="$1" aria-pressed="false"').replace(/<\/span>/g,'</button>');
    const controls=(kind)=>`<div class="compare-inspect-controls"><button type="button" class="ghost" data-compare-step="-1" data-chart-kind="${kind}" aria-label="Previous ${kind==='rain'?'precipitation':'temperature'} date">←</button><label>Inspect date <input id="${kind==='rain'?'compareRainDate':'compareDate'}" data-compare-slider="${kind}" type="range" min="0" max="${period.days.length-1}" value="${selected}" step="1" aria-label="Inspect ${kind==='rain'?'precipitation':'temperature'} comparison date"></label><button type="button" class="ghost" data-compare-step="1" data-chart-kind="${kind}" aria-label="Next ${kind==='rain'?'precipitation':'temperature'} date">→</button></div><div id="${kind==='rain'?'compareRainReading':'compareReading'}" data-compare-reading="${kind}" class="compare-reading"></div><details class="compare-day-details"><summary>More about this date <span data-compare-detail-date></span></summary><div data-compare-detail-values></div></details>`;
    const focused=document.activeElement,focusedId=root.contains(focused)?focused.id:'',focusedBand=root.contains(focused)?focused.dataset?.temperatureBand:null,focusedLineYear=root.contains(focused)?focused.dataset?.compareHighlightYear:null;
    const scrollPositions=[...root.querySelectorAll('.compare-scroll')].map(el=>el.scrollLeft);
    const detailStates=[...root.querySelectorAll('.compare-day-details')].map(el=>el.open);
    $('#compareResults').innerHTML=`
      <section class="compare-section" data-compare-section="temperature" aria-labelledby="compareHeatTitle">
        <h3 id="compareHeatTitle">Daily high temperatures</h3>
        <div class="wc-legend small compare-temperature-key" aria-label="Highlight temperature range">${temperatureKey}<button type="button" class="wc-unknown" data-temperature-band="unknown" aria-pressed="false">Unavailable</button></div>
        <p class="small">Hover or focus a color to highlight matching days. Tap a color to keep it highlighted; tap again to clear.</p><p id="compareBandStatus" class="small" role="status"></p>
        <div class="compare-plot"><div class="compare-scroll" tabindex="0" role="region" aria-label="Temperature calendar; scroll horizontally"><svg data-compare-chart="temperature" class="compare-chart" style="--comparison-width:${w}px" viewBox="0 0 ${w} ${heatHeight}" role="img" aria-label="Daily estimated high temperature by year. Use the date controls directly below for exact values.">${labels(22)}${heat}<line class="compare-cursor" x1="${x(selected)}" x2="${x(selected)}" y1="30" y2="${heatHeight}"/></svg></div><div class="compare-tooltip" data-compare-tooltip hidden aria-hidden="true"></div></div>
        ${controls('temperature')}
      </section>
      <section class="compare-section" data-compare-section="rain" aria-labelledby="compareRainTitle">
        <h3 id="compareRainTitle">Accumulated precipitation</h3>
        <label class="compare-watering-toggle"><input id="compareWatering" type="checkbox" ${showWatering?'checked':''}> Show watering events</label>
        ${showWatering?'<p class="small">Watering log markers appear in a separate row for each year below the precipitation plot. Tap a marker or use the date slider to see which plants were watered.</p>':''}
        <div class="compare-line-legend" aria-label="Highlight a precipitation year">${rows.map(row=>`<button type="button" class="compare-year-key compare-year-control" data-compare-highlight-year="${row.year}" aria-pressed="${pinnedYear===row.year}" aria-label="Highlight ${row.year} precipitation" style="--year-color:${yearColor(row.year)};border-bottom-style:${yearBorder(row.year)}">${row.year}</button>`).join('')}</div>
        <p class="small">Hover or focus a year to highlight its line. Click or tap to keep it highlighted; select it again or press Escape to clear.</p><p id="compareYearStatus" class="small" aria-live="polite"></p>
        <div class="compare-plot"><div class="compare-scroll" tabindex="0" role="region" aria-label="Accumulated precipitation chart; scroll horizontally"><svg data-compare-chart="rain" class="compare-chart" style="--comparison-width:${w}px" viewBox="0 0 ${w} ${rainHeight}" role="img" aria-label="Accumulated estimated precipitation in inches by year${showWatering?', with separate watering event rows':''}. Use the date controls directly below for exact values.">${grid}${lines}${labels(h-20)}<line class="compare-cursor" x1="${x(selected)}" x2="${x(selected)}" y1="${top}" y2="${h-bottom}"/>${wateringLanes}</svg></div><div class="compare-tooltip" data-compare-tooltip hidden aria-hidden="true"></div></div>
        ${controls('rain')}
        ${showWatering?`<label class="compare-watering-jump">Watering date <select id="compareWateringJump"><option value="">Choose a watering date…</option>${period.days.map((md,i)=>{
          const counts=rows.map(row=>{const n=wateringFor(row.year,md).length;return n?`${row.year}: ${n} record${n===1?'':'s'}`:'';}).filter(Boolean);
          return counts.length?`<option value="${i}" ${i===selected?'selected':''}>${esc(pretty(md))} · ${esc(counts.join(' / '))}</option>`:'';
        }).join('')}</select></label>`:''}
        <div id="compareWateringReading" class="compare-watering-reading" aria-live="polite" ${showWatering?'':'hidden'}></div>
        <p class="small">Outlined temperature days and hollow precipitation points are provisional recent model estimates; ERA5 replaces them as it becomes available. Each line starts from zero at the beginning of this period. Daily precipitation includes rain and snow water equivalent. A line stops at the first unavailable day, because its later total is unknown.</p>
      </section>
      <div class="compare-summaries">${summaries}</div><p class="small">Hover or tap either chart to inspect a date across years. Each chart has its own synchronized date slider and arrow buttons. Expand More about this date for daily estimates. Leap years include February 29; other years leave that slot empty. Weather estimates describe regional conditions, not backyard measurements or the cause of a plant’s performance.</p>
      <details><summary>Daily comparison data</summary><div class="hourly-scroll" tabindex="0" role="region" aria-label="Year comparison daily data"><table><thead><tr><th scope="col">Date</th>${rows.map(r=>`<th scope="col">${r.year} high (°F)</th><th scope="col">${r.year} precip. (in)</th><th scope="col">${r.year} running total (in)</th><th scope="col">${r.year} source</th>`).join('')}</tr></thead><tbody>${period.days.map((md,i)=>`<tr><th scope="row">${esc(pretty(md))}</th>${rows.map(row=>{const p=row.points[i];return p.applicable?`<td>${esc(format(p.day?.hi,''))}</td><td>${esc(format(p.day?.pcp,'',3))}</td><td>${esc(format(p.total,'',2))}</td><td>${p.day?.provisional?'Provisional recent estimate':p.day?'ERA5':'Unavailable'}</td>`:'<td>Not a date</td><td>Not a date</td><td>Not a date</td><td>Not a date</td>';}).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    root.querySelectorAll('.compare-scroll').forEach((el,i)=>{if(scrollPositions[i]!=null)el.scrollLeft=scrollPositions[i];});
    root.querySelectorAll('.compare-day-details').forEach((el,i)=>{el.open=!!detailStates[i];});
    highlight();highlightYear();
    inspect(selected);
    const focusTarget=focusedId?document.getElementById(focusedId):focusedBand?root.querySelector(`[data-temperature-band="${focusedBand}"]`):focusedLineYear?root.querySelector(`[data-compare-highlight-year="${focusedLineYear}"]`):null;
    if(focusTarget&&focusTarget!==document.activeElement)focusTarget.focus({preventScroll:true});
  }
  function highlightYear(){
    const active=hoveredYear??focusedYear??pinnedYear;
    root.querySelectorAll('[data-compare-line-year]').forEach(line=>{
      const match=Number(line.dataset.compareLineYear)===active;
      line.classList.toggle('compare-year-dim',active!==null&&!match);
      line.classList.toggle('compare-year-highlight',match);
    });
    root.querySelectorAll('[data-compare-highlight-year]').forEach(button=>{
      const year=Number(button.dataset.compareHighlightYear);
      button.setAttribute('aria-pressed',String(year===pinnedYear));
      button.classList.toggle('compare-year-active',year===active);
    });
    const status=$('#compareYearStatus');
    if(status)status.textContent=active===null?'':`${active} precipitation highlighted${active===pinnedYear?' · highlight kept':''}.`;
  }
  function highlight(){
    if(!view)return;
    const band=hoverBand||focusBand||pinnedBand;
    root.querySelectorAll('svg[data-compare-chart="temperature"] rect').forEach(tile=>{
      const match=!!band&&tile.classList.contains('wc-'+band);
      tile.classList.toggle('compare-dim',!!band&&!match);
      tile.classList.toggle('compare-match',match);
    });
    root.querySelectorAll('[data-temperature-band]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.temperatureBand===pinnedBand));
      button.classList.toggle('compare-key-active',button.dataset.temperatureBand===band);
    });
    const key=band&&root.querySelector(`[data-temperature-band="${band}"]`);
    $('#compareBandStatus').textContent=key?`${key.textContent} · ${view.rows.map(row=>`${row.year}: ${row.points.filter(p=>p.applicable&&color(p.day?.hi)===band).length} days`).join(' · ')}${pinnedBand===band?' · Highlight kept.':''}`:'';
  }
  function inspect(index,reveal=false,kind='temperature'){
    if(!view)return;
    selected=Math.max(0,Math.min(view.period.days.length-1,index));
    const md=view.period.days[selected];
    for(const chartKind of ['temperature','rain']){
      const output=$(`[data-compare-reading="${chartKind}"]`);
      output.setAttribute('aria-live',chartKind===kind?'polite':'off');
      if(output.dataset.date!==md){
        output.dataset.date=md;
        output.innerHTML=`<strong>${esc(pretty(md))}</strong><table class="compare-date-values"><thead><tr><th scope="col">Year</th>${chartKind==='rain'?'<th scope="col">Daily (in)</th><th scope="col">Total (in)</th>':'<th scope="col">High (°F)</th><th scope="col">Low (°F)</th>'}</tr></thead><tbody>${view.rows.map(row=>{const p=row.points[selected];return `<tr><th scope="row"><span class="compare-year-key" style="--year-color:${yearColor(row.year)}">${row.year}</span>${p.day?.provisional?'<small class="compare-recent-label">Recent estimate</small>':''}</th>${!p.applicable?'<td colspan="2">Not a date in this year</td>':chartKind==='rain'?`<td>${format(p.day?.pcp,'',3)}</td><td>${format(p.total,'',2)}${p.includesRecent?'<small class="compare-recent-label">Includes recent estimates</small>':''}</td>`:`<td>${format(p.day?.hi,'')}</td><td>${format(p.day?.lo,'')}</td>`}</tr>`;}).join('')}</tbody></table>`;
      }
    }
    root.querySelectorAll('[data-compare-slider]').forEach(slider=>{
      slider.value=selected;
      const rain=slider.dataset.compareSlider==='rain';
      const readings=view.rows.map(row=>{const p=row.points[selected];return `${row.year}: ${!p.applicable?'not a date':rain?`daily ${format(p.day?.pcp,' inches',3)}, running total ${format(p.total,' inches',2)}${p.includesRecent?' including recent estimates':''}`:`high ${format(p.day?.hi,'°F')}, low ${format(p.day?.lo,'°F')}${p.day?.provisional?' provisional recent estimate':''}`}`;});
      slider.setAttribute('aria-valuetext',`${pretty(md)}. ${readings.join('. ')}`);
    });
    root.querySelectorAll('[data-compare-step]').forEach(button=>{button.disabled=Number(button.dataset.compareStep)<0?selected===0:selected===view.period.days.length-1;});
    root.querySelectorAll('[data-compare-detail-date]').forEach(label=>{label.textContent='· '+pretty(md);});
    root.querySelectorAll('[data-compare-detail-values]').forEach(output=>{
      if(output.dataset.date===md)return;
      output.dataset.date=md;
      output.innerHTML=view.rows.map(row=>{const p=row.points[selected],d=p.day;return `<div class="compare-day-record"><strong>${row.year}-${esc(md)}</strong>${!p.applicable?'<p>February 29 is not a date in this year.</p>':`<dl><dt>Source</dt><dd>${d?.provisional?'Provisional recent model estimate':d?'ERA5 reanalysis estimate':'Unavailable'}</dd><dt>High / low</dt><dd>${format(d?.hi,'°F')} / ${format(d?.lo,'°F')}</dd><dt>Daily precipitation</dt><dd>${format(d?.pcp,' in',3)}</dd><dt>Rain (excludes snow)</dt><dd>${format(d?.rain,' in',3)}</dd><dt>Running total</dt><dd>${format(p.total,' in',2)}</dd><dt>Maximum wind</dt><dd>${format(d?.wind,' mph')}</dd></dl>`}</div>`;}).join('')+'<p class="small">Open-Meteo regional estimates: ERA5 history plus recent past-day model estimates. Recent values are provisional and may change when ERA5 arrives. Running totals start at this period’s beginning and become unavailable after the first missing day. Gusts are unavailable for ERA5 history.</p>';
    });
    const wateringJump=$('#compareWateringJump');if(wateringJump)wateringJump.value=String(selected);
    wateringReading(md);
    root.querySelectorAll('.compare-cursor').forEach(line=>{line.setAttribute('x1',view.x(selected));line.setAttribute('x2',view.x(selected));});
    if(reveal)root.querySelectorAll('.compare-scroll').forEach(scroll=>{const svg=scroll.querySelector('svg');scroll.scrollLeft=view.x(selected)*svg.getBoundingClientRect().width/view.w-scroll.clientWidth/2;});
  }

  function showError(error){
    console.error('[weather comparison]',error);
    view=null;
    $('#compareStatus').textContent='Could not display the comparison. Tap Refresh stored years to try again.';
    $('#compareResults').replaceChildren();
  }
  function draw(){try{render();}catch(error){showError(error);}}
  async function load(refresh=false){
    const id=++request;years=selection();errors=new Map();loading=true;$('#compareRefresh').disabled=true;
    try{
      render();
      await Promise.all(years.map(async year=>{
        try{const cached=datasets.get(year);const data=cached&&!refresh&&!HistoricalWeather.stale(cached)?cached:await HistoricalWeather.loadComparison(HistoricalWeather.context(location,year,'archive_era5'),refresh);if(id===request)datasets.set(year,data);}
        catch(e){if(id===request)errors.set(year,e.message||'Archive unavailable. Try again.');}
      }));
      if(id===request){loading=false;render();}
    }catch(error){if(id===request)showError(error);}
    finally{if(id===request){loading=false;$('#compareRefresh').disabled=false;}}
  }

  function init(){
    root=document.getElementById('weatherComparePanel');if(!root)return;
    const current=yearNow();
    $('#compareYears').innerHTML='<legend>Choose years</legend>'+Array.from({length:current-2019},(_,i)=>current-i).map(year=>`<label><input type="checkbox" data-compare-year value="${year}" ${year>=current-1?'checked':''}> ${year}</label>`).join('');
    years=selection();updateWatering();
    document.addEventListener('yard-log-change',()=>{if(updateWatering()&&root.open&&showWatering)draw();});
    root.addEventListener('toggle',event=>{if(event.target===root&&root.open&&!loading){updateWatering();if(!view||years.some(year=>HistoricalWeather.stale(datasets.get(year))))load();else if(showWatering)draw();}});
    root.addEventListener('change',event=>{
      if(event.target.matches('#compareWateringJump')){
        if(event.target.value!=='')inspect(Number(event.target.value),true,'rain');
      }else if(event.target.matches('#compareWatering')){
        showWatering=event.target.checked;
        try{localStorage.setItem(WATERING_KEY,showWatering?'1':'0');}catch(_){}
        updateWatering();draw();
      }else if(event.target.matches('[data-compare-year]')){
        const next=selection();if(!next.length){event.target.checked=!event.target.checked;$('#compareStatus').textContent='Choose at least one year.';return;}load();
      }else if(event.target.matches('#compareSeason,#compareFrom,#compareTo,#compareMatching')){
        $('#compareCustom').hidden=$('#compareSeason').value!=='custom';selected=0;draw();
      }
    });
    $('#compareRefresh').onclick=()=>load(true);
    root.addEventListener('input',event=>{
      if(event.target.matches('[data-compare-slider]'))inspect(Number(event.target.value),true,event.target.dataset.compareSlider);
      else if(event.target.matches('#compareFrom,#compareTo')){selected=0;draw();}
    });
    function pointer(event){
      const svg=event.target.closest('svg[data-compare-chart]');if(!svg||!view)return;
      const matrix=svg.getScreenCTM();if(!matrix)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      const marker=event.target.closest('[data-watering-index]');
      const index=marker?Number(marker.dataset.wateringIndex):Math.max(0,Math.min(view.period.days.length-1,Math.floor((point.x-view.left)/view.step)));
      const kind=svg.dataset.compareChart;
      inspect(index,false,kind);
      const tip=svg.closest('.compare-plot').querySelector('[data-compare-tooltip]');
      if(event.pointerType==='touch'||(event.type==='click'&&window.matchMedia('(hover: none)').matches)){tip.hidden=true;return;}
      let row;
      if(kind==='temperature')row=view.rows[Math.max(0,Math.min(view.rows.length-1,Math.floor((point.y-38)/48)))];
      else row=view.rows.filter(row=>number(row.points[index].total)).sort((a,b)=>Math.abs(view.y(a.points[index].total)-point.y)-Math.abs(view.y(b.points[index].total)-point.y))[0]||view.rows[0];
      const activeYear=hoveredYear??focusedYear??pinnedYear;
      if(kind==='rain'&&activeYear!==null)row=view.rows.find(row=>row.year===activeYear)||row;
      if(!row){tip.hidden=true;return;}
      if(marker)row=view.rows.find(row=>row.year===Number(marker.dataset.wateringYear))||row;
      const p=row.points[index];
      if(marker){tip.textContent=wateringSummary(row.year,p.md);tip.hidden=false;return;}
      tip.innerHTML=`<strong>${row.year} · ${esc(pretty(view.period.days[index]))}</strong><br>${p.day?.provisional?'<em>Provisional recent estimate</em><br>':''}${!p.applicable?'Not a date in this year':kind==='rain'?`Daily: ${format(p.day?.pcp,' in',3)}<br>Running total: ${format(p.total,' in',2)}`:`High: ${format(p.day?.hi,'°F')}<br>Low: ${format(p.day?.lo,'°F')}`}`;
      tip.hidden=false;
    }
    root.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')pointer(event);});
    root.addEventListener('click',event=>{
      const yearKey=event.target.closest('[data-compare-highlight-year]');
      if(yearKey){const year=Number(yearKey.dataset.compareHighlightYear);pinnedYear=pinnedYear===year?null:year;hoveredYear=null;focusedYear=null;highlightYear();return;}
      const marker=event.target.closest('[data-watering-index]');
      if(marker){inspect(Number(marker.dataset.wateringIndex),true,'rain');return;}
      const key=event.target.closest('[data-temperature-band]');
      if(key){pinnedBand=pinnedBand===key.dataset.temperatureBand?null:key.dataset.temperatureBand;hoverBand=null;focusBand=null;highlight();return;}
      const step=event.target.closest('[data-compare-step]');
      if(step){inspect(selected+Number(step.dataset.compareStep),true,step.dataset.chartKind);return;}
      pointer(event);
    });
    root.addEventListener('pointerover',event=>{const yearKey=event.target.closest('[data-compare-highlight-year]');if(yearKey&&event.pointerType!=='touch'){hoveredYear=Number(yearKey.dataset.compareHighlightYear);highlightYear();}const key=event.target.closest('[data-temperature-band]');if(key&&event.pointerType!=='touch'){hoverBand=key.dataset.temperatureBand;highlight();}});
    root.addEventListener('pointerout',event=>{
      const yearKey=event.target.closest('[data-compare-highlight-year]');if(yearKey&&!yearKey.contains(event.relatedTarget)){hoveredYear=null;highlightYear();}
      const key=event.target.closest('[data-temperature-band]');if(key&&!key.contains(event.relatedTarget)){hoverBand=null;highlight();}
      const plot=event.target.closest('.compare-plot');if(plot&&!plot.contains(event.relatedTarget))plot.querySelector('[data-compare-tooltip]').hidden=true;
    });
    root.addEventListener('focusin',event=>{const yearKey=event.target.closest('[data-compare-highlight-year]');if(yearKey){focusedYear=Number(yearKey.dataset.compareHighlightYear);highlightYear();}const key=event.target.closest('[data-temperature-band]');if(key){focusBand=key.dataset.temperatureBand;highlight();}});
    root.addEventListener('focusout',event=>{if(event.target.closest('[data-compare-highlight-year]')){focusedYear=null;highlightYear();}if(event.target.closest('[data-temperature-band]')){focusBand=null;highlight();}});
    root.addEventListener('scroll',event=>{if(event.target.matches('.compare-scroll'))event.target.closest('.compare-plot').querySelector('[data-compare-tooltip]').hidden=true;},true);
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){pinnedYear=null;hoveredYear=null;focusedYear=null;highlightYear();}});
    function autoRefresh(){
      if(root.open&&!loading&&!document.hidden&&Date.now()-lastInteraction>10000&&years.some(year=>HistoricalWeather.stale(datasets.get(year))))load(true);
    }
    ['input','pointerdown','keydown'].forEach(type=>root.addEventListener(type,()=>{lastInteraction=Date.now();}));
    setInterval(autoRefresh,60000);
    document.addEventListener('visibilitychange',autoRefresh);
    window.addEventListener('pageshow',autoRefresh);
    root.addEventListener('focusout',()=>setTimeout(autoRefresh,0));
    // A restored standalone page can already have an open details panel.
    if(root.open)load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
