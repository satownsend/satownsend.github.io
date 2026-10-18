// Verify incomplete network data is disclosed and never represented as a complete zero-count recap.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const model=require('../backyard-year/model.js');
async function run(fail){
 const nodes=new Map();
 function node(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',disabled:false,dataset:{},setAttribute(){},addEventListener(){},after(){}});return nodes.get(key);}
 const location={href:'https://example.test/backyard-year/?year=2026',search:'?year=2026'};
 const context={window:{BackyardYear:model,THEMES:[{id:'default',label:'Teal Dark',meta:'#000'}],addEventListener(){}},document:{documentElement:{dataset:{},removeAttribute(){}},querySelector:node,addEventListener(){},querySelectorAll(){return[]}},location,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,localStorage:{getItem(){return null},setItem(){}},history:{replaceState(){},pushState(){}},navigator:{},fetch:async url=>{
  if(fail(url))throw new Error('Unavailable');
  let csv='id,name,planted\np,Maple,2026-04-02';
  if(url.includes('gid=396120968'))csv='plant_id,key,date\np,public.jpg,2026-05-01';
  if(url.includes('gid=322094770'))csv='plantId,date,action\np,2026-05-01,watered';
  if(url.includes('1Uq2Fgzron3yDZqYFWsUx1cYigp4w8GmQP2pmk33DG54'))csv=url.includes('gid=0')?'id,species,date\ns,Robin,2026-05-01':'sighting_id,key,date\ns,bird.jpg,2026-05-01';
  return{ok:true,text:async()=>csv};
 }};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../backyard-year/app.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));return nodes;
}
(async()=>{
 let nodes=await run(()=>true);
 assert.match(nodes.get('#notices').innerHTML,/Plant inventory.*could not be loaded/);
 assert.match(nodes.get('#recap').innerHTML,/<strong>—<\/strong><span>photos recorded/);
 assert.match(nodes.get('#loadStatus').textContent,/some data unavailable/);assert.equal(nodes.get('#reloadData').disabled,false);
 nodes=await run(url=>url.includes('gid=396120968'));
 assert.match(nodes.get('#notices').innerHTML,/Plant photos could not be loaded/);
 assert.match(nodes.get('#recap').innerHTML,/<strong>1<\/strong><span>wildlife species seen/);
 assert.match(nodes.get('#recap').innerHTML,/<strong>—<\/strong><span>plants photographed/);
 console.log('PASS: all-source failure, partial-source failure, unavailable counts, retained wildlife data, and retry availability');
})().catch(error=>{console.error(error);process.exitCode=1;});
