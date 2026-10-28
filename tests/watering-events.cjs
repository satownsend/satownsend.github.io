const assert=require('node:assert/strict'),events=require('../shared/watering-events.js');
const plants=[{id:'dawn',name:'Dawn Redwood'},{id:'old',name:'Old Maple',dead:true},{id:'unsafe',name:'<img src=x onerror=alert(1)>'}];
const log=[
 {id:'a',date:'2026-10-20',action:'watered',plantId:'dawn',time:'08:30',note:'Deep soak'},
 {id:'b',date:'2026-10-20',action:' watered ',plantId:'old',time:'08:35'},
 {id:'a',date:'2026-10-20',action:'watered',plantId:'dawn'},
 {id:'c',date:'2025-10-20',action:'watered',plantId:''},
 {id:'d',date:'2026-10-20',action:'watered',plantId:'missing'},
 {id:'e',date:'2026-10-20',action:'Watered',plantId:'unsafe'},
 {id:'future',date:'2026-10-28',action:'watered',plantId:'dawn'},
 {id:'bad-date',date:'2026-02-29',action:'watered',plantId:'dawn'},
 {id:'not-watering',date:'2026-10-20',action:'fertilized',note:'watered after feeding'},
 {id:'missing-date',action:'watered',plantId:'dawn'},
];
const before=JSON.stringify({log,plants}),records=events.collect(log,plants,'2026-10-27'),grouped=events.byDate(records);
assert.equal(records.length,5);assert.equal(grouped.get('2026-10-20').length,4);assert.equal(grouped.get('2025-10-20')[0].name,'Yard-wide');
assert.ok(records.some(r=>r.name==='Plant no longer in inventory'));assert.ok(records.some(r=>r.name==='Old Maple'));assert.ok(records.some(r=>r.name===plants[2].name));
assert.equal(records.find(r=>r.name==='Dawn Redwood').note,'Deep soak');assert.equal(records.find(r=>r.name==='Dawn Redwood').time,'08:30');
assert.equal(JSON.stringify({log,plants}),before);assert.equal(events.collect(null,null,'2026-10-27').length,0);
for(const d of ['2024-02-29','2000-02-29','2026-10-27'])assert.equal(events.validDate(d),true,d);
for(const d of ['2026-02-29','2100-02-29','2026-04-31','2026-13-01','2026-10-00','2026-1-1','',null])assert.equal(events.validDate(d),false,String(d));
assert.equal(events.collect([{date:'2024-02-29',action:'watered',plantId:'dawn'}],plants,'2026-10-27').length,1);
assert.equal(events.collect([{date:'2026-10-20',action:'watered'},{date:'2026-10-20',action:'watered'}],plants,'2026-10-27').length,2);
console.log('PASS watering events: date/year grouping, leap validation, exact actions, deduplication, historical/deleted plants, yard-wide logs, notes/time, future exclusion and immutable inputs');
