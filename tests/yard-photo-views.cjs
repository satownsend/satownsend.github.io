const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const views=require('../shared/yard-photo-views.js');
const photos=[{key:'one',viewTags:['Office window','Porch','OFFICE WINDOW']},{key:'two',viewTags:['Porch']},{key:'three'},{key:'four',viewTags:'Office window|Side gate'}];
assert.deepEqual(views.parseInput(' office window, PORCH, porch,  Back   fence ',photos),['Office window','Porch','Back fence']);
assert.deepEqual(views.filter(photos,'untagged').map(p=>p.key),['three']);
assert.deepEqual(views.filter(photos,'view:office window').map(p=>p.key),['one','four']);
assert.equal(views.filter(photos).length,4);assert.equal(views.filter(photos,'view:missing').length,0);
assert.equal(views.choices(photos).find(v=>v.value==='view:office window').count,2);
assert.deepEqual(views.read(null),[]);assert.deepEqual(views.parseInput(' , | '),[]);
const old={key:'old.jpg',date:'2026-01-02',caption:'Snow',hideFromGallery:'TRUE',alsoIn:'a|b'};
const restored=views.fromSheetPhoto(old);assert.equal(restored.hideFromGallery,true);assert.deepEqual(restored.alsoIn,['a','b']);assert.ok(!Object.hasOwn(restored,'viewTags'));
const rows=views.toSheetRows([{id:'plant',photos:[restored]},{id:'yard',photos:[{key:'yard.jpg',date:'2026-05-01',caption:'Yard',viewTags:['Office window','Porch']}]}]);
assert.deepEqual(rows[0],['plant_id','key','date','caption','hideFromGallery','alsoIn','viewTags']);
assert.deepEqual(rows[1],['plant','old.jpg','2026-01-02','Snow','TRUE','a|b','']);
const row=Object.fromEntries(rows[0].map((header,i)=>[header,rows[2][i]]));assert.deepEqual(views.fromSheetPhoto(row).viewTags,['Office window','Porch']);
const page=fs.readFileSync(path.join(__dirname,'../plants/index.html'),'utf8');
const saveSource=page.slice(page.indexOf('function saveYardViewTags(){'),page.indexOf("$('#lightboxSaveViewTags').addEventListener"));
function editor(authed=true,owner='yard'){
 const photo={key:'sample',viewTags:['Porch']},nodes={'#lightboxViewTags':{value:'Office window, Porch'},'#lightboxViewTagsStatus':{textContent:''}};
 let saved=0,rendered=0;
 const context={YardPhotoViews:views,YARD_ID:'yard',state:{yardPhotos:[photo],_lightboxPhotos:[photo]},lightboxIdx:0,$:key=>nodes[key],isGsAuthed:()=>authed,getCanonicalPhoto:()=>({owner:{id:owner},target:photo}),save(){saved++},renderYardPhotos(){rendered++}};
 vm.createContext(context);vm.runInContext(saveSource+';saveYardViewTags();',context);
 return{photo,nodes,context,saved:()=>saved,rendered:()=>rendered};
}
let edit=editor();assert.deepEqual(edit.photo.viewTags,['Office window','Porch']);assert.equal(edit.saved(),1);assert.equal(edit.rendered(),1);
edit.nodes['#lightboxViewTags'].value='';vm.runInContext('saveYardViewTags()',edit.context);assert.deepEqual(views.read(edit.photo.viewTags),[]);assert.equal(edit.saved(),2);
edit=editor(false);assert.equal(edit.saved(),0);assert.deepEqual(edit.photo.viewTags,['Porch']);
edit=editor(true,'normal-plant');assert.equal(edit.saved(),0);assert.deepEqual(edit.photo.viewTags,['Porch']);
const uploadSource=page.slice(page.indexOf('async function uploadPhoto('),page.indexOf('async function deletePhotoFromR2('));
(async()=>{
 const plant={id:'yard',photos:[]};let localSaves=0;
 const context={YARD_ID:'yard',YardPhotoViews:views,Blob,Math,Date,console,getR2Creds:()=>({accessKey:'test',secretKey:'test'}),exifDateFromFile:async()=> '2026-05-01',isHeic:()=>false,resizeImage:async()=>new Blob(['test']),sigv4Request:async()=>{},saveLocal(){localSaves++},isGsAuthed:()=>{throw Error('batch upload must not sync per photo')}};
 vm.createContext(context);vm.runInContext(uploadSource,context);await context.uploadPhoto(plant,{},null,{sync:false,viewTags:['Office window','Porch']});
 assert.deepEqual(plant.photos[0].viewTags,['Office window','Porch']);assert.equal(localSaves,1);
 const normal={id:'maple',photos:[]};await context.uploadPhoto(normal,{},null,{sync:false,viewTags:['Porch']});assert.ok(!Object.hasOwn(normal.photos[0],'viewTags'));
 console.log('PASS: normalized tags, filters/counts, legacy rows, sheet round-trip, authenticated edits, tag removal, access guards, and batch-upload tags');
})().catch(error=>{console.error(error);process.exitCode=1});
