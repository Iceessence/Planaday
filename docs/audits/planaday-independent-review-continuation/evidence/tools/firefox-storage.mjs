import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [snapshot, evidence, playwrightPath] = process.argv.slice(2);
const {default:playwright} = await import(pathToFileURL(playwrightPath));
const {buildDayplanaServer} = await import(pathToFileURL(path.join(snapshot, 'dist-server/index.js')));
const {app}=await buildDayplanaServer({dataDir:await mkdtemp(path.join(snapshot,'firefox-control-'))});
const url=await app.listen({host:'127.0.0.1',port:0});
const browser=await playwright.firefox.launch();
const results={browser:browser.version(),checks:[]};
async function test(action){
 const page=await browser.newPage();
 await page.route('**/*',request=>new URL(request.request().url()).origin===url?request.continue():request.abort());
 await page.addInitScript(mode=>{
  window.auditStorage=[];
  for(const name of ['persist','persisted','estimate']){
   const original=StorageManager.prototype[name];
   if(typeof original!=='function')continue;
   StorageManager.prototype[name]=async function(...args){
    window.auditStorage.push({name,state:'called'});
    try{
     const value=name==='persist'&&mode==='return-denied'?false:await original.apply(this,args);
     window.auditStorage.push({name,state:'resolved',value});
     return value;
    }catch(error){window.auditStorage.push({name,state:'rejected',error:String(error)});throw error;}
   };
  }
 },action);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await new Promise(resolve=>setTimeout(resolve,8000));
 const result=await page.evaluate(()=>({workspace:document.querySelector('#root')?.innerText.slice(0,150),
  storage:window.auditStorage,ready:!!document.querySelector('.dp-sidebar')}));
 results.checks.push({action,...result,errors});
 await page.close();
}
try{
 await Promise.all(['normal','return-denied'].map(test));
}finally{
 await browser.close();
 app.server.closeAllConnections();
 await app.close();
 await writeFile(evidence,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
}
