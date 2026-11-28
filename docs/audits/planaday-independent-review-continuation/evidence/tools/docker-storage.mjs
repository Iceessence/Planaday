import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const distro = 'PlanadayAuditD82';
const socket = 'unix:///tmp/planaday-audit-docker.sock';
const testName = 'planaday-d82-audit-storage';
const run = Date.now();
const volume = 'planaday_d82_audit_db_' + run;
const bind = '/var/lib/planaday-audit-blobs-' + run;
const image = 'planaday-audit-d82:source';
const base = 'http://127.0.0.1:43000';
const wsl = (...args) => execFileSync('wsl.exe', ['-d', distro, '--', ...args], {encoding:'utf8'}).trim();
const docker = (...args) => wsl('/opt/planaday-audit/docker/docker', '-H', socket, ...args);
const bytes = Buffer.from('Planaday isolated nested mount check D82\n');
const hash = createHash('sha256').update(bytes).digest('hex');
function start(){
 return docker('run','--detach','--name',testName,'--network','host','-e','HOST=127.0.0.1',
  '-e','PORT=43000','--mount',`source=${volume},target=/data`,
  '--mount',`type=bind,source=${bind},target=/data/blobs`,image);
}
async function json(route, options){
 const result=await fetch(base+route,options);
 assert.ok(result.ok,route+' '+result.status);
 return result.json();
}
async function ready(){
 for(let tries=0;tries<80;tries++){
  try{return await json('/api/health');}
  catch{await new Promise(resolve=>setTimeout(resolve,250));}
 }
 throw new Error('Audit service did not bind to '+base);
}
function mountDetails(){
 return JSON.parse(docker('inspect','--format','{{json .Mounts}}',testName));
}
const date='2026-11-24T13:00:00Z';
const record={id:'isolated-mount-note-d82',rev:1,deviceId:'isolated-d82',workspaceId:'ws_personal',type:'note',
 title:'Synthetic nested mount note',status:'active',createdAt:date,updatedAt:date,deletedAt:null,tags:[],
 payload:{content:'Synthetic Docker storage proof'}};
const details={};
wsl('install','-d','-o','1000','-g','1000','-m','0750',bind);
docker('volume','create',volume);
try{
 details.firstID=start();
 details.before=await ready();
 details.mounts=mountDetails();
 assert.ok(details.mounts.some(x=>x.Type==='volume'&&x.Destination==='/data'&&x.Name===volume));
 assert.ok(details.mounts.some(x=>x.Type==='bind'&&x.Destination==='/data/blobs'&&x.Source===bind));
 const user=docker('exec',testName,'id','-u'); assert.equal(user,'1000'); details.uid=user;
 const op={opId:'isolated-mount-op-d82',recordId:record.id,operation:'upsert',record,baseRev:0};
 const accepted=await json('/api/sync/push',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({deviceId:'isolated-d82',operations:[op]})});
 assert.ok(accepted.acceptedOpIds.includes(op.opId));
 const uploaded=await fetch(base+'/api/blobs/'+hash,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:bytes});
 assert.ok(uploaded.ok);
 const backup=await json('/api/storage/backup',{method:'POST'});
 assert.equal(backup.ok,true);
 details.beforeReplacement=await json('/api/storage/info');
 assert.equal(details.beforeReplacement.blobCount,1);
 assert.equal(details.beforeReplacement.backups.length,1);
 details.bindFiles=wsl('ls','-1',bind).split(/\r?\n/);
 assert.ok(details.bindFiles.includes(hash+'.bin') && details.bindFiles.includes('db-backups'));
 docker('stop',testName);
 docker('rm',testName);
 details.replacementID=start(); assert.notEqual(details.firstID,details.replacementID);
 details.after=await ready(); assert.equal(details.after.recordCount,1);
 const pull=await json('/api/sync/pull?since=0');
 assert.ok(JSON.stringify(pull).includes(record.id)&&JSON.stringify(pull).includes(record.payload.content));
 const downloaded=await fetch(base+'/api/blobs/'+hash);
 assert.ok(downloaded.ok); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
 details.backupRetained=(await json('/api/storage/info')).backups.length===1;
 assert.equal(details.backupRetained,true);
 details.blobSha256=hash;
 details.success=true;
} finally {
 console.log(JSON.stringify(details,null,2));
 try{docker('rm','-f',testName);}catch{}
}
