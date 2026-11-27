const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sections=require('../shared/photo-sections.js');
const rows=[{category:'Puck',key:'p1'},{category:' puck ',key:'p2'},{category:'Landscape',key:'l'},{category:'',key:'m'}];
assert.deepEqual(rows.filter(p=>sections.includes(p,true)).map(p=>p.key),['p1','p2']);
assert.deepEqual(rows.filter(p=>sections.includes(p,false)).map(p=>p.key),['l','m']);
assert.equal(new Set([...rows.filter(p=>sections.includes(p,true)),...rows.filter(p=>sections.includes(p,false))]).size,rows.length);
for(const path of ['shared/photography-gallery.js','shared/frame.js','shared/nav.js'])new vm.Script(fs.readFileSync(path,'utf8'));
for(const path of ['index.html','cats/index.html','photography/index.html']){const html=fs.readFileSync(path,'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}
const page=fs.readFileSync('cats/index.html','utf8');assert(page.includes('data-photo-section="puck"'));assert(page.includes('/cats-slideshow/'));
const gallery=fs.readFileSync('shared/photography-gallery.js','utf8');assert(gallery.includes("CAT_PAGE ? 'Puck'"));assert(gallery.includes('rows[i][idCol]===photo.id')); // edits retain original row identity
const frame=fs.readFileSync('shared/frame.js','utf8');assert(frame.includes("(key === 'cats')"));assert(frame.includes("cats: { label:'Cats'"));
console.log('Cat/photography separation, shared scripts, row identity, and page syntax passed');
