import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [snap, evidence, playPath, engine = 'chromium'] = process.argv.slice(2);
const snapshot = path.resolve(snap);
const destination = path.resolve(evidence);
await mkdir(destination, { recursive: true });
const { default: playwright } = await import(pathToFileURL(playPath));
const { buildDayplanaServer } = await import(pathToFileURL(path.join(snapshot, 'dist-server/index.js')));
const { app } = await buildDayplanaServer({ dataDir: await mkdtemp(path.join(snapshot, 'matrix-')) });
const origin = await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await playwright[engine].launch(engine === 'chromium'
  ? { channel: 'chrome', args: ['--disable-background-networking', '--no-proxy-server'] }
  : {});
const report = { engine, version: browser.version(), routeMatrix: [], interactions: [], errors: [], requests: [], cases: [] };
const widths = [[320,700],[360,780],[375,812],[390,844],[393,852],[412,915],[430,932],[480,900],[600,950],[768,1024],[1024,1366]];
const layouts = widths.flatMap(([w,h]) => [{ width:w, height:h, orientation:'portrait' },
  { width:h, height:w, orientation:'landscape' }]);
const source = await readFile(path.join(snapshot, 'src/core/db.ts'), 'utf8');
const allModules = [...source.split('export const DEFAULT_ENABLED_MODULES')[1].split('};')[0]
  .matchAll(/^\s*(\w+):\s*(?:true|false)/gm)].map(match=>match[1]);
