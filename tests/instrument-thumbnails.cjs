'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('instruments/index.html','utf8');
const between=(start,end)=>page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start)));
const helpers=between('function isInstrumentImage(', '/* ── Category / type filters');
const sheetCode=between('function instrumentSheetColumn(', "$('#editBtn').onclick");
const controls=between('let thumbnailSaving = false;',"$('#lightboxThumbnail').addEventListener");
const fixture={instruments:[{id:'guitar',make:'Fender',model:'Strat',thumbKey:'chosen.jpg'},{id:'bass',make:'Ibanez',model:'Bass'}],photos:[{instrument_id:'guitar',key:'clip.mp4'},{instrument_id:'guitar',key:'first.jpg'},{instrument_id:'guitar',key:'chosen.jpg'},{instrument_id:'bass',key:'bass.jpg'}]};
function setup(){
 const state=JSON.parse(JSON.stringify(fixture));state._lightboxPhotos=[state.photos[1],state.photos[2]];state._currentInstrumentId='guitar';
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,setAttribute(key,value){this[key]=value;}});return nodes.get(id);};
 const context={state,$,lightboxIdx:1,isGsAuthed:()=>true,photosFor:id=>state.photos.filter(p=>p.instrument_id===id),r2PublicUrl:key=>'https://photos.invalid/'+key,escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),renderInstruments(){},renderInstrumentPhotos(){},alert:message=>{context.lastAlert=message}};
 vm.createContext(context);vm.runInContext(helpers+controls,context);return{context,state,$};
}
(async()=>{
 let e=setup(),i=e.state.instruments[0];
 assert.equal(e.context.instrumentThumbnail(i).key,'chosen.jpg');i.thumbKey='missing.jpg';assert.equal(e.context.instrumentThumbnail(i).key,'first.jpg');i.thumbKey='clip.mp4';assert.equal(e.context.instrumentThumbnail(i).key,'first.jpg');i.thumbKey='bass.jpg';assert.equal(e.context.instrumentThumbnail(i).key,'first.jpg');
 assert.equal(e.context.instrumentThumbnail({id:'empty'}),null);assert.equal(e.context.isInstrumentImage({key:'video.MOV?download=1'}),false);
 const html=e.context.instrumentThumbnailMarkup(i);assert.match(html,/first.jpg.thumb.jpg/);assert.match(html,/data-full-src="https:\/\/photos.invalid\/first.jpg"/);assert.match(html,/aria-label="Open Fender Strat"/);
 assert.match(e.context.instrumentThumbnailMarkup({id:'empty'}),/No instrument photo/);
 let broken=false;const img={dataset:{fullSrc:'original.jpg'},closest:()=>({classList:{add(){broken=true}}})};e.context.instrumentThumbnailError(img);assert.equal(img.src,'original.jpg');e.context.instrumentThumbnailError(img);assert.equal(img.hidden,true);assert.equal(broken,true);
 // A successful selection is committed only after the Sheet update; toggling again resets automatic choice.
 let writes=[];e=setup();e.state.instruments[0].thumbKey='';e.context.gsSetInstrumentThumbnail=async(id,key)=>writes.push({id,key});await e.context.saveInstrumentThumbnail();assert.equal(e.state.instruments[0].thumbKey,'chosen.jpg');assert.equal(writes[0].id,'guitar');assert.equal(writes[0].key,'chosen.jpg');
 await e.context.saveInstrumentThumbnail();assert.equal(e.state.instruments[0].thumbKey,'');assert.equal(writes[1].key,'');
 e.context.gsSetInstrumentThumbnail=async()=>{throw Error('offline')};await e.context.saveInstrumentThumbnail();assert.equal(e.state.instruments[0].thumbKey,'');assert.match(e.context.lastAlert,/offline/);assert.equal(e.$('#lightboxThumbnail').disabled,false);
 e.context.isGsAuthed=()=>false;writes=[];e.context.gsSetInstrumentThumbnail=async(...args)=>writes.push(args);await e.context.saveInstrumentThumbnail();e.context.updateThumbnailBtn(e.state._lightboxPhotos[1]);assert.equal(writes.length,0);assert.equal(e.$('#lightboxThumbnail').hidden,true);
 // Old sheets gain only a new header/cell, preserving custom columns and other instruments.
 async function sheets(rows,columnCount=26){
   const e=setup(),calls=[];e.context.GAuth={token:()=> 'test-only'};e.context.SHEET_ID='test';
   e.context.fetch=async(url,opts)=>{calls.push({url,opts});if(url.includes('majorDimension'))return{ok:true,json:async()=>({values:rows})};if(url.includes('?fields='))return{ok:true,json:async()=>({sheets:[{properties:{sheetId:0,title:'instruments',gridProperties:{columnCount}}}]})};return{ok:true};};
   vm.runInContext(sheetCode,e.context);return{...e,calls};
 }
 let sh=await sheets([['id','make','custom'],['guitar','Fender','keep'],['bass','Ibanez','keep too']]);await sh.context.gsSetInstrumentThumbnail('guitar','chosen.jpg');
 let body=JSON.parse(sh.calls.at(-1).opts.body);assert.equal(body.data.length,2);assert.equal(body.data[0].range,'instruments!D1');assert.equal(body.data[1].range,'instruments!D2');assert.deepEqual(body.data[1].values,[['chosen.jpg']]);assert.ok(!sh.calls.some(c=>c.url.includes(':clear')));
 sh=await sheets([['id','make','thumbKey','custom'],['guitar','Fender','chosen.jpg','keep']]);await sh.context.gsUpdateRow('guitar',{make:'New make'});body=JSON.parse(sh.calls.at(-1).opts.body);assert.deepEqual(body.values[0],['guitar','New make','chosen.jpg','keep']);
 // Existing thumbnail writes touch only that cell, including resets; column addressing works past Z.
 sh.calls.length=0;await sh.context.gsSetInstrumentThumbnail('guitar','');body=JSON.parse(sh.calls.at(-1).opts.body);assert.equal(body.data.length,1);assert.equal(body.data[0].range,'instruments!C2');assert.deepEqual(body.data[0].values,[['']]);assert.equal(sh.context.instrumentSheetColumn(26),'AA');
 const headers=['id',...Array.from({length:25},(_,i)=>'custom'+i)];sh=await sheets([headers,['guitar']],26);await sh.context.gsSetInstrumentThumbnail('guitar','chosen.jpg');assert.ok(sh.calls.some(c=>c.opts?.body?.includes('columnCount')));assert.equal(JSON.parse(sh.calls.at(-1).opts.body).data[1].range,'instruments!AA2');
 sh=await sheets([['id'],['other']]);await assert.rejects(()=>sh.context.gsSetInstrumentThumbnail('guitar','chosen.jpg'),/not found/);assert.ok(!sh.calls.some(c=>c.opts.method));
 sh.context.GAuth.token=()=>'';await assert.rejects(()=>sh.context.gsSetInstrumentThumbnail('guitar','chosen.jpg'),/Not signed in/);
 // Deleting a preferred photo or uploading the first photo needs no migration to select an available fallback.
 e=setup();e.state.photos=e.state.photos.filter(p=>p.key!=='chosen.jpg');assert.equal(e.context.instrumentThumbnail(e.state.instruments[0]).key,'first.jpg');e.state.photos.push({instrument_id:'empty',key:'new.jpg'});assert.equal(e.context.instrumentThumbnail({id:'empty'}).key,'new.jpg');
 console.log('PASS instrument thumbnails: selection/fallback, videos, missing photos, image failures, auth guards, successful/reset/failed saves, additive sheet migration, custom-column preservation, and column growth');
})().catch(error=>{console.error(error);process.exitCode=1});
