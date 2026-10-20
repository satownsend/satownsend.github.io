const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('plants/index.html','utf8');
const between=(start,end)=>page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start)));
const helpers=between('function hmNow(', 'function recentFrostEvents(');
const escape=between('function escapeHtml(', '\n');
const quick=between("$('#logBtn').onclick =",'function renderLog(){');
const edit=between("$('#logEditSave').onclick =", "$('#logEditDelete').onclick =");
const photo=between('function autoHidePhoto(', 'function getPhotosForPlant(');
const panel=between('function renderFrostLog(){', "$('#damageFilter').addEventListener");
const actionHTML=between('<select id="logAction"','</select>');
const options=[...actionHTML.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));
const damage=options.filter(o=>/ damage$/.test(o.value)).map(o=>o.value);
assert.ok(damage.includes('wind damage')&&damage.includes('deer damage')&&damage.includes('rabbit damage')&&damage.includes('frost damage')&&damage.includes('other damage'));
function environment(){
 const nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',style:{display:'none'},classList:{remove(){}},options:[]});return nodes.get(id)};
 const state={settings:{units:'F'},plants:[{id:'a',name:'Maple',photos:[{key:'maple.jpg',date:'2026-10-19'}]},{id:'b',name:'Spruce',photos:[{key:'spruce.jpg'}]}],log:[]};
 let saves=0,refreshed=0,seq=0;
 const context={state,$,Date,console,editingLogId:'entry',editingLogPhotoKeys:['maple.jpg'],logPlantState:{selected:new Set(['a','b']),yardWide:false},
  uid:()=>`entry-${++seq}`,ymd:()=> '2026-10-19',save(){saves++},render(){},renderPlants(){},renderLog(){},buildBrief(){},renderFrostLog(){refreshed++},resetLogDateTime(){},
  plantsById:()=>new Map(state.plants.map(p=>[p.id,p])),findPhotoOwner:key=>state.plants.find(p=>p.photos.some(ph=>ph.key===key)),renderLogThumbs:()=>'',alert:message=>{throw Error(message)}};
 vm.createContext(context);vm.runInContext(helpers+escape+photo,context);
 $('#logAction').options=options;$('#damageFilter').value='all';$('#logDate').value='2026-10-19';$('#logTime').value='08:15';$('#logNote').value='Observed damage';$('#logTemp').value='28';$('#logCausedBy').value='frost-1';
 return {context,state,$,saves:()=>saves,refreshed:()=>refreshed};
}
for(const action of damage){
 const e=environment();e.$('#logAction').value=action;vm.runInContext(quick,e.context);e.$('#logBtn').onclick();
 assert.equal(e.state.log.length,2);assert.ok(e.state.log.every(x=>x.action===action));assert.equal(e.saves(),1);assert.equal(e.refreshed(),1);
 assert.equal(e.state.log[0].date,'2026-10-19');assert.equal(e.state.log[0].time,'08:15');
 assert.equal(Object.hasOwn(e.state.log[0],'temp'),action==='frost damage');assert.equal(Object.hasOwn(e.state.log[0],'causedBy'),action==='frost damage');
}
let e=environment();e.context.logPlantState.yardWide=true;e.$('#logAction').value='rabbit damage';vm.runInContext(quick,e.context);e.$('#logBtn').onclick();assert.equal(e.state.log[0].plantId,'');
for(const action of damage){
 e=environment();e.state.log=[{id:'entry',plantId:'a',action:'frost damage',temp:28,causedBy:'frost-1'}];
 for(const [id,value] of Object.entries({logEditAction:action,logEditPlant:'a',logEditDate:'2026-10-19',logEditTime:'09:00',logEditNote:'Bark stripped',logEditTemp:'28',logEditCausedBy:'frost-1'}))e.$('#'+id).value=value;
 vm.runInContext(edit,e.context);e.$('#logEditSave').onclick();const entry=e.state.log[0];
 assert.equal(entry.action,action);assert.equal(entry.note,'Bark stripped');assert.equal(entry.photoKeys[0],'maple.jpg');assert.equal(e.state.plants[0].photos[0].hideFromGallery,true);assert.ok(entry.modifiedAt);
 assert.equal(Object.hasOwn(entry,'temp'),action==='frost damage');assert.equal(Object.hasOwn(entry,'causedBy'),action==='frost damage');
 // A later ordinary note keeps the existing photo hide flag rather than clearing it.
 e.$('#logEditAction').value='note';e.$('#logEditSave').onclick();assert.equal(e.state.plants[0].photos[0].hideFromGallery,true);
}
// Existing frost reports and unfamiliar damage labels remain visible and linkable when filtering.
e=environment();e.state.log=[{id:'frost-1',plantId:'',action:'frost',date:'2026-10-17',temp:28},
 {id:'fd',plantId:'a',action:'frost damage',date:'2026-10-18',causedBy:'frost-1'},
 {id:'deer',plantId:'a',action:'deer damage',date:'2026-10-19'},
 {id:'custom',plantId:'b',action:'mower damage',date:'2026-10-19'},
 {id:'note',plantId:'a',action:'note',date:'2026-10-19'}];
vm.runInContext(panel,e.context);e.context.renderFrostLog();assert.match(e.$('#damageShown').textContent,/4 of 4/);assert.match(e.$('#damageFilter').innerHTML,/mower damage/);
e.$('#damageFilter').value='deer damage';e.context.renderFrostLog();assert.match(e.$('#frostLog').innerHTML,/data-log-id="deer"/);assert.doesNotMatch(e.$('#frostLog').innerHTML,/data-log-id="fd"/);
e.$('#damageFilter').value='frost damage';e.context.renderFrostLog();assert.match(e.$('#frostLog').innerHTML,/caused by 2026-10-17/);
e.$('#damageFilter').value='damage';e.context.renderFrostLog();assert.match(e.$('#damageShown').textContent,/3 of 4/);
e.$('#damageFilter').value='wind damage';e.context.renderFrostLog();assert.match(e.$('#frostLog').innerHTML,/No reports match/);
e.state.log=[];e.context.renderFrostLog();assert.match(e.$('#frostLog').innerHTML,/No damage or frost events/);
// No schema migration: production serializer and importer retain every new action, photos and legacy frost fields.
e=environment();e.state.log=damage.map((action,i)=>({id:String(i),plantId:'a',action,date:'2026-10-19',photoKeys:['maple.jpg'],...(action==='frost damage'?{temp:28,causedBy:'parent'}:{})}));
const serialize=between('function logToSheetRows(){','const CARE_HEADERS');vm.runInContext(serialize,e.context);const rows=e.context.logToSheetRows();
e.context.rawLog=rows.slice(1).map(row=>Object.fromEntries(rows[0].map((key,i)=>[key,row[i]])));
const importer=between('    const remoteLog = rawLog.map','    // Merge: keep local-only log entries');vm.runInContext(importer+';globalThis.restored=remoteLog;',e.context);
assert.deepEqual(Array.from(e.context.restored,x=>x.action),damage);assert.equal(e.context.restored[0].temp,'28');assert.equal(e.context.restored[0].causedBy,'parent');assert.equal(e.context.restored[1].photoKeys[0],'maple.jpg');
console.log('PASS damage types: multi-plant/yard logging, edit cleanup, photo hiding, legacy frost links, category filters, unknown damage labels, empty states and sheet round-trip');
