const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sections=require('../shared/photo-sections.js');
const rows=[{category:'Milo',key:'photography/cats/milo/a.jpg'},{category:'Renamed',key:'photography/puck/old.jpg'},{category:'Puck',key:'p1'},{category:' puck ',key:'p2'},{category:'Landscape',key:'l'},{category:'',key:'m'}];
assert.deepEqual(rows.filter(p=>sections.includes(p,true)).map(p=>p.key),['photography/cats/milo/a.jpg','photography/puck/old.jpg','p1','p2']);
assert.deepEqual(rows.filter(p=>sections.includes(p,false)).map(p=>p.key),['l','m']);
assert.equal(new Set([...rows.filter(p=>sections.includes(p,true)),...rows.filter(p=>sections.includes(p,false))]).size,rows.length);
for(const path of ['shared/photography-gallery.js','shared/frame.js','shared/nav.js'])new vm.Script(fs.readFileSync(path,'utf8'));
for(const path of ['index.html','cats/index.html','photography/index.html']){const html=fs.readFileSync(path,'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}
const page=fs.readFileSync('cats/index.html','utf8');assert(page.includes('data-photo-section="puck"'));assert(page.includes('/cats-slideshow/'));
const gallery=fs.readFileSync('shared/photography-gallery.js','utf8');assert(!gallery.includes("CAT_PAGE ? 'Puck'"));assert(gallery.includes("CAT_PAGE ? 'photography/cats' : 'photography'"));assert(gallery.includes('rows[i][idCol]===photo.id')); // edits retain original row identity
const frame=fs.readFileSync('shared/frame.js','utf8');assert(frame.includes("(key === 'cats')"));assert(frame.includes("cats: { label:'Cats'"));
console.log('Cat/photography separation, shared scripts, row identity, and page syntax passed');

// Upload a newly named cat, then reload and rename it: it remains in Cats.
(async()=>{
 const state={photos:[]};let values;
 const ctx={ymd:()=>'2026-11-26',CAT_PAGE:true,state,isGsAuthed:()=>true,isVideo:()=>true,slug:s=>s.toLowerCase(),captureDateFromFile:()=>null,MediaStorage:{request:async()=>{}},appendPhotoRow:async row=>{values=row;},Math,Date};
 vm.createContext(ctx);
 vm.runInContext(gallery.slice(gallery.indexOf('async function uploadPhoto('),gallery.indexOf('/* ── Add photos overlay')),ctx);
 await ctx.uploadPhoto({name:'clip.mp4',size:10,arrayBuffer:async()=>new ArrayBuffer(1)},'Milo','','','2026-11-26');
 assert.equal(values[2],'Milo');assert.match(values[1],/^photography\/cats\/milo\//);
 const saved={...state.photos[0],category:'Renamed Milo'};
 assert(sections.includes(saved,true));assert(!sections.includes(saved,false));
 await ctx.uploadPhoto({name:'together.mp4',size:10,arrayBuffer:async()=>new ArrayBuffer(1)},'Tadpole, Clovis','','','2026-11-26');
 assert.equal(values[2],'Tadpole, Clovis');assert.equal(sections.catNames(state.photos[1].category).length,2);
 console.log('New and shared-cat uploads persist names and stay in Cats after reload or rename');
})().catch(e=>{console.error(e);process.exitCode=1;});

assert.deepEqual(sections.catNames(' Tadpole, Clovis, tadpole, , Clovis '),['Tadpole','Clovis']);
const sharedPhoto={category:'Tadpole, Clovis',key:'photography/cats/tadpole-clovis/shared.jpg',date:'2026-11-26'};
const context={CAT_PAGE:true,PhotoSections:sections,SEED_CATEGORIES:['Puck'],SEED_SUBCATEGORIES:{},state:{photos:[sharedPhoto,{category:'Clovis',key:'photography/cats/clovis/solo.jpg',date:'2026-11-25'}]},activeCategory:'Tadpole',activeSub:'',$:selector=>({value:selector==='#sortSel'?'newest':''})};
vm.createContext(context);
vm.runInContext(gallery.slice(gallery.indexOf('function photoCategories('),gallery.indexOf('function buildCategoryChips(')),context);
vm.runInContext(gallery.slice(gallery.indexOf('function filteredSortedPhotos('),gallery.indexOf('/* Pagination')),context);
assert.deepEqual({...context.categoryCounts()},{Tadpole:1,Clovis:2});
assert.equal(context.filteredSortedPhotos().length,1);
context.activeCategory='Clovis';assert.equal(context.filteredSortedPhotos().length,2);
context.activeCategory='';assert.equal(context.filteredSortedPhotos().length,2);
assert(sections.includes(sharedPhoto,true));assert(!sections.includes(sharedPhoto,false));
console.log('Shared photos match both cats, count once in All, and deduplicate repeated names');