const textEditor = 'textarea[placeholder^="Write freely"]';
const useNames = page => page.locator('.dp-sidebar .dp-nav-btn');
const settle = async page => {
  await page.locator('.dp-app').waitFor();
  await page.getByText('Loading Planaday studio…',{exact:true}).waitFor({state:'hidden',timeout:8000}).catch(()=>{});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const nav = async (page,label) => {
  await useNames(page).filter({has:page.getByText(label,{exact:true})}).first().click();
  await settle(page);
};
const labelNoBadge = button => (button.querySelector('span:not(.dp-nav-count)')?.textContent ?? button.textContent).trim();
const save = () => writeFile(path.join(destination,'results.json'),JSON.stringify(report,null,2));
const records = page => page.evaluate(() => new Promise((resolve,reject) => {
  const open=indexedDB.open('dayplana-v2');
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
    const database=open.result;
    const req=database.transaction('records').objectStore('records').getAll();
    req.onsuccess=()=>{database.close();resolve(req.result);};
    req.onerror=()=>reject(req.error);
  };
}));
async function initialize(page, sample) {
  await page.goto(origin);
  await settle(page);
  const onboard = page.locator('dialog[open]');
  if (await onboard.count()) {
    const checkbox=onboard.locator('input[type=checkbox]').first();
    if (await checkbox.count() && await checkbox.isChecked() !== sample) await checkbox.setChecked(sample);
    if (sample) await onboard.locator('button.dp-btn-primary').first().click();
    else await onboard.getByRole('button',{name:'Close dialog'}).click();
    await onboard.waitFor({state:'hidden',timeout:8000});
  }
  await page.evaluate(modules => new Promise((resolve,reject) => {
    const r=indexedDB.open('dayplana-v2');
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{
      const db=r.result;
      const tx=db.transaction('settings','readwrite');
      const table=tx.objectStore('settings');
      const get=table.get('app-settings');
      get.onsuccess=()=>{
        const settings=get.result;
        settings.enabledModules=Object.fromEntries(modules.map(m=>[m,true]));
        settings.operatingMode='offline-computer';
        settings.mobileLayoutMode='adaptive';
        settings.collapsedSidebarGroups=[];
        table.put(settings);
      };
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>reject(tx.error);
    };
  }),allModules);
  await page.reload();
  await settle(page);
}
async function configureContext(options={}) {
  const context=await browser.newContext({viewport:{width:1440,height:960},...options});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.origin===origin ? route.continue() : route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({kind:'pageerror',message:e.message}));
  page.on('requestfailed',req=>{
    if(req.url().startsWith(origin))report.errors.push({kind:'request',url:new URL(req.url()).pathname,message:req.failure()?.errorText});
  });
  page.on('response',response=>{
    if(response.status()>=400 && response.url().startsWith(origin))report.requests.push({path:new URL(response.url()).pathname,status:response.status()});
  });
  return {context,page};
}
async function geometry(page){
  return page.locator('main').evaluate(main=>{
    const stage=main.getBoundingClientRect();
    const elements=[...main.querySelectorAll('button,a,input,select,textarea,[role="button"]')].filter(e=>e.getClientRects().length);
    const short=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent?.trim()||e.getAttribute('placeholder')||e.tagName).slice(0,85);
    const contained=(e,axis)=>{for(let p=e.parentElement;p&&p!==main;p=p.parentElement){if(/auto|scroll/.test(getComputedStyle(p)[axis]))return true;}return false;};
    const outside=elements.filter(e=>{
      const b=e.getBoundingClientRect();
      return (b.left<stage.left-2 || b.right>stage.right+2)&&!contained(e,'overflowX');
    });
    const missing=elements.filter(e=>e.tagName==='BUTTON'&&!e.textContent.trim()&&!e.hasAttribute('aria-label')&&!e.hasAttribute('aria-labelledby')&&!e.title);
    const tiny=elements.filter(e=>e.tagName==='BUTTON'&&Math.min(e.getBoundingClientRect().height,e.getBoundingClientRect().width)<24);
    const clipped=[...main.querySelectorAll('button,label,h1,h2,h3')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2&&/hidden|clip/.test(getComputedStyle(e).overflowX));
    const unordered=elements.filter(e=>e.tabIndex<0&&e.tagName==='BUTTON'&&!e.disabled);
    const brokenImages=[...main.querySelectorAll('img')].filter(el=>el.complete&&el.naturalWidth===0&&el.getClientRects().length);
    return { title:main.querySelector('h1,h2,h3')?.textContent.trim()??'',
      documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      stageOverflow:main.scrollWidth-main.clientWidth, controls:elements.length,
      outside:outside.map(short).slice(0,15), unnamed:missing.map(short).slice(0,15),
      tiny:tiny.map(short).slice(0,15), tinyCount:tiny.length, clipped:clipped.map(short).slice(0,15),
      unfocusable:unordered.map(short).slice(0,10), brokenImages:brokenImages.length };
  });
}
async function check(id, page, fn){
  try { report.cases.push({id,status:'pass',details:await fn()}); }
  catch (error) { report.cases.push({id,status:'fail',error:error.message.slice(0,750),surface:(await page.locator('main').innerText().catch(()=>'' )).slice(0,180)}); }
  console.log(report.cases.at(-1).status,id);
  await save();
}
try {
  if (engine==='chromium') {
    for (const sample of [false,true]) {
      const {context,page}=await configureContext();
      await initialize(page,sample);
      const labels=await useNames(page).evaluateAll((buttons,fn)=>buttons.map(new Function('return ('+fn+')')()),labelNoBadge.toString());
      const fixture=sample?'sample-data':'blank';
      report.interactions.push({fixture, visibleRoutes:labels, localRecords:(await records(page)).length});
      for(const label of labels){
        await page.setViewportSize({width:1440,height:960});
        try {
          await nav(page,label);
          const desktop=await geometry(page);
          report.routeMatrix.push({fixture,label,view:'desktop',width:1440,height:960,...desktop});
          for(const {width,height,orientation} of layouts){
            await page.setViewportSize({width,height});
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
            const metrics=await geometry(page);
            report.routeMatrix.push({fixture,label,view:orientation,width,height,...metrics});
            if(width===320&&orientation==='portrait'&&
              /Universal Files|Projects & Records|Camera & Photos|Physical Planner|Diary & Mood|Flow Calendar|Meal Planner/.test(label)){
              await page.screenshot({path:path.join(destination,fixture+'-'+label.replace(/[^a-z0-9]+/gi,'-')+'-320x700.png')});
            }
          }
        }catch(error){report.routeMatrix.push({fixture,label,error:error.message.slice(0,600)});}
        if (report.routeMatrix.length%100<23)await save();
      }
      await page.setViewportSize({width:393,height:852});
      await check(sample?'CB-002B':'CB-002A',page,async()=>{
        await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();
        const dialog=page.locator('dialog[open]');
        await dialog.waitFor();
        const buttons=await dialog.locator('button').allTextContents();
        const box=await dialog.boundingBox();
        assert.ok(box&&box.width<=393&&box.height<=852);
        const menu=dialog.locator('input[placeholder^="Jump to any module"]');
        await menu.fill('Task Calendar');
        await dialog.getByRole('button',{name:'Task Calendar',exact:true}).click();
        await settle(page);
        assert.match((await page.locator('main').innerText()).slice(0,280),/Task Calendar/i);
        return {drawerButtons:buttons.length, drawerFits:true, searchAndNavigate:'Task Calendar'};
      });
      await context.close();
    }
  } else {
    for(const mobile of [false,true]){
      const viewport=mobile?{width:393,height:852}:{width:1440,height:960};
      const {context,page}=await configureContext({viewport,hasTouch:mobile,...(engine==='webkit'&&mobile?{isMobile:true,deviceScaleFactor:3}:{})});
      await check((engine==='webkit'?'WK':'FF')+'-BOOT-'+(mobile?'M':'D'),page,async()=>{
        await initialize(page,false);
        const uv=await page.evaluate(()=>({width:innerWidth,height:innerHeight,ua:navigator.userAgent,serviceWorker:'serviceWorker'in navigator}));
        assert.ok((await page.locator('main').innerText()).trim().length>0);
        await page.screenshot({path:path.join(destination,'boot-'+(mobile?'mobile':'desktop')+'.png')});
        return uv;
      });
      await check((engine==='webkit'?'WK':'FF')+'-NOTE-'+(mobile?'M':'D'),page,async()=>{
        if(mobile){
          await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();
          await page.locator('dialog[open]').getByRole('button',{name:'Notes & Graph',exact:true}).click();
        }else await nav(page,'Notes & Graph');
        await page.getByRole('button',{name:'New Note',exact:true}).click();
        await page.locator(textEditor).fill('Audit engine text for persistence');
        await page.getByTitle('Save immediately & create version snapshot (Ctrl+S)').click();
        await page.waitForFunction(()=>document.body.innerText.includes('Saved locally')||document.body.innerText.includes('Saved just now'),{},{timeout:2000}).catch(()=>{});
        const saved=(await records(page)).filter(x=>x.type==='note'&&x.payload.content==='Audit engine text for persistence');
        assert.equal(saved.length,1);
        await page.reload();
        await settle(page);
        assert.equal((await records(page)).find(x=>x.id===saved[0].id)?.payload.content,'Audit engine text for persistence');
        return {noteId:saved[0].id,verified:'create, edit, save, reload'};
      });
      await context.close();
    }
  }
} finally {
  await save();
  await browser.close();
  app.server.closeAllConnections();
  await app.close();
}
