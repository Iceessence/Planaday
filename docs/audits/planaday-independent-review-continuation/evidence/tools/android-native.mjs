import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [adb,destination,phase='preflight']=process.argv.slice(2);
const serial=process.env.PLANADAY_AUDIT_ADB_SERIAL || 'emulator-5564';
const pkg='org.planaday.audit.d82bdc7';
const adbArgs=(...args)=>execFileSync(adb,['-s',serial,...args],{maxBuffer:16*1024*1024,windowsHide:true});
const sh=(...args)=>adbArgs('shell',...args).toString().trim();
assert.equal(sh('getprop','ro.kernel.qemu'),'1','Audit actions require the designated emulator');
assert.match(sh('pm','path',pkg),/^package:/);
await mkdir(destination,{recursive:true});
const result={phase,os:sh('getprop','ro.build.version.release'),ime:sh('settings','get','secure','default_input_method'),checks:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=()=>writeFile(path.join(destination,phase+'.json'),JSON.stringify(result,null,2));
const screenshot=name=>writeFile(path.join(destination,name+'.png'),adbArgs('exec-out','screencap','-p'));
async function until(fn,predicate=Boolean,timeout=9000){
  const deadline=Date.now()+timeout;
  let result;
  while(Date.now()<deadline){
    result=await fn().catch(error=>error.message);
    if(predicate(result))return result;
    await sleep(150);
  }
  throw new Error('Timed out: '+JSON.stringify(result)?.slice(0,270));
}
function tap(x,y){sh('input','tap',String(x),String(y));}
function key(name){sh('input','keyevent',name);}
const editor='textarea[placeholder^="Write freely"]';
let ws, forwarded;
async function attach(){
  if(ws?.readyState===WebSocket.OPEN)ws.close();
  if(forwarded)adbArgs('forward','--remove','tcp:'+forwarded);
  const pid=await until(async()=>sh('pidof',pkg),value=>/^\d+$/.test(value));
  const socket='webview_devtools_remote_'+pid;
  await until(async()=>sh('cat','/proc/net/unix'),text=>text.includes('@'+socket));
  forwarded=adbArgs('forward','tcp:0','localabstract:'+socket).toString().trim();
  const targets=await until(async()=>{
    const body=await fetch('http://127.0.0.1:'+forwarded+'/json').then(res=>res.json());
    return body.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
  });
  const debugUrl=new URL(targets.webSocketDebuggerUrl);
  debugUrl.hostname='127.0.0.1'; debugUrl.port=forwarded;
  ws=new WebSocket(debugUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  let id=0;
  const pending=new Map();
  ws.addEventListener('message',({data})=>{
    const parsed=JSON.parse(data);
    pending.get(parsed.id)?.(parsed);
  });
  cdp=(method,params={})=>new Promise((resolve,reject)=>{
    const seq=++id;
    const timeout=setTimeout(()=>reject(new Error(method+' timeout')),25000);
    pending.set(seq,message=>{
      clearTimeout(timeout);pending.delete(seq);
      if(message.error)reject(new Error(message.error.message));else resolve(message.result);
    });
    ws.send(JSON.stringify({id:seq,method,params}));
  });
  await until(()=>evalUI("Boolean(document.querySelector('.dp-app'))"));
}
let cdp;
async function evalUI(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result.value;
}
const click=label=>until(()=>evalUI(`(() => {
 const el=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&
 [b.innerText.trim(),b.getAttribute('aria-label'),b.title].includes(${JSON.stringify(label)}));
 if(!el)return false;
 el.click();return true;
})()`));
async function navigate(label){
  const sidebarVisible=await evalUI("Boolean(document.querySelector('.dp-sidebar')?.getClientRects().length)");
  if(!sidebarVisible){
    await click('Open navigation menu');
    await until(()=>evalUI("Boolean(document.querySelector('dialog[open]'))"));
  }
  await click(label);
  await until(()=>evalUI("!document.querySelector('dialog[open]')&&!document.querySelector('main')?.innerText.includes('Loading Planaday studio')"));
}
const has=selector=>until(()=>evalUI(`Boolean(document.querySelector(${JSON.stringify(selector)}))`));
const readRecords=type=>evalUI(`new Promise((resolve,reject)=>{
  const req=indexedDB.open('dayplana-v2');
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{const db=req.result;const read=db.transaction('records').objectStore('records').getAll();
    read.onsuccess=()=>{db.close();resolve(read.result.filter(r=>r.type===${JSON.stringify(type)}));};read.onerror=()=>reject(read.error);};
})`);
async function setValue(selector,value){
  await has(selector);
  await evalUI(`(() => {
    const el=document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
}
async function check(id,fn){
 try {result.checks.push({id,status:'pass',details:await fn()});}
 catch(error){result.checks.push({id,status:'fail',error:error.message.slice(0,620)});}
 console.log(result.checks.at(-1).status,id);
 await save();
}
async function reopen(){
  sh('am','start','-n',pkg+'/.MainActivity');
  await attach();
}
try{
 await attach();
 const openOnboarding=await evalUI("Boolean(document.querySelector('dialog[open]'))");
 if(openOnboarding)await click('Close dialog');
 await check('AN-001',async()=>{
   const bridge=await evalUI("({native:window.Capacitor?.isNativePlatform(),platform:window.Capacitor?.getPlatform(),notifications:window.Capacitor?.isPluginAvailable('LocalNotifications'),origin:location.origin,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],agent:navigator.userAgent})");
   assert.equal(bridge.platform,'android');assert.equal(bridge.native,true);assert.equal(bridge.notifications,true);
   result.bridge=bridge;
   await screenshot('native-home');
   return bridge;
 });
 if(phase==='preflight'){
  await check('AN-002',async()=>{
   await navigate('Notes & Graph');
   await click('New Note');
   const a=JSON.stringify(editor);
   await has(editor);
   await setValue(editor,'begin  end');
   await click('Save immediately & create version snapshot (Ctrl+S)');
   let viewport=await evalUI(`(() => {const e=document.querySelector(${a});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:(r.left+Math.min(70,r.width/3))*devicePixelRatio,y:(r.top+Math.min(20,r.height/3))*devicePixelRatio};})()`);
   tap(Math.round(viewport.x),Math.round(viewport.y+63));
   await evalUI(`(() =>{const e=document.querySelector(${a});e.focus();e.setSelectionRange(6,6);})()`);
   await sleep(1500);
   await screenshot('keyboard-ready');
   const details=await evalUI(`({text:document.querySelector(${a}).value,selection:document.querySelector(${a}).selectionStart,innerHeight,visualHeight:visualViewport.height,hasFocus:document.activeElement===document.querySelector(${a})})`);
   assert.equal(details.selection,6);
   return details;
  });
  }else if(phase==='smoke'){
  await check('AN-005',async()=>{
   await navigate('Notes & Graph');
   await click('New Note');
   const payload='Android compatibility fixture '+result.os;
   await setValue(editor,payload);
   await click('Save immediately & create version snapshot (Ctrl+S)');
   const saved=await until(()=>readRecords('note'),items=>Array.isArray(items)&&items.some(r=>r.payload.content===payload));
   sh('am','force-stop',pkg);await reopen();
   assert.ok((await readRecords('note')).some(r=>r.id===saved.find(x=>x.payload.content===payload).id));
   return {stored:true,reopenedAfterForceStop:true};
  });
 }else if(phase==='keyboard'){
  await check('AN-003',async()=>{
   const coords=JSON.parse(process.argv[5]);
   const el=JSON.stringify(editor);
   const start=await evalUI(`({value:document.querySelector(${el}).value,selection:document.querySelector(${el}).selectionStart})`);
   for(const [x,y] of coords)tap(x,y);
   await sleep(900);
   const pending=await evalUI(`({value:document.querySelector(${el}).value,selection:document.querySelector(${el}).selectionStart})`);
   await screenshot('keyboard-after-typing');
   return {start,pending};
  });
 }else if(phase==='keyboard-finish'){
  await check('AN-004',async()=>{
   const coord=JSON.parse(process.argv[5]);
   const expected=process.argv[6];
   const el=JSON.stringify(editor);
   const before=await evalUI(`document.querySelector(${el}).value`);
   tap(coord[0],coord[1]); await sleep(850);
   const after=await evalUI(`({value:document.querySelector(${el}).value,selection:document.querySelector(${el}).selectionStart})`);
   result.keyboard={before,after};
   await screenshot('keyboard-after-correction');
   key('KEYCODE_BACK');
   await click('Save immediately & create version snapshot (Ctrl+S)');
   const saved=(await readRecords('note')).find(n=>n.payload.content===after.value);
   result.keyboard.saved=!!saved;
   sh('am','force-stop',pkg);
   await reopen();
   const reopened=(await readRecords('note')).find(n=>n.id===saved?.id);
   result.keyboard.reopened=reopened?.payload.content;
   assert.equal(reopened?.payload.content,expected);
   return result.keyboard;
  });
 }else if(phase==='background-sync'){
  await check('AN-008',async()=>{
   const snapshot=process.argv[5];
   const {buildDayplanaServer}=await import(pathToFileURL(path.join(snapshot,'dist-server/index.js')));
   const {app,syncDb}=await buildDayplanaServer({dataDir:await mkdtemp(path.join(snapshot,'native-sync-'))});
   const url=await app.listen({host:'127.0.0.1',port:0});
   const port=new URL(url).port, target='tcp:'+port;
   const enable=()=>adbArgs('reverse',target,target);
   const disable=()=>adbArgs('reverse','--remove',target);
   const name='Native screen-off sync '+Date.now();
   const details={observationSeconds:45};
   result.background=details;
   try{
    enable();
    const serverUrl='http://127.0.0.1:'+port;
    await evalUI(`new Promise((resolve,reject)=>{
      const request=indexedDB.open('dayplana-v2');
      request.onsuccess=()=>{
       const db=request.result, tx=db.transaction('settings','readwrite');
       const table=tx.objectStore('settings'), item=table.get('app-settings');
       item.onsuccess=()=>table.put({...item.result, operatingMode:'docker-sync',
        syncServerUrl:${JSON.stringify(serverUrl)},syncFallbackUrl:'',lastSyncSeq:0,onboardingCompleted:true});
       tx.oncomplete=()=>{db.close();resolve(true);};
       tx.onerror=()=>reject(tx.error);
      };
    })`);
    sh('am','force-stop',pkg); await reopen();
    await navigate('Notes & Graph');
    await click('New Note');
    await setValue('input[aria-label="Note title"]',name);
    const note=await until(()=>readRecords('note'),rows=>Array.isArray(rows)&&rows.some(r=>r.title===name));
    const id=note.find(r=>r.title===name).id;
    const onServer=()=>syncDb.pullSince(0).records.find(r=>r.id===id)?.payload?.content;
    const baseline='Foreground baseline';
    await setValue(editor,baseline);
    await until(()=>readRecords('note'),rows=>Array.isArray(rows)&&rows.some(r=>r.id===id&&r.payload.content===baseline));
    await click('Save immediately & create version snapshot (Ctrl+S)');
    details.foreground=await until(async()=>onServer(),value=>value===baseline,26000);
    disable();
    const update='Queued before display sleep';
    await setValue(editor,update);
    await until(()=>readRecords('note'),rows=>Array.isArray(rows)&&rows.some(r=>r.id===id&&r.payload.content===update));
    await click('Save immediately & create version snapshot (Ctrl+S)');
    details.wireBefore=onServer();
    assert.equal(details.wireBefore,baseline);
    key('KEYCODE_SLEEP');
    await sleep(1000);
    details.powerStart=sh('dumpsys','power').split('\n').find(line=>line.includes('mWakefulness=')).trim();
    enable();
    await sleep(details.observationSeconds*1000);
    details.powerEnd=sh('dumpsys','power').split('\n').find(line=>line.includes('mWakefulness=')).trim();
    details.wireDuringSleep=onServer();
    key('KEYCODE_WAKEUP'); sh('wm','dismiss-keyguard'); await reopen();
    details.wireAfterWake=await until(async()=>onServer(),value=>value===update,26000);
    assert.equal(details.powerStart,'mWakefulness=Asleep');
    assert.equal(details.powerEnd,'mWakefulness=Asleep');
    return details;
   }finally{
    try{disable();}catch{}
    app.server.closeAllConnections();
    await app.close();
   }
  });
 }else if(phase==='notifications'){
  async function startTimer(label,seconds){
    await navigate('Timers & Audio');
    await setValue('input[placeholder^="Label (e.g."]',label);
    await setValue('input[aria-label="Minutes"]','0');
    await setValue('input[aria-label="Seconds"]',String(seconds));
    await click('Start');
    const stored=await until(()=>readRecords('timer'),rows=>Array.isArray(rows)&&rows.some(r=>r.title===label));
    return stored.find(r=>r.title===label);
  }
  const pluginState=()=>evalUI(`(async()=>{
   const p=window.Capacitor.Plugins.LocalNotifications;
   return {permissions:await p.checkPermissions(),pending:await p.getPending(),exact:await p.checkExactNotificationSetting().catch(()=>null)};
  })()`);
  const delivered=()=>sh('dumpsys','notification').split('\n').filter(line=>line.includes(pkg)&&/NotificationRecord|NotificationChannel/.test(line)).slice(0,20).map(l=>l.trim());
  const scenarios=[['AN-006A','Foreground',null],['AN-006B','Home','KEYCODE_HOME'],['AN-006C','Locked','KEYCODE_SLEEP']];
  for(const [id,name,transition] of scenarios){
    await check(id,async()=>{
     let rec=await startTimer('Synthetic '+name,12);
     const state=await pluginState();
     if(transition)key(transition);
     await sleep(14500);
     const notifications=delivered();
     if(transition==='KEYCODE_SLEEP'){key('KEYCODE_WAKEUP');sh('wm','dismiss-keyguard');}
     if(transition)await reopen();
     result[id]={timerId:rec.id,permissions:state.permissions,exact:state.exact,pending:state.pending,visibleNativeNotificationRecords:notifications};
     const own=state.pending.notifications.find(n=>n.title.includes(name)); if(!own)throw new Error('No matching scheduled notification'); assert.ok(notifications.some(line=>line.includes(' id='+own.id+' ')),'Scheduled ID was absent from native notification records');
     return result[id];
    });
  }
 }
} finally {
 await save();
 if(ws?.readyState===WebSocket.OPEN)ws.close();
 if(forwarded)adbArgs('forward','--remove','tcp:'+forwarded);
}


