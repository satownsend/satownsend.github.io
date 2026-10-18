'use strict';
const {readFile,appendFile}=require('node:fs/promises');
const {Sheets,serviceToken}=require('./http.cjs');
const {collect,validateConfig}=require('./collector.cjs');
async function main(){
  const config=validateConfig(JSON.parse(await readFile('scripts/weather/config.json','utf8')));
  const paused=process.env.WEATHER_COLLECTOR_PAUSED==='true';
  if(!process.env.WEATHER_GOOGLE_SERVICE_ACCOUNT){
    const message='Collector is awaiting setup: add the WEATHER_GOOGLE_SERVICE_ACCOUNT repository secret. No weather data was written.';
    console.log(message);
    if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,message+'\n');
    // Manual runs should expose incomplete setup as a failure; scheduled runs avoid hourly failure spam.
    if(process.env.GITHUB_EVENT_NAME!=='schedule')process.exitCode=1;
    return;
  }
  const credentials=JSON.parse(process.env.WEATHER_GOOGLE_SERVICE_ACCOUNT);
  const token=await serviceToken(credentials);
  const result=await collect({config,sheets:new Sheets(config.sheetId,token),paused});
  const summary=`Weather collector: ${result.state}. Last capture: ${result.lastCapture||'none'}. Missing intervals in coverage window: ${result.coverage?.missing??'not evaluated'}.\n`;
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}
if(require.main===module)main().catch(()=>{
  // Do not print raw exceptions, credential material, or provider response bodies to a public workflow log.
  console.error('Weather collection failed. Check the weather_collector status tab, service-account setup, API availability, and spreadsheet access. Existing archive rows were retained.');
  process.exitCode=1;
});
module.exports={main};
