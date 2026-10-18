const assert=require('node:assert/strict');
const model=require('../backyard-year/model.js');
assert.deepEqual(model.parseCSV('\uFEFFid,note\r\n1,"hello, ""garden""\nnext line"'),[{id:'1',note:'hello, "garden"\nnext line'}]);
assert.equal(model.date('2025-02-29'),'');assert.equal(model.date('2024-02-29'),'2024-02-29');
const data={plants:[{id:'maple',name:'Maple',planted:'2026-04-02'},{id:'wish',wishlist:'TRUE'}],plantPhotos:[
 {key:'spring.jpg',plant_id:'maple',date:'2026-04-01'},{key:'autumn.jpg',plant_id:'maple',date:'2026-10-01'},
 {key:'hidden.jpg',plant_id:'maple',date:'2026-04-01',hideFromGallery:'TRUE'},{key:'yard.jpg',plant_id:'yard',date:'2026-04-01'},
 {key:'wish.jpg',plant_id:'wish',date:'2026-04-01'},{key:'orphan.jpg',plant_id:'unknown',date:'2026-04-01'},
 {key:'video.MOV',plant_id:'maple',date:'2026-04-01'},{key:'future.jpg',plant_id:'maple',date:'2026-12-01'}],
 sightings:[{id:'bird',species:'Robin',date:'2026-05-01',location:'Garden'}],wildlifePhotos:[{key:'bird.jpg',sighting_id:'bird',date:'2026-05-01'}],
 log:[{plantId:'maple',action:'trunk measurement',date:'2026-04-01',value:'10',note:'Base'},{plantId:'maple',action:'trunk measurement',date:'2026-09-01',value:'12',note:'base'},
 {plantId:'maple',action:'trunk measurement',date:'2026-09-02',value:'4',note:'Below branch'},
 {plantId:'maple',action:'trunk measurement',date:'2026-09-03',value:'5',note:''},{plantId:'maple',action:'trunk measurement',date:'2026-09-04',value:'6',note:''},
 {plantId:'yard',action:'note',date:'2026-04-01'},{plantId:'wish',action:'planted',date:'2026-04-01'}]};
const state=model.build(data,'2026-10-17'),year=model.recap(state,2026);
assert.deepEqual(state.photos.map(p=>p.key),['spring.jpg','bird.jpg','autumn.jpg']);
assert.equal(year.plantsPhotographed,1);assert.equal(year.visitors.length,1);assert.equal(year.newPlantings.length,1);
assert.equal(year.chapters[1].photos.length,2);assert.equal(year.chapters[3].photos.length,1);
assert.equal(year.comparisons.length,1);assert.equal(year.comparisons[0].first.key,'spring.jpg');
assert.equal(year.measurements.find(m=>m.point.toLowerCase()==='base').delta,2);
assert.equal(year.measurements.find(m=>m.point==='Below branch').delta,null);
assert.equal(year.measurements.find(m=>m.point==='Measurement point not noted').delta,null);
assert.equal(year.events.length,5);assert.equal(model.recap(state,2025).photos.length,0);
assert.equal(model.build({...data,plants:[],sightings:[]},'2026-10-17').photos.length,0);
console.log('PASS: CSV quoting, leap dates, privacy exclusions, future dates, seasons, yearly isolation, wildlife counts, comparisons, and measurement-point separation');
const highlights=model.highlights(Array.from({length:12},(_,i)=>({id:'p'+i,kind:'plants',recordId:i<8?'same-plant':'plant'+i,date:'2026-05-'+String(i+1).padStart(2,'0')})).concat([{id:'visitor',kind:'wildlife',recordId:'bird',date:'2026-06-01'}]),3);
assert.equal(highlights.length,3);assert.equal(new Set(highlights.map(p=>p.recordId)).size,3);assert.ok(highlights.some(p=>p.kind==='wildlife'));
