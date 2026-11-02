const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../shared/wildlife-photo-sightings.js');
const today = '2026-11-01';
const old = {id:'old', species:'Pileated Woodpecker', category:'Bird', date:'2026-05-06', notes:'Keep me'};
const result = api.plan([old], {species:old.species,date:'2026-10-31'}, today);
assert.equal(result.create,true);
assert.equal(result.sighting.date,'2026-10-31');
assert.equal(result.sighting.location,'');
assert.equal(api.plan([old,result.sighting],{species:' pileated  WOODPECKER ',date:'2026-10-31'},today).create,false);
assert.equal(old.notes,'Keep me');
const photos=[{sighting_id:'old',key:'one',date:'2026-10-31'},{sighting_id:'old',key:'two',date:'2026-10-31'},{sighting_id:'old',key:'three',date:'2026-10-30'}];
const backfill=api.reconcile([old],photos,today);
assert.equal(backfill.created.length,2);assert.equal(backfill.links.length,3);
const fixed=photos.map((p,i)=>({...p,sighting_id:backfill.links.find(l=>l.index===i)?.sightingId||p.sighting_id}));
assert.deepEqual(api.reconcile([old,...backfill.created],fixed,today),{created:[],links:[],skipped:[]});
const same={...result.sighting,id:'another'};
assert.equal(api.plan([result.sighting,same],{species:old.species,date:same.date,preferredId:'another'},today).sighting.id,'another');
assert.equal(api.captureDate({filename:'IMG_20261031.jpg',today}).date,'2026-10-31');
assert.equal(api.captureDate({exif:'2026-10-30',filename:'20261031.jpg',today}).date,'2026-10-30');
assert.equal(api.captureDate({override:'2026-10-29',exif:'2026-10-30',today}).date,'2026-10-29');
for(const date of ['2026-02-30','2026-11-02','']) assert.throws(()=>api.plan([old],{species:old.species,date},today));
assert.throws(()=>api.captureDate({filename:'IMG_0123.jpg',today}));
assert.equal(api.reconcile([old],[{sighting_id:'old',key:'x',date:'2026-11-02'}],today).skipped.length,1);
const requests=api.appendRequests(result,photos[0],{sightings:0,wildlife_photos:1});
assert.equal(requests.length,2);assert.equal(requests[0].appendCells.rows[0].values[3].userEnteredValue.stringValue,'2026-10-31');
assert.equal(api.appendRequests({...result,create:false},photos[0],{wildlife_photos:1}).length,1);
const html=fs.readFileSync(require.resolve('../wildlife/index.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const commit=html.slice(html.indexOf('async function commitWildlifeUpload('),html.indexOf('function refreshWildlifeViews('));
async function checkCommit(mode){
  const state={sightings:[old],photos:[]};let posted;
  const context={state,GAuth:{token:()=> 'fixture'},SHEET_ID:'fixture',TABS:{sightings:0,wildlife_photos:1},WildlifePhotoSightings:api,
    fetch:async(url,options)=>{posted=JSON.parse(options.body);if(mode==='lost')throw Error('Lost response');return {ok:mode==='ok',status:503};},
    wildlifeSheetRows:async tab=>tab==='sightings'?[['id','species','category','date'],[result.sighting.id,old.species,old.category,'2026-10-31']]:[['sighting_id','key','date'],...(mode==='lost'?[[result.sighting.id,'one','2026-10-31']]:[])],
    csvToObjects:rows=>rows.slice(1).map(row=>Object.fromEntries(rows[0].map((key,i)=>[key,row[i]||'']))) };
  vm.createContext(context);vm.runInContext(commit,context);
  const photo={...photos[0],sighting_id:result.sighting.id};
  if(mode==='fail'){await assert.rejects(context.commitWildlifeUpload(result,photo));assert.equal(state.photos.length,0);}
  else{await context.commitWildlifeUpload(result,photo);assert.equal(state.photos.length,1);assert(state.sightings.some(r=>r.id===result.sighting.id));}
  assert.equal(posted.requests.length,2);
}
(async()=>{for(const mode of ['ok','fail','lost'])await checkCommit(mode);console.log('Wildlife photo sightings: date matching, backfill, atomic save, and recovery passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
