import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [snap,folder,pl]=process.argv.slice(2);
const snapshot=path.resolve(snap);
await mkdir(folder,{recursive:true});
const {default:playwright}=await import(pathToFileURL(pl));
const {buildDayplanaServer}=await import(pathToFileURL(path.join(snapshot,'dist-server/index.js')));
const {app}=await buildDayplanaServer({dataDir:await mkdtemp(path.join(snapshot,'large-'))});
const base=await app.listen({host:'127.0.0.1',port:0});
const browser=await playwright.chromium.launch({channel:'chrome',args:['--no-proxy-server']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
const page=await context.newPage();
const client=await context.newCDPSession(page);
const report={engine:browser.version(),sizes:[],inputControls:[]};
const save=()=>writeFile(path.join(folder,'results.json'),JSON.stringify(report,null,2));
const editor=page.locator('textarea[placeholder^="Write freely"]');
const syncState=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
 const o=indexedDB.open('dayplana-v2');o.onerror=()=>reject(o.error);
 o.onsuccess=()=>{const db=o.result; const tx=db.transaction(['records','outbox'],'readonly');
  const n=tx.objectStore('records').getAll(),q=tx.objectStore('outbox').count();
  tx.oncomplete=()=>{db.close();resolve({notes:n.result.filter(r=>r.type==='note'),ops:q.result});}; tx.onerror=()=>reject(tx.error);
 };
}));
async function navigate(){
 await page.locator('.dp-app').waitFor();
 await page.getByRole('button',{name:'Open navigation menu'}).click();
 await page.locator('dialog[open]').getByRole('button',{name:'Notes & Graph',exact:true}).click();
}
async function hydrate(initial){
 await page.evaluate(initial=>new Promise((resolve,reject)=>{
  const o=indexedDB.open('dayplana-v2');o.onerror=()=>reject(o.error);
  o.onsuccess=()=>{
   const db=o.result,tx=db.transaction('records','readwrite'),cur=tx.objectStore('records').openCursor();
   cur.onsuccess=()=>{
    if(!cur.result){reject(new Error('Missing seeded note'));return;}
    if(cur.result.value.type!=='note'){cur.result.continue();return;}
    const r=cur.result.value;r.payload.content=initial;cur.result.update(r);
   };tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };
 }),initial);
}
const insert=async(index,text)=>{
 await editor.evaluate((e,index)=>{e.focus();e.setSelectionRange(index,index);},index);
 const t=performance.now();
 await client.send('Input.insertText',{text});
 const obs=await editor.evaluate(e=>({pos:e.selectionStart,at:e.value.slice(Math.max(0,e.selectionStart-1),e.selectionStart),scroll:e.scrollTop}));
 return {ms:performance.now()-t,...obs};
};
try{
 await page.goto(base);
 await page.locator('.dp-app').waitFor();
 await page.locator('dialog[open]').getByRole('button',{name:'Close dialog'}).click();
 await page.locator('dialog[open]').waitFor({state:'hidden'});
 await navigate();
 await page.getByRole('button',{name:'New Note',exact:true}).click();
 await editor.fill('fixture');
 await page.getByTitle('Save immediately & create version snapshot (Ctrl+S)').click();
 await editor.waitFor();
 for(const words of [100,1000,10000,25000,50000,100000]){
  const row={words,target:words};
  report.sizes.push(row);
  try{
   const initial='**alpha** beta gamma delta epsilon\n'.repeat(words/5).trimEnd();
   await hydrate(initial);
   const started=performance.now();
   await page.reload();
   await navigate();
   await editor.waitFor();
   row.loadMs=performance.now()-started;
   assert.equal((await editor.inputValue()).length,initial.length);
   row.length=initial.length;
   row.edits=[];
   for(const place of [0,Math.floor(initial.length/2),initial.length]){
    const point=await insert(place,'X');
    row.edits.push({place,...point});
    assert.equal(point.pos,place+1);
    assert.equal(point.at,'X');
   }
   await new Promise(resolve=>setTimeout(resolve,900));
   const persisted=await syncState();
   assert.equal(persisted.notes[0].payload.content.length,initial.length+3);
   row.outbox=persisted.ops;
   row.heap=await client.send('Runtime.getHeapUsage');
   row.status='pass';
  }catch(error){row.status='fail';row.error=error.message;}
  await save();console.log(row.status,'NP-'+words);
 }
 const bare=await context.newPage();
 await bare.setContent('<meta name="viewport" content="width=device-width"><textarea style="width:100%;height:360px"></textarea>');
 const bareCdp=await context.newCDPSession(bare);
 for(const words of [1000,10000,25000]){
  const payload='alpha beta gamma delta epsilon\n'.repeat(words/5);
  const row={words,bytes:Buffer.byteLength(payload)};
  for(const [kind,control,session] of [['bare',bare.locator('textarea'),bareCdp],['app',editor,client]]){
   await control.evaluate(e=>{e.focus();e.select();});
   const begin=performance.now();
   await session.send('Input.insertText',{text:payload});
   row[kind]=performance.now()-begin;
   row[kind+'Chars']=(await control.inputValue()).length;
  }
  report.inputControls.push(row);await save();console.log('NP-PASTE',words,row.bare,row.app);
 }
}finally{
 await save();await browser.close();app.server.closeAllConnections();await app.close();
}
