import { beforeEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildDayplanaServer } from '../server/index';
import { db, getOrInitSettings, storeBlob, updateSettings } from '../src/core/db';
import { runSyncCycle } from '../src/core/sync';
import { compactOutbox, createRecord, updateRecord, restoreFromTrash, softDeleteRecord } from '../src/core/repository';
import { exportFullZipBackup, importZipBackup } from '../src/core/backup';
import type { LifeRecord, OutboxOp, RecordType } from '../src/core/types';

const scratch=mkdtempSync(path.resolve('audit-sync-'));
const date='2026-11-24T13:00:00Z';
const sizes=[10,100,1000,2000,5000,10000];
beforeEach(async()=>{await Promise.all(db.tables.map(t=>t.clear()));});
function hash(bytes:Buffer){return createHash('sha256').update(bytes).digest('hex');}
function record(id:string, rev:number, deviceId:string, type:RecordType='note'):LifeRecord {
 return {id, rev, deviceId, workspaceId:'ws_personal', type, title:'Synthetic '+id,
   status:'active', createdAt:date, updatedAt:date, deletedAt:null, tags:[], payload:{content:'body '+rev}} as LifeRecord;
}
async function server(dir:string){
 const fixture=await buildDayplanaServer({dataDir:path.join(scratch,dir)});
 const base=await fixture.app.listen({host:'127.0.0.1',port:0});
 return {...fixture,base,stop:async()=>{fixture.app.server.closeAllConnections();await fixture.app.close();}};
}
async function client(base:string,deviceId:string){
 await getOrInitSettings();
 await updateSettings({operatingMode:'docker-sync',syncServerUrl:base,deviceId,lastSyncSeq:0,syncFallbackUrl:''});
}
function traceFetch(trace:{push:number,pull:number,requestBytes:number,responseBytes:number,latencies:number[]}):typeof fetch{
 return async (input,init)=>{
  const endpoint=new URL(String(input)).pathname;
  const started=performance.now();
  if(endpoint.endsWith('/push')) trace.push++;
  if(endpoint.endsWith('/pull')) trace.pull++;
  if(typeof init?.body==='string')trace.requestBytes+=Buffer.byteLength(init.body);
  const res=await fetch(input,init);
  trace.responseBytes+=(await res.clone().arrayBuffer()).byteLength;
  trace.latencies.push(performance.now()-started);
  return res;
 };
}
for(const count of sizes)for(const same of [true,false]){
 const label='SY-'+(same?'S':'D')+'-'+count;
 it(label+' compacts and drains real HTTP queue',async()=>{
  const srv=await server(label);
  try{
   await client(srv.base,'sync-source');
   const input:OutboxOp[]=Array.from({length:count},(_,i)=>{
    const rid=same?'shared':'separate-'+i;
    return {opId:label+'-'+i,recordId:rid,operation:'upsert',record:record(rid,same?i+1:1,'sync-source'),baseRev:0,createdAt:new Date(Date.parse(date)+i).toISOString()};
   });
   await db.outbox.bulkPut(input);
   const cpu=process.cpuUsage(), rss=process.memoryUsage().rss;
   const begin=performance.now();
   const compact=await compactOutbox();
   const compactMs=performance.now()-begin;
   const trace={push:0,pull:0,requestBytes:0,responseBytes:0,latencies:[] as number[]};
   const syncStart=performance.now();
   const state=await runSyncCycle(traceFetch(trace));
   const syncMs=performance.now()-syncStart;
   const used=process.cpuUsage(cpu);
   const [largest]=[...trace.latencies].sort((a,b)=>b-a);
   console.log(JSON.stringify({id:label,input:count,desktopRecords:srv.syncDb.getStats().recordCount,compacted:compact.after,compactMs:+compactMs.toFixed(1),syncMs:+syncMs.toFixed(1),push:trace.push,pull:trace.pull,requestBytes:trace.requestBytes,responseBytes:trace.responseBytes,maxRequestMs:+(largest??0).toFixed(1),cpuMs:+((used.user+used.system)/1000).toFixed(1),rssDeltaMiB:+((process.memoryUsage().rss-rss)/1048576).toFixed(1)}));
   expect(compact.after).toBe(same?1:count);
   expect(state.status).toBe('synced');
   expect(state.pendingCount).toBe(0);
   expect(srv.syncDb.getStats().recordCount).toBe(same?1:count);
   if(same)expect(srv.syncDb.pullSince(0).records[0].rev).toBe(count);
  }finally{await srv.stop();}
 },120000);
}
it('SY-013 retry after 503 retains queued records, then sends once',async()=>{
 const srv=await server('retry');
 try{
  await client(srv.base,'retry-device');
  const item=await createRecord('task','Synthetic retry',{});
  const rejected=await runSyncCycle(async (input,init)=>String(input).endsWith('/sync/push')
   ? new Response('Temporary service failure',{status:503})
   : fetch(input,init));
  expect(rejected.status).toBe('error');
  expect(rejected.pendingCount).toBe(1);
  expect(srv.syncDb.getStats().recordCount).toBe(0);
  const recovered=await runSyncCycle(fetch);
  expect(recovered.pendingCount).toBe(0);
  expect(srv.syncDb.pullSince(0).records.map(r=>r.id)).toEqual([item.id]);
 }finally{await srv.stop();}
});
it('SY-014 failed blob PUT must prevent a fully-synced status',async()=>{
 const srv=await server('blob-retry');
 try{
  await client(srv.base,'blob-device');
  const rec=await storeBlob(new Blob(['ordinary synthetic upload'],{type:'application/octet-stream'}),'audit.txt');
  await createRecord('note','Synthetic referenced attachment',{content:'file',attachmentBlobIds:[rec.hash]});
  const state=await runSyncCycle(async(input,init)=>String(input).includes('/api/blobs/')
   ? new Response('Synthetic temporary failure',{status:503})
   : fetch(input,init));
  const remote=await fetch(srv.base+'/api/blobs/'+rec.hash);
  console.log('SY-014 has remote bytes',remote.ok,'sync status',state.status,'remaining pending',state.pendingCount);
  expect(remote.ok).toBe(false);
  expect(state.status).not.toBe('synced');
 }finally{await srv.stop();}
});
it('SY-015 record edits, deletion, restore and types on the real HTTP server',async()=>{
 const srv=await server('types');
 try{
  await client(srv.base,'source-types');
  const types:RecordType[]=['note','task','chore','event','photo_asset','spreadsheet','presentation','whiteboard','lab_sample','decor_item','custom_space'];
  const originals=await Promise.all(types.map(type=>createRecord(type,'Synthetic '+type,{detail:'initial'})));
  expect((await runSyncCycle(fetch)).status).toBe('synced');
  expect(srv.syncDb.pullSince(0).records.map(x=>x.type).sort()).toEqual([...types].sort());
  const first=originals[0],changed=await updateRecord(first.id,{title:'Renamed'});
  expect(changed?.title).toBe('Renamed');
  await runSyncCycle(fetch);
  expect(srv.syncDb.pullSince(0).records.find(x=>x.id===first.id)?.title).toBe('Renamed');
  await softDeleteRecord(first.id);
  await runSyncCycle(fetch);
  expect(srv.syncDb.pullSince(0).records.find(x=>x.id===first.id)?.deletedAt).not.toBeNull();
  await restoreFromTrash(first.id);
  await runSyncCycle(fetch);
  expect(srv.syncDb.pullSince(0).records.find(x=>x.id===first.id)?.deletedAt).toBeNull();
 }finally{await srv.stop();}
});
it('SY-016 server accepts stable idempotency for retry of the same operation',async()=>{
 const srv=await server('dedupe');
 try{
  const r=record('same-op',1,'d');
  const body={deviceId:'d',operations:[{opId:'op-dedup',recordId:r.id,operation:'upsert',record:r,baseRev:0}]};
  const post=()=>fetch(srv.base+'/api/sync/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  const first=await post(),second=await post();
  expect(first.seq).toBe(1);
  expect(second.seq).toBe(first.seq);
  expect(srv.syncDb.getStats().recordCount).toBe(1);
 }finally{await srv.stop();}
});
it('ST-001 close and re-open selected SQLite snapshot and pre-existing synthetic file',async()=>{
 const srv=await server('restore-source');
 const content=Buffer.from('verifiable attachment');
 const item=await storeBlob(new Blob([content]),'audit.bin');
 const note=await createRecord('note','backup fixture',{content:'source',attachmentBlobIds:[item.hash]});
 await client(srv.base,'snapshot-device');
 await runSyncCycle(fetch);
 const reply=await fetch(srv.base+'/api/storage/backup',{method:'POST'}).then(r=>r.json());
 expect(reply.ok).toBe(true);
 const backup=srv.syncDb.createSqliteBackup(path.join(scratch,'cold-snapshot'));
 expect(backup.sizeBytes).toBeGreaterThan(0);
 const zip=await exportFullZipBackup();
 const before=await fetch(srv.base+'/api/blobs/'+item.hash);
 expect(hash(Buffer.from(await before.arrayBuffer()))).toEqual(item.hash);
 await srv.stop();
 const restore=await server('restore-source');
 try{
  expect(restore.syncDb.pullSince(0).records.find(x=>x.id===note.id)?.title).toBe(note.title);
  const reopened=await fetch(restore.base+'/api/blobs/'+item.hash);
  expect(hash(Buffer.from(await reopened.arrayBuffer()))).toEqual(item.hash);
 }finally{await restore.stop();}
 const target=await server('restore-cold');
 await target.stop();
 copyFileSync(backup.filePath,target.syncDb.dbPath);
 const restored=await server('restore-cold');
 try{
  expect(restored.syncDb.pullSince(0).records.find(x=>x.id===note.id)?.title).toBe(note.title);
  expect((await fetch(restored.base+'/api/blobs/'+item.hash)).status).toBe(404);
 }finally{await restored.stop();}
 await Promise.all(db.tables.map(t=>t.clear()));
 const imported=await importZipBackup(zip);
 expect(imported.importedRecords).toBeGreaterThan(0);
 expect(imported.importedBlobs).toBe(1);
 expect(await db.records.get(note.id)).toBeTruthy();
});
