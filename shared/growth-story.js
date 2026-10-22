/* Owner-only plant photo stories. Export is local; no upload or video encoding. */
(function(){
'use strict';
let options,dialog,plant,photos=[],selected=new Set(),index=0,timer=null,playing=false,generation=0,active=0,exporting=false;
const $=s=>dialog.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dated=p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')&&!isNaN(Date.parse(p.date+'T12:00:00Z'))&&new Date(p.date+'T12:00:00Z').toISOString().slice(0,10)===p.date;
function chosen(){return photos.filter(p=>selected.has(p.key)&&($('#gsYear').value==='all'||p.date.slice(0,4)===$('#gsYear').value));}
function milestones(date){return $('#gsMilestones').checked?(options.getLog()||[]).filter(e=>e.plantId===plant.id&&e.date===date&&/^(planted|repotted|moved|first bloom|bloom|flowered)$/i.test(e.action||'')).map(e=>e.action).filter((v,i,a)=>a.indexOf(v)===i):[];}
function status(s){$('#gsStatus').textContent=s;}
function pause(){playing=false;clearTimeout(timer);timer=null;if(dialog)$('#gsPlay').textContent='Play';}
function close(){pause();generation++;if(dialog?.open)dialog.close();plant=null;photos=[];selected.clear();if(dialog){$('#gsChoices').replaceChildren();for(const img of dialog.querySelectorAll('.gs-stage img'))img.removeAttribute('src');}}
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';const timeout=setTimeout(()=>{img.src='';reject(new Error('Photo loading timed out. Try again or exclude that photo.'));},15000);img.onload=()=>{clearTimeout(timeout);resolve(img);};img.onerror=()=>{clearTimeout(timeout);reject(new Error('A photo could not be read for export. Check the image or photo-storage CORS settings.'));};img.src=url;});}
async function showFrame(){
 if(!options.isAuthed()){close();return;}
 const list=chosen(),token=++generation;if(!list.length){pause();$('#gsCaption').textContent='Select dated photos to begin.';for(const img of dialog.querySelectorAll('.gs-stage img')){img.style.opacity='0';img.setAttribute('aria-hidden','true');}return;}
 index=Math.max(0,Math.min(index,list.length-1));const photo=list[index],imgs=dialog.querySelectorAll('.gs-stage img'),next=active===0?1:0;
 const img=imgs[next];img.style.opacity='0';img.alt=`${plant.name} · ${photo.date}`;
 try {await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{img.onload=img.onerror=null;reject(new Error('Photo loading timed out.'));},15000);img.onload=()=>{clearTimeout(timeout);resolve();};img.onerror=()=>{clearTimeout(timeout);reject(new Error('Photo unavailable; exclude it to continue.'));};img.src=options.photoUrl(photo.key);});
  if(token!==generation||!dialog.open||!options.isAuthed())return;
  imgs[active].style.opacity='0';imgs[active].setAttribute('aria-hidden','true');img.style.opacity='1';img.setAttribute('aria-hidden','false');active=next;
  $('#gsCaption').textContent=`${photo.date} · ${index+1} / ${list.length}${milestones(photo.date).length?' · '+milestones(photo.date).join(' · '):''}`;
  $('#gsScrub').max=String(list.length-1);$('#gsScrub').value=String(index);
  if(playing)timer=setTimeout(()=>{if(!options.isAuthed()){close();return;}index=(index+1)%list.length;showFrame();},Number($('#gsSpeed').value));
 }catch(e){if(token===generation&&dialog.open){pause();status(e.message);}}
}
function update(){
 if(!options.isAuthed()){close();return;}
 pause();generation++;const list=chosen();index=0;
 $('#gsExport').disabled=exporting||list.length<4||list.length>9;$('#gsPlay').disabled=list.length<2;
 status(`${list.length} photos selected for this range. Collage export needs 4–9. Choose similar viewpoints manually; photos are not automatically aligned.`);
 showFrame();
}
function renderChoices(){
 if(!options.isAuthed()){close();return;}
 const year=$('#gsYear').value,list=photos.filter(p=>year==='all'||p.date.slice(0,4)===year);
 $('#gsChoices').innerHTML=list.map(p=>`<label><input type="checkbox" value="${esc(p.key)}" ${selected.has(p.key)?'checked':''}><img src="${esc(options.photoUrl(p.key+'.thumb.jpg'))}" loading="lazy" alt=""><span>${esc(p.date)}${p.caption?' · '+esc(p.caption):''}</span></label>`).join('')||'<p>No dated photos in this range.</p>';
}
async function exportCollage(){
 if(!options.isAuthed()||exporting||!plant)return;const list=chosen();if(list.length<4||list.length>9)return;
 const sessionPlant=plant,photoList=list.slice(),captions=photoList.map(p=>milestones(p.date)),token=++generation;pause();exporting=true;$('#gsExport').disabled=true;status('Loading full photos for collage…');
 try{
  const images=await Promise.all(photoList.map(p=>loadImage(options.photoUrl(p.key))));
  if(!options.isAuthed()||!dialog.open||plant!==sessionPlant||token!==generation)return;
  const cols=photoList.length===4?2:3,w=1800,gap=24,pad=48,header=160,tileW=(w-pad*2-gap*(cols-1))/cols,tileH=440,rows=Math.ceil(photoList.length/cols);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=header+rows*(tileH+gap)+64;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas export is unavailable in this browser.');
  ctx.fillStyle='#f4f1e9';ctx.fillRect(0,0,w,canvas.height);ctx.fillStyle='#213f30';ctx.font='bold 44px sans-serif';ctx.fillText(sessionPlant.name.slice(0,70),pad,70,w-pad*2);ctx.font='24px sans-serif';ctx.fillText(`Growth story · ${photoList[0].date} → ${photoList[photoList.length-1].date}`,pad,118);
  images.forEach((img,i)=>{const x=pad+(i%cols)*(tileW+gap),y=header+Math.floor(i/cols)*(tileH+gap),imageH=tileH-86;
   ctx.fillStyle='#e2e4dd';ctx.fillRect(x,y,tileW,imageH);const scale=Math.min(tileW/img.naturalWidth,imageH/img.naturalHeight),iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(tileW-iw)/2,y+(imageH-ih)/2,iw,ih);
   ctx.fillStyle='#213f30';ctx.font='bold 23px sans-serif';ctx.fillText(photoList[i].date,x,y+imageH+32,tileW);ctx.font='20px sans-serif';ctx.fillText(captions[i].join(' · ').slice(0,90),x,y+imageH+62,tileW);
  });
  ctx.fillStyle='#516157';ctx.font='20px sans-serif';ctx.fillText('satownsend.com · Dated photos; milestone captions use matching recorded log dates.',pad,canvas.height-22,w-pad*2);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create the PNG.');
  if(!options.isAuthed()||!dialog.open||plant!==sessionPlant||token!==generation)return;
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${sessionPlant.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')}-growth-story.png`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Collage downloaded. Full photos were fitted without cropping.');
 }catch(e){if(dialog.open&&plant===sessionPlant)status('Export failed: '+e.message);}
 finally{exporting=false;if(dialog?.open)$('#gsExport').disabled=chosen().length<4||chosen().length>9;}
}
function open(){
 if(!options.isAuthed())return;plant=options.getPlant();if(!plant)return;
 const all=options.getPhotos(plant)||[];photos=[...new Map(all.filter(p=>p.key&&!p.hideFromGallery&&dated(p)).map(p=>[p.key,p])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
 selected=new Set(photos.map(p=>p.key));$('#gsTitle').textContent=plant.name+' · Growth story';
 $('#gsYear').innerHTML='<option value="all">All years</option>'+[...new Set(photos.map(p=>p.date.slice(0,4)))].map(y=>`<option>${y}</option>`).join('');
 $('#gsExcluded').textContent=`${all.filter(p=>!p.hideFromGallery&&!dated(p)).length} undated/invalid-date photos excluded. Hidden gallery photos are excluded. Milestones are shown only when their log date matches a selected photo.`;
 dialog.showModal();renderChoices();update();
}
function init(config){
 options=config;const style=document.createElement('style');style.textContent=`
 body.view-only #growthStoryBtn{display:none!important}.gs-dialog{width:min(960px,calc(100vw - 32px));max-height:90vh;box-sizing:border-box;overflow:auto;background:var(--panel,#142320);color:var(--ink,#eee);border:1px solid var(--line2,#555);border-radius:14px;padding:22px}.gs-dialog::backdrop{background:#000b}.gs-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.gs-head h2{margin:0}.gs-stage{position:relative;height:min(50vh,450px);background:#080d0b;border-radius:8px;margin:14px 0;overflow:hidden}.gs-stage img{position:absolute;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .45s ease}.gs-tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.gs-tools label{display:flex;gap:6px;align-items:center;font-size:13px}.gs-tools select{width:auto}.gs-dialog input[type=range]{width:100%}.gs-choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-top:12px;max-height:300px;overflow:auto}.gs-choices label{display:grid;grid-template-columns:20px 1fr;gap:6px;border:1px solid var(--line2,#555);border-radius:7px;padding:8px;font-size:12px;cursor:pointer}.gs-choices img{width:100%;height:100px;object-fit:contain;background:#080d0b}.gs-choices span{grid-column:1/-1}.gs-choices input{width:18px;height:18px}.gs-dialog summary{cursor:pointer;padding:8px 0;font-weight:600}.gs-dialog button:focus-visible,.gs-dialog select:focus-visible{outline:2px solid var(--accent,#8fc);outline-offset:2px}@media(prefers-reduced-motion:reduce){.gs-stage img{transition:none}}`;
 document.head.appendChild(style);dialog=document.createElement('dialog');dialog.className='gs-dialog';dialog.setAttribute('aria-labelledby','gsTitle');
 dialog.innerHTML=`<div class="gs-head"><h2 id="gsTitle">Growth story</h2><button type="button" id="gsClose" aria-label="Close growth story">×</button></div><p class="small">Owner-only slideshow and collage. Choose photos from the same viewpoint for the clearest growth story.</p><div class="gs-tools"><label>Range <select id="gsYear"></select></label><label>Speed <select id="gsSpeed"><option value="1000">1 second</option><option value="1500" selected>1.5 seconds</option><option value="3000">3 seconds</option><option value="5000">5 seconds</option></select></label><label><input type="checkbox" id="gsMilestones"> Recorded milestones</label></div><div class="gs-stage"><img alt=""><img alt=""></div><div class="gs-tools"><button type="button" id="gsPrev" aria-label="Previous story photo">←</button><button type="button" id="gsPlay">Play</button><button type="button" id="gsNext" aria-label="Next story photo">→</button><span id="gsCaption" class="small"></span></div><input type="range" id="gsScrub" min="0" max="0" value="0" aria-label="Story photo"><details><summary>Choose photos</summary><div class="gs-tools"><button type="button" id="gsAll">Select range</button><button type="button" id="gsNone">Clear range</button><button type="button" id="gsNine">Choose up to 9 evenly spaced photos</button></div><p class="small" id="gsExcluded"></p><div id="gsChoices" class="gs-choices"></div></details><p id="gsStatus" class="small" role="status"></p><button type="button" id="gsExport">Download collage PNG (4–9 photos)</button>`;
 document.body.appendChild(dialog);document.getElementById('growthStoryBtn').hidden=!options.isAuthed();document.getElementById('growthStoryBtn').onclick=open;$('#gsClose').onclick=close;dialog.addEventListener('cancel',close);dialog.addEventListener('close',()=>{pause();generation++;});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 $('#gsYear').onchange=()=>{renderChoices();update();};$('#gsSpeed').onchange=()=>{pause();};$('#gsMilestones').onchange=()=>{pause();showFrame();};
 $('#gsPlay').onclick=()=>{if(!options.isAuthed()){close();return;}if(playing)pause();else if(chosen().length>=2){playing=true;$('#gsPlay').textContent='Pause';showFrame();}};
 for(const [id,step]of [['gsPrev',-1],['gsNext',1]])$('#'+id).onclick=()=>{pause();const n=chosen().length;if(!n)return;index=(index+step+n)%n;showFrame();};$('#gsScrub').oninput=()=>{pause();index=Number($('#gsScrub').value);showFrame();};
 $('#gsChoices').onchange=e=>{if(e.target.type!=='checkbox')return;if(e.target.checked)selected.add(e.target.value);else selected.delete(e.target.value);update();};
 function range(){return photos.filter(p=>$('#gsYear').value==='all'||p.date.slice(0,4)===$('#gsYear').value);}
 $('#gsAll').onclick=()=>{range().forEach(p=>selected.add(p.key));renderChoices();update();};$('#gsNone').onclick=()=>{range().forEach(p=>selected.delete(p.key));renderChoices();update();};$('#gsNine').onclick=()=>{const list=range();list.forEach(p=>selected.delete(p.key));const count=Math.min(9,list.length);for(let i=0;i<count;i++)selected.add(list[Math.round(i*(list.length-1)/Math.max(1,count-1))].key);renderChoices();update();};$('#gsExport').onclick=exportCollage;
}
window.GrowthStory={init,close};
})();
