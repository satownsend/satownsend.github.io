/* Compare the same local calendar dates from the permanent Lilly ERA5 archive. */
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
  const exists=(year,md)=>monthDay(HistoricalWeather.shift(`${year}-${md}`,0))===md;
  const pretty=md=>new Date(`2000-${md}T12:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  const color=hi=>!number(hi)?'unknown':hi<=32?'freezing':hi<=50?'cool':hi<=70?'mild':hi<=85?'warm':'hot';
  const colors=['var(--accent)','var(--accent2)','var(--cool)','#b58de8','#ef82b4','#d6b955','#84ba68'];
  const yearColor=year=>colors[year-2020]||`hsl(${((year-2020)*137.508)%360} 60% 48%)`;
  const yearDash=year=>['none','8 4','2 4'][(year-2020)%3];
  const yearBorder=year=>['solid','dashed','dotted'][(year-2020)%3];
  const ranges={full:['01-01','12-31'],spring:['03-01','05-31'],summer:['06-01','08-31'],autumn:['09-01','11-30']};
  let root,years=[],datasets=new Map(),errors=new Map(),request=0,loading=false,selected=0,view=null;
  const $=s=>root.querySelector(s);
  function selection(){return [...root.querySelectorAll('[data-compare-year]:checked')].map(el=>Number(el.value)).sort((a,b)=>a-b);}
  function range(){
    let [from,to]=ranges[$('#compareSeason').value]||[$('#compareFrom').value.trim(),$('#compareTo').value.trim()];
    if(!slots.includes(from)||!slots.includes(to)||from>to)throw new Error('Enter a start and end as MM-DD, within one calendar year (for example, 10-01 to 12-31).');
    const notes=[],matching=$('#compareMatching').checked;
    if(!matching)notes.push('Showing the entire selected period; dates before the archive began, future dates and missing records remain unavailable.');
    if(matching&&years.includes(2020)&&from<'10-01'){from='10-01';notes.push('2020 starts on October 1, your move-in date; all years use that same starting date.');}
    if(matching&&years.includes(yearNow())){
      const data=datasets.get(yearNow()),cutoff=data?.archive?.cutoff||HistoricalWeather.shift(HistoricalWeather.dateAt(Date.now(),location.timezone),-6);
      if(cutoff.slice(0,4)!==String(yearNow())){to='00-00';}
      else if(to>monthDay(cutoff)){to=monthDay(cutoff);notes.push(`All years stop at ${pretty(to)}, the current archive cutoff (${cutoff}).`);}
    }
    return {from,to,notes,days:slots.filter(md=>md>=from&&md<=to)};
  }
  function series(year,days){
    const map=new Map((datasets.get(year)?.items||[]).map(d=>[monthDay(d.date),d]));
    let sum=0,intact=true,available=0,temperatures=0,expected=0;
    const points=days.map(md=>{
      if(!exists(year,md))return {md,applicable:false};
      expected++;
      const day=map.get(md)||null;
      if(number(day?.hi))temperatures++;
      if(number(day?.pcp)){sum+=day.pcp;available++;}else intact=false;
      return {md,applicable:true,day,total:intact?sum:null};
    });
    return {year,points,available,temperatures,expected,sum,complete:expected>0&&available===expected};
  }
  function render(){
    let period;
    try{period=range();}catch(e){$('#compareStatus').textContent=e.message;$('#compareResults').innerHTML='';view=null;return;}
    if(!period.days.length){$('#compareStatus').textContent='This period has no completed, archived dates in common. Choose a different period or change the years.';$('#compareResults').innerHTML='';view=null;return;}
    const rows=years.map(y=>series(y,period.days)),w=Math.max(680,period.days.length*3+100),left=76,right=24,plot=w-left-right,step=plot/period.days.length;
    const x=i=>left+(i+.5)*step;
    selected=Math.min(selected,period.days.length-1);
    view={period,rows,w,left,step,x};
    const ticks=period.days.map((md,i)=>({md,i})).filter(({md,i})=>i===0||md.endsWith('-01'));
    const labels=(y)=>ticks.map(({md,i})=>`<text x="${left+i*step}" y="${y}">${esc(new Date(`2000-${md}T12:00:00Z`).toLocaleDateString(undefined,{month:'short',timeZone:'UTC'}))}</text>`).join('');
    const heatHeight=35+rows.length*48;
    const heat=rows.map((row,r)=>`<text x="8" y="${58+r*48}">${row.year}</text>${row.points.map((p,i)=>`<rect x="${left+i*step}" y="${38+r*48}" width="${Math.max(.5,step-.4)}" height="28" class="wc-${p.applicable?color(p.day?.hi):'not-date'}"><title>${esc(`${row.year}-${p.md}: ${p.applicable?'estimated high '+format(p.day?.hi,'°F'):'not a date in this year'}`)}</title></rect>`).join('')}`).join('');
    const max=Math.max(1,...rows.flatMap(row=>row.points.map(p=>p.total||0))),ceil=Math.ceil(max/4)*4,h=290,top=24,bottom=48,plotH=h-top-bottom,y=n=>top+(ceil-n)*plotH/ceil;
    let grid='';
    for(let i=0;i<=4;i++){const n=ceil*i/4;grid+=`<line x1="${left}" x2="${w-right}" y1="${y(n)}" y2="${y(n)}" class="compare-grid"/><text x="${left-10}" y="${y(n)+5}" text-anchor="end">${n.toFixed(1)} in</text>`;}
    grid+=ticks.map(({i})=>`<line x1="${left+i*step}" x2="${left+i*step}" y1="${top}" y2="${h-bottom}" class="compare-grid"/>`).join('');
    const lines=rows.map((row,r)=>{
      let path='',last=false;
      const points=row.points.map((p,i)=>{
        if(!p.applicable)return '';
        if(!number(p.total)){last=false;return '';}
        path+=`${last?'L':'M'}${x(i).toFixed(2)},${y(p.total).toFixed(2)} `;last=true;
        return `<circle cx="${x(i)}" cy="${y(p.total)}" r="2" fill="${yearColor(row.year)}"/>`;
      }).join('');
      return `<path d="${path}" fill="none" stroke="${yearColor(row.year)}" stroke-width="3" stroke-dasharray="${yearDash(row.year)}"/>${points}`;
    }).join('');
    const summaries=rows.map((row,r)=>`<p><span class="compare-year-key" style="--year-color:${yearColor(row.year)}">${row.year}</span> · Daily highs ${row.temperatures}/${row.expected} days · Precipitation ${row.available}/${row.expected} days · ${row.complete?'Total':'Available-day sum'}: <strong>${row.available?format(row.sum,' in',2):'unavailable'}</strong>${row.complete?'':' (incomplete; totals cannot be compared)'}${errors.has(row.year)?` · ${esc(errors.get(row.year))}`:''}</p>`).join('');
    $('#compareStatus').textContent=`${loading?'Loading stored years… ':''}${pretty(period.from)}–${pretty(period.to)} in each selected year. ${period.notes.join(' ')} Missing archive months appear as gaps while the background import continues.`;
    $('#compareResults').innerHTML=`<h3>Daily high temperatures</h3><div class="wc-legend small"><span class="wc-freezing">32°F and below</span><span class="wc-cool">32°F to 50°F</span><span class="wc-mild">50°F to 70°F</span><span class="wc-warm">70°F to 85°F</span><span class="wc-hot">Above 85°F</span><span class="wc-unknown">Unavailable</span></div><div class="compare-scroll" tabindex="0" role="region" aria-label="Temperature calendar; scroll horizontally"><svg data-compare-chart class="compare-chart" style="--comparison-width:${w}px" viewBox="0 0 ${w} ${heatHeight}" role="img" aria-label="Daily estimated high temperature by year. Inspect dates using the slider below.">${labels(22)}${heat}<line class="compare-cursor" x1="${x(selected)}" x2="${x(selected)}" y1="30" y2="${heatHeight}"/></svg></div><label class="compare-date-selector">Inspect date <input id="compareDate" type="range" min="0" max="${period.days.length-1}" value="${selected}" step="1" aria-label="Inspect comparison date"></label><div id="compareReading" class="compare-reading" aria-live="polite" aria-atomic="true"></div><h3>Accumulated precipitation</h3><div class="compare-line-legend">${rows.map((row,r)=>`<span class="compare-year-key" style="--year-color:${yearColor(row.year)};border-bottom-style:${yearBorder(row.year)}">${row.year}</span>`).join('')}</div><p class="small">Each line starts from zero at the beginning of this period. Total precipitation includes rain and snow water equivalent. A line stops at the first unavailable day, because its later total is unknown.</p><div class="compare-scroll" tabindex="0" role="region" aria-label="Accumulated precipitation chart; scroll horizontally"><svg data-compare-chart class="compare-chart" style="--comparison-width:${w}px" viewBox="0 0 ${w} ${h}" role="img" aria-label="Accumulated estimated precipitation in inches by year. Exact date values are available using the date slider.">${grid}${lines}${labels(h-20)}<line class="compare-cursor" x1="${x(selected)}" x2="${x(selected)}" y1="${top}" y2="${h-bottom}"/></svg></div><div class="compare-summaries">${summaries}</div><p class="small">Hover or tap either chart to inspect the same date across years, or use the date slider and arrow keys. Leap years include February 29; other years leave that slot empty. Weather estimates describe regional conditions, not backyard measurements or the cause of a plant’s performance.</p><details><summary>Daily comparison data</summary><div class="hourly-scroll" tabindex="0" role="region" aria-label="Year comparison daily data"><table><thead><tr><th scope="col">Date</th>${rows.map(r=>`<th scope="col">${r.year} high (°F)</th><th scope="col">${r.year} precip. (in)</th><th scope="col">${r.year} running total (in)</th>`).join('')}</tr></thead><tbody>${period.days.map((md,i)=>`<tr><th scope="row">${esc(pretty(md))}</th>${rows.map(row=>{const p=row.points[i];return p.applicable?`<td>${esc(format(p.day?.hi,''))}</td><td>${esc(format(p.day?.pcp,'',3))}</td><td>${esc(format(p.total,'',2))}</td>`:'<td>Not a date</td><td>Not a date</td><td>Not a date</td>';}).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    inspect(selected);
  }
  function inspect(index,reveal=false){
    if(!view)return;
    selected=Math.max(0,Math.min(view.period.days.length-1,index));
    const md=view.period.days[selected],readings=view.rows.map(row=>{
      const p=row.points[selected];
      return `${row.year}: ${p.applicable?`high ${format(p.day?.hi,'°F')}, precipitation ${format(p.day?.pcp,' in',3)}, accumulated ${format(p.total,' in',2)}`:'February 29 is not a date in this year'}`;
    });
    const text=`${pretty(md)} · ${readings.join(' · ')}`,output=$('#compareReading');
    if(output.textContent!==text)output.textContent=text;
    const slider=$('#compareDate');slider.value=selected;slider.setAttribute('aria-valuetext',text);
    root.querySelectorAll('.compare-cursor').forEach(line=>{line.setAttribute('x1',view.x(selected));line.setAttribute('x2',view.x(selected));});
    if(reveal)root.querySelectorAll('.compare-scroll').forEach(scroll=>{const svg=scroll.querySelector('svg');scroll.scrollLeft=view.x(selected)*svg.getBoundingClientRect().width/view.w-scroll.clientWidth/2;});
  }
  async function load(refresh=false){
    const id=++request;years=selection();errors=new Map();loading=true;$('#compareRefresh').disabled=true;
    render();
    await Promise.all(years.map(async year=>{
      try{const cached=datasets.get(year);const data=cached&&!refresh&&!HistoricalWeather.stale(cached)?cached:await HistoricalWeather.load(HistoricalWeather.context(location,year,'archive_era5'),'daily','',refresh);if(id===request)datasets.set(year,data);}
      catch(e){if(id===request)errors.set(year,e.message||'Archive unavailable. Try again.');}
    }));
    if(id!==request)return;
    loading=false;$('#compareRefresh').disabled=false;render();
  }
  function init(){
    root=document.getElementById('weatherComparePanel');if(!root)return;
    const current=yearNow();
    $('#compareYears').innerHTML='<legend>Choose years</legend>'+Array.from({length:current-2019},(_,i)=>current-i).map(year=>`<label><input type="checkbox" data-compare-year value="${year}" ${year>=current-1?'checked':''}> ${year}</label>`).join('');
    years=selection();
    root.addEventListener('toggle',()=>{if(root.open&&!view)load();});
    root.addEventListener('change',event=>{
      if(event.target.matches('[data-compare-year]')){
        const next=selection();if(!next.length){event.target.checked=!event.target.checked;$('#compareStatus').textContent='Choose at least one year.';return;}load();
      }else if(event.target.matches('#compareSeason,#compareFrom,#compareTo,#compareMatching')){
        $('#compareCustom').hidden=$('#compareSeason').value!=='custom';selected=0;render();
      }
    });
    $('#compareRefresh').onclick=()=>load(true);
    root.addEventListener('input',event=>{
      if(event.target.id==='compareDate')inspect(Number(event.target.value),true);
      else if(event.target.matches('#compareFrom,#compareTo')){selected=0;render();}
    });
    function pointer(event){
      const svg=event.target.closest('svg[data-compare-chart]');if(!svg||!view)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      inspect(Math.floor((point.x-view.left)/view.step));
    }
    root.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')pointer(event);});root.addEventListener('click',pointer);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
