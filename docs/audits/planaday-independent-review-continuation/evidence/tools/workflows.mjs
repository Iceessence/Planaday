import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [snapshotPath,evidence,playwrightPath]=process.argv.slice(2);
const snapshot=path.resolve(snapshotPath);
await mkdir(evidence,{recursive:true});
const {default:playwright}=await import(pathToFileURL(playwrightPath));
const {buildDayplanaServer}=await import(pathToFileURL(path.join(snapshot,'dist-server/index.js')));
const {app,syncDb}=await buildDayplanaServer({dataDir:await mkdtemp(path.join(snapshot,'paired-'))});
const url=await app.listen({host:'127.0.0.1',port:0});
const browser=await playwright.chromium.launch({channel:'chrome',args:['--disable-background-networking','--no-proxy-server']});
const log={browser:browser.version(),cases:[],crossNotes:[],transport:[],errors:[]};
const file=path.join(evidence,'results.json');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=()=>writeFile(file,JSON.stringify(log,null,2));
const button=(p,name)=>p.getByRole('button',{name,exact:true}).first();
const box=(p,label)=>p.getByPlaceholder(label,{exact:true}).first();
const editor=p=>p.locator('textarea[placeholder^="Write freely"]');
const updateSnapshot=p=>p.getByTitle('Save immediately & create version snapshot (Ctrl+S)').click();
const root=p=>p.locator('main');
async function until(fn,pred=Boolean,timeout=6500){
 const deadline=Date.now()+timeout;
 let value;
 while(Date.now()<deadline){value=await fn();if(pred(value))return value;await delay(100);}
 throw new Error('Timed out waiting for state. Latest: '+JSON.stringify(value)?.slice(0,420));
}
async function ready(p){
 await p.locator('.dp-app').waitFor({timeout:9000});
 await p.getByText('Loading Planaday studio…',{exact:true}).waitFor({state:'hidden',timeout:6000}).catch(()=>{});
}
async function go(p,name){
 await p.locator('.dp-sidebar .dp-nav-btn').filter({has:p.getByText(name,{exact:true})}).first().click({timeout:4500});
 await ready(p);
}
async function idb(p,store,action,arg=null){
 return p.evaluate(({store,action,arg})=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('dayplana-v2');
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result;
   const tx=db.transaction(store,action==='patch'||action==='put'?'readwrite':'readonly');
   const table=tx.objectStore(store);
   const req=action==='patch'?table.get(arg.key):action==='put'?table.put(arg):table.getAll();
   let result;
   req.onsuccess=()=>{result=req.result;if(action==='patch')table.put({...req.result,...arg.value});};
   tx.oncomplete=()=>{db.close();resolve(result);};
   tx.onerror=()=>reject(tx.error);
  };
 }),{store,action,arg});
}
const rows=p=>idb(p,'records','read');
const get=(p,kind,name)=>rows(p).then(rs=>rs.find(r=>r.type===kind&&r.title===name)??null);
const stored=(p,kind,name)=>until(()=>get(p,kind,name));
const remote=id=>syncDb.pullSince(0).records.find(r=>r.id===id)??null;
async function profile(width=1440,height=960,mode='offline-computer'){
 const context=await browser.newContext({viewport:{width,height}});
 await context.route('**/*',route=>{
  const target=new URL(route.request().url());
  return target.origin===url ? route.continue() : route.abort();
 });
 const page=await context.newPage();
 page.setDefaultTimeout(5500);
 page.on('pageerror',e=>log.errors.push(e.message));
 page.on('request',req=>{
  if(req.url().startsWith(url+'/api/'))log.transport.push({method:req.method(),path:new URL(req.url()).pathname,bytes:req.postDataBuffer()?.length??0});
 });
 await page.goto(url);
 await ready(page);
 const onboard=page.locator('dialog[open]');
 if(await onboard.count()) await onboard.getByRole('button',{name:'Close dialog'}).click();
 const old=(await idb(page,'settings','read')).find(x=>x.id==='app-settings');
 const enabledModules=Object.fromEntries(Object.keys(old.enabledModules).map(k=>[k,true]));
 await idb(page,'settings','patch',{key:'app-settings',value:{operatingMode:mode,enabledModules,onboardingCompleted:true}});
 await page.reload();
 await ready(page);
 return {context,page};
}
async function check(id,description,action){
 try{log.cases.push({id,description,status:'pass',details:await action()});}
 catch(error){log.cases.push({id,description,status:'fail',error:error.message.slice(0,700)});}
 console.log(log.cases.at(-1).status,id,description);
 await save();
}
async function createNote(p,title,content){
 await button(p,'New Note').click();
 await p.locator('[aria-label="Note title"]').fill(title);
 const record=await stored(p,'note',title);
 await editor(p).fill(content);
 await until(()=>get(p,'note',title),r=>r?.id===record.id&&r.payload.content===content);
 await updateSnapshot(p);
 return until(()=>get(p,'note',title),r=>r?.id===record.id&&r.payload.content===content);
}
async function captureDownload(p,label){
 await p.evaluate(()=>{
  window.auditArtifact=null;
  if(window.auditDownloadHook)return;
  const original=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
   if(!this.download)return original.call(this);
   window.auditArtifact={url:this.href,file:this.download};
  };
  window.auditDownloadHook=true;
 });
 await button(p,label).click();
 return p.evaluate(async()=>{
  const anchor=window.auditArtifact;
  if(!anchor)return null;
  const res=await fetch(anchor.url);
  return {filename:anchor.file.slice(0,100),body:(await res.text()).slice(0,340),type:res.headers.get('content-type')};
 });
}
async function submitFormAt(p,input,value){
 const control=box(p,input);
 await control.fill(value);
 await control.evaluate(e=>e.form.requestSubmit());
}
try{
 const desktop=await profile();
 const p=desktop.page;
 const ordinary=[
  ['WF-001','Tasks','New task title…','task','Synthetic task'],
  ['WF-002','Chores','New chore (e.g., Wash bedsheets)…','chore','Synthetic chore'],
  ['WF-003','Goals','New outcome goal…','goal','Synthetic goal'],
  ['WF-004','Habits & Routines','New gentle habit…','habit','Synthetic habit'],
  ['WF-005','Pantry Lots','Ingredient / food item…','pantry_lot','Synthetic oats'],
  ['WF-006','Groceries','Add grocery item…','grocery_item','Synthetic milk'],
 ];
 for(const [id,view,input,kind,label] of ordinary)await check(id,view+' create and retain across reload',async()=>{
  await go(p,view);
  await submitFormAt(p,input,label);
  const before=await until(()=>rows(p),r=>r.some(rec=>rec.type===kind&&(rec.title.includes(label)||JSON.stringify(rec.payload).includes(label))));
  const active=before.find(rec=>rec.type===kind&&(rec.title.includes(label)||JSON.stringify(rec.payload).includes(label)));
  await p.reload(); await ready(p); await go(p,view);
  const after=(await rows(p)).find(rec=>rec.id===active.id);
  assert.ok(after);
  assert.equal(after.title,active.title);
  return {type:kind,title:after.title,visibleAfterReload:(await root(p).innerText()).toLowerCase().includes(label.toLowerCase())};
 });
 await check('WF-007','Task edit retains long description and save',async()=>{
  await go(p,'Tasks');
  const entry=root(p).getByText('Synthetic task',{exact:true}).first();
  const container=entry.locator('xpath=ancestor::div[contains(@class,"dp-card")][1]');
  const labelled=container.locator('button').filter({hasText:/details|edit/i});
  if(await labelled.count()) await labelled.first().click();
  else {
   const candidates=await container.locator('button').evaluateAll(nodes=>nodes.map(a=>({t:a.title,n:a.getAttribute('aria-label'),content:a.textContent})));
   log.taskButtons=candidates;
   await container.locator('button').last().click();
  }
  const desc=p.getByPlaceholder('Notes, instructions, or context for this task…',{exact:true});
  await desc.fill('Synthetic description with ample space');
  await desc.blur();
  const before=await until(()=>get(p,'task','Synthetic task'),r=>JSON.stringify(r?.payload??{}).includes('Synthetic description'));
  await p.reload();await ready(p);
  assert.match(JSON.stringify((await rows(p)).find(r=>r.id===before.id)?.payload),/Synthetic description/);
  return before.id;
 });
 await check('WF-008','Project description, template milestones and reload',async()=>{
  const name='Synthetic project';
  await go(p,'Projects & Records');
  await box(p,'New project title...').fill(name);
  await button(p,'Create Project').click();
  const overview=box(p,'Project overview, objectives, scope, design pillars, and notes...');
  await overview.fill('Preserved synthetic objectives');
  await overview.blur();
  const saved=await until(()=>get(p,'project',name),r=>JSON.stringify(r?.payload??{}).includes('Preserved synthetic objectives'));
  await p.reload();await ready(p);await go(p,'Projects & Records');
  assert.match(await overview.inputValue(),/Preserved synthetic objectives/);
  return {id:saved.id,milestones:saved.payload.milestones?.length};
 });
 await check('WF-009','Book and chapter persisted together',async()=>{
  const name='Synthetic story';
  await go(p,'Book Studio');
  await box(p,'Book title...').fill(name);
  await box(p,'Series (optional)').fill('Synthetic series');
  await button(p,'New Book').click();
  const book=await stored(p,'book_project',name);
  const chapter=box(p,'Write your chapter here (auto-saved cleanly without mobile cursor jump)...');
  await chapter.fill('First synthetic chapter.');
  await chapter.blur();
  const matching=await until(()=>rows(p),rs=>rs.some(r=>r.type==='book_chapter'&&r.payload.content==='First synthetic chapter.'));
  await p.reload();await ready(p);await go(p,'Book Studio');
  assert.equal(await chapter.inputValue(),'First synthetic chapter.');
  return {book:book.id,chapter:matching.find(r=>r.type==='book_chapter'&&r.payload.content==='First synthetic chapter.').id};
 });
 await check('WF-010','Game project create and reload',async()=>{
  const name='Synthetic game';
  await go(p,'Game Dev Studio');
  await box(p,'New game title...').fill(name);
  await button(p,'New Game').click();
  const entry=await stored(p,'game_project',name);
  await p.reload();await ready(p);await go(p,'Game Dev Studio');
  assert.ok((await rows(p)).some(r=>r.id===entry.id));
  return {id:entry.id,fields:Object.keys(entry.payload)};
 });
 await check('WF-011','Laboratory sample with assay and client persists',async()=>{
  await go(p,'Lab Management');
  await p.getByRole('button',{name:/^Samples/}).first().click();
  await box(p,'Sample ID *').fill('CONT-AUD-1');
  await box(p,'Client').fill('Synthetic client A');
  await box(p,'Required analyses (comma sep)').fill('Ash, Moisture');
  await box(p,'Commodity').fill('Synthetic maize');
  await box(p,'Assigned analyst').fill('Synthetic staff');
  await button(p,'Add Sample').click();
  const all=await until(()=>rows(p),rs=>rs.some(r=>r.type==='lab_sample'&&r.payload.sampleId==='CONT-AUD-1'));
  const rec=all.find(r=>r.type==='lab_sample'&&r.payload.sampleId==='CONT-AUD-1');
  assert.deepEqual(rec.payload.analyses,['Ash','Moisture']);
  await p.reload();await ready(p);await go(p,'Lab Management');
  await p.getByRole('button',{name:/^Samples/}).first().click();
  await root(p).getByText('CONT-AUD-1',{exact:true}).waitFor();
  return {client:rec.payload.client,analyst:rec.payload.analyst,assays:rec.payload.analyses};
 });
 const exports=[
  ['EX-001','Book Studio','.MD',null,'.md',/^#/],
  ['EX-002','Book Studio','.DOC',null,'.doc',/^</],
  ['EX-003','Whiteboard Canvas','SVG','New Board','.svg',/^<svg/],
  ['EX-004','Code Sandbox','Download','New Project','.js',/function|console|\/\//],
  ['EX-005','Presentations','HTML Deck','New Deck','.html',/^<!doctype html>/i],
  ['EX-006','Spreadsheets','CSV',null,'.csv',/,/],
  ['EX-007','Spreadsheets','Excel (.xls)',null,'.xls',/^<\?xml/],
 ];
 for(const [id,view,label,prepare,ext,shape] of exports)await check(id,view+' '+label+' filename and payload',async()=>{
  await go(p,view);
  if(prepare)await button(p,prepare).click();
  if(view==='Spreadsheets'&&await button(p,'CSV').count()===0)
   await root(p).locator('select').filter({has:p.locator('option[value="blank"]')}).first().selectOption('blank');
  const artifact=await captureDownload(p,label);
  log[id]=artifact;
  assert.ok(artifact,'No download was generated');
  assert.ok(artifact.filename.endsWith(ext),'Unexpected filename: '+artifact.filename);
  assert.match(artifact.body,shape);
  return artifact;
 });
 await check('WF-012','Ordinary task CSV or calendar ICS export control with body',async()=>{
  await go(p,'Flow Calendar');
  const b=p.getByRole('button',{name:/export.*ics|^ics export$/i}).first();
  if(!await b.count())throw new Error('Calendar export control unavailable in current scenario');
  const label=(await b.innerText()).trim();
  const artifact=await captureDownload(p,label);
  assert.match(artifact.body,/BEGIN:VCALENDAR/);
  return artifact;
 });
 if(process.argv[5]==='calendar'){
  await check('CAL-001','Timeline zoom endpoints, labelled controls and reload',async()=>{
   await go(p,'Flow Calendar');
   const zoom=p.getByLabel('Timeline interval zoom',{exact:true});
   const addAt=()=>root(p).locator('div[style*="repeating-linear-gradient"]').first();
   const geometry=async()=>addAt().evaluate(el=>({height:el.getBoundingClientRect().height,layers:getComputedStyle(el).backgroundImage}));
   await zoom.selectOption('240');
   const coarse=await geometry();
   assert.equal(await zoom.inputValue(),'240');
   await p.getByTitle('Zoom out (up to 4h)',{exact:true}).click();
   assert.equal(await zoom.inputValue(),'240');
   await zoom.selectOption('5');
   const visited=['5'];
   while((await zoom.inputValue())!=='1'&&visited.length<10){
    await p.getByTitle('Zoom in (down to 1m)',{exact:true}).click();
    visited.push(await zoom.inputValue());
   }
   const fine=await geometry();
   assert.equal(visited.at(-1),'1');
   assert.ok(fine.height>coarse.height);
   await p.getByTitle('Zoom in (down to 1m)',{exact:true}).click();
   assert.equal(await zoom.inputValue(),'1');
   await p.reload();
   await ready(p);
   await go(p,'Flow Calendar');
   const afterReload=await zoom.inputValue();
   return {visited,coarse,fine,afterReload};
  });
  await check('CAL-002','Timed event geometry, adaptive font and stored notes',async()=>{
   await go(p,'Flow Calendar');
   const zoom=p.getByLabel('Timeline interval zoom',{exact:true});
   const title='Synthetic calendar geometry';
   const notes='Description persisted in a timed calendar event.';
   await zoom.selectOption('15');
   await root(p).getByRole('button',{name:/^Add event on /}).first().click();
   const dlg=p.locator('dialog[open]');
   await dlg.getByPlaceholder('Event title').fill(title);
   const times=dlg.locator('input[type="time"]');
   await times.nth(0).fill('09:15');
   await times.nth(1).fill('10:05');
   const notesInput=dlg.getByPlaceholder('Notes / agenda…');
   await notesInput.locator('xpath=ancestor::details[1]/summary').click();
   await notesInput.fill(notes);
   await dlg.getByRole('button',{name:'Save Event',exact:true}).click();
   const record=await stored(p,'event',title);
   assert.equal(record.payload.startTime,'09:15');
   assert.equal(record.payload.endTime,'10:05');
   assert.equal(record.payload.notes,notes);
   const render=root(p).locator('.dp-flow-event').filter({hasText:title}).first();
   const snapshot=()=>render.evaluate(el=>({font:getComputedStyle(el).fontSize,top:el.style.top,height:el.style.height}));
   await zoom.selectOption('240');
   await root(p).getByRole('button',{name:/Calendar Zoom, Gridlines, Text Scaling/}).click();
   const adaptive=root(p).getByRole('checkbox',{name:/Adaptive Text/});
   await adaptive.check();
   const coarse=await snapshot();
   await zoom.selectOption('1');
   const fine=await snapshot();
   assert.ok(parseFloat(fine.top)>parseFloat(coarse.top));
   assert.ok(parseFloat(fine.height)>parseFloat(coarse.height));
   assert.ok(parseFloat(fine.font)>parseFloat(coarse.font));
   await adaptive.uncheck();
   const fixed=await snapshot();
   assert.equal(fixed.font,'12px');
   await p.reload();
   await ready(p);
   await go(p,'Flow Calendar');
   assert.equal((await stored(p,'event',title)).payload.notes,notes);
   return {coarse,fine,fixed,storedAfterReload:true};
  });
  await desktop.context.close();
 }else{
 await desktop.context.close();

 const a=await profile(1440,960,'docker-sync');
 const b=await profile(1440,960,'docker-sync');
 await check('BR-001','Two independent browser profiles exchange a saved synthetic note',async()=>{
  await go(a.page,'Notes & Graph');
  const note=await createNote(a.page,'Synthetic device A','Cross-profile text');
  await until(()=>Promise.resolve(remote(note.id)),r=>r?.payload.content==='Cross-profile text',16000);
  await until(()=>get(b.page,'note','Synthetic device A'),r=>r?.payload.content==='Cross-profile text',18000);
  return {source:note.id,presentOnServer:true,presentInSeparateIndexedDb:true};
 });
 await check('BR-002','Two profiles receive matching attachment bytes with a normal Notes upload',async()=>{
  await go(a.page,'Notes & Graph');
  const note=await createNote(a.page,'Synthetic attachment','Synthetic payload');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+xLZkAAAAASUVORK5CYII=','base64');
  await root(a.page).locator('input[type=file]').first().setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
  const local=await until(()=>get(a.page,'note','Synthetic attachment'),r=>r?.payload.attachmentBlobIds?.length);
  const hash=local.payload.attachmentBlobIds[0];
  await until(()=>Promise.resolve(remote(note.id)),r=>r?.payload.attachmentBlobIds?.includes(hash),18000);
  const onB=await until(()=>get(b.page,'note','Synthetic attachment'),r=>r?.payload.attachmentBlobIds?.includes(hash),18000);
  const bytes=await fetch(url+'/api/blobs/'+hash);
  const bBlobs=await idb(b.page,'blobs','read');
  log['BR-002']={id:onB.id,serverBytes:bytes.status,localSecondDevice:bBlobs.map(x=>x.hash)};
  assert.equal(bytes.status,200);
  assert.ok(bBlobs.some(item=>item.hash===hash),'Recipient has the reference and no local attachment bytes');
  return log['BR-002'];
 });
 await check('BR-003','Dirty note switch without blur preserves record ownership locally and remotely',async()=>{
  await go(a.page,'Notes & Graph');
  const first=await createNote(a.page,'CrossNote Alpha','Alpha original');
  const second=await createNote(a.page,'CrossNote Beta','Beta original');
  const noteCard=name=>a.page.locator('.dp-split-list .dp-card').filter({hasText:name}).first();
  await noteCard('CrossNote Alpha').click();
  await editor(a.page).fill('Alpha draft should stay Alpha');
  const focused=await editor(a.page).evaluate(el=>document.activeElement===el);
  await noteCard('CrossNote Beta').dispatchEvent('click');
  await delay(1100);
  const local=await rows(a.page);
  const alpha=local.find(x=>x.id===first.id)?.payload.content;
  const beta=local.find(x=>x.id===second.id)?.payload.content;
  await delay(2500);
  const serverA=remote(first.id)?.payload.content;
  const serverB=remote(second.id)?.payload.content;
  log.crossNotes.push({trigger:'programmatic click without blur',focused,alpha,beta,serverA,serverB});
  await save();
  assert.equal(alpha,'Alpha draft should stay Alpha');
  assert.equal(beta,'Beta original');
  return log.crossNotes[0];
 });
 await check('BR-004','Network-offline edit is saved locally and pushes when restored',async()=>{
  await go(a.page,'Notes & Graph');
  const rec=await createNote(a.page,'Offline continuation','Before outage');
  await until(()=>Promise.resolve(remote(rec.id)),item=>item?.payload.content==='Before outage',15000);
  await a.context.setOffline(true);
  try{
   await editor(a.page).fill('Draft during outage');
   await updateSnapshot(a.page);
   await until(()=>get(a.page,'note','Offline continuation'),row=>row?.payload.content==='Draft during outage');
   const localOutbox=await idb(a.page,'outbox','read');
   log['BR-004']={offlineQueue:localOutbox.filter(x=>x.recordId===rec.id).length,serverDuring:remote(rec.id)?.payload.content};
   assert.equal(remote(rec.id)?.payload.content,'Before outage');
  }finally{await a.context.setOffline(false);}
  await until(()=>Promise.resolve(remote(rec.id)),row=>row?.payload.content==='Draft during outage',20000);
  return {...log['BR-004'],afterRestore:remote(rec.id)?.payload.content};
 });
 await Promise.all([a.context.close(),b.context.close()]);
 }
}finally{
 await save();
 await browser.close();
 app.server.closeAllConnections();
 await app.close();
}

