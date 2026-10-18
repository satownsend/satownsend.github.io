// Playback regression checks: node tests/frame-portrait-filter.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync(require('path').join(__dirname, '../shared/frame.js'), 'utf8');
const playback = source.slice(source.indexOf('  function show(i,'), source.indexOf('  async function start(first)'));
function setup(dimensions, skipPortrait = true) {
  const jobs = [], shown = [], messages = [];
  const pool = Object.keys(dimensions).map(key => ({key, name:key, section:'Test', icon:''}));
  const st = {pool, idx:-1, current:'A', timer:null, paused:false, errors:0};
  const elements = {};
  for (const id of ['#imgA','#imgB','#caption']) {
    elements[id] = {classList:{add(){shown.push(elements[id].key)},remove(){},toggle(){}}, innerHTML:'', textContent:''};
    if (id !== '#caption') Object.defineProperty(elements[id], 'src', {set(url) {
      this.key = url.split('/').pop(); const dims = dimensions[this.key];
      this.naturalWidth = dims[0]; this.naturalHeight = dims[1];
      const handler = this.onload; jobs.push(() => handler());
    }});
  }
  const context = {st, skipPortrait, portraitKeys:new Set(), $:id=>elements[id], R2_PUBLIC:'https://photos', esc:x=>x, fmtDate:x=>x, msg:x=>messages.push(x), Image:class{}, interval:20000, setTimeout:()=>1, clearTimeout(){}, body:{classList:{toggle(){}}}};
  vm.createContext(context); vm.runInContext(playback + '\nthis.controls={show,next,prev};',context);
  function flush(){let n=0;while(jobs.length){assert.ok(n++ < 30, 'must terminate');jobs.shift()();}}
  return {...context,shown,messages,flush};
}
let run = setup({portrait:[600,900],landscape:[1200,800],square:[700,700]});
run.controls.show(0); run.flush(); assert.deepEqual(run.shown,['landscape']);
run.controls.next();run.flush();assert.equal(run.shown.at(-1),'square');
run.controls.next();run.flush();assert.equal(run.shown.at(-1),'landscape');
run.controls.prev();run.flush();assert.equal(run.shown.at(-1),'square');
run=setup({one:[400,800],two:[600,900]});run.controls.show(0);run.flush();assert.equal(run.shown.length,0);assert.match(run.messages.at(-1),/No landscape or square/);
run=setup({portrait:[600,900]},false);run.controls.show(0);run.flush();assert.deepEqual(run.shown,['portrait']);
console.log('PASS: skip portrait before display; include square; advance and wrap; previous navigation; all-portrait termination; default behavior preserved');
