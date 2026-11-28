import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [directory,artifactPath]=process.argv.slice(2);
const out=path.resolve(directory);
const read=file=>readFileSync(path.join(out,file),'utf8').replace(/^\uFEFF/,'');
const json=file=>JSON.parse(read(file));
const prior=read('../planaday-independent-review/02_COMPLETE_FEATURE_MATRIX.md');
const config=json('evidence/matrix-mapping.json');
const routeData=json('evidence/web-chromium/results.json').routeMatrix;
const evidenceRoot='evidence/';
let section='';
const base=[];
for(const line of prior.split(/\r?\n/)){
 const heading=line.match(/^## (\d+(?:\.\d+)?) (.*)$/);
 if(heading) section=heading[1];
 const row=line.match(/^\| (.*?) \| (NOT VERIFIED|PARTIALLY IMPLEMENTED|BROKEN|NOT IMPLEMENTED) \| (.*?) \|$/);
 if(row)base.push([section,row[1],row[2],row[3]]);
}
assert.equal(base.length,494);
const columns=['Requirement ID','Feature','Requirement','Source','Source files','Desktop','Mobile emulation',
 'Android emulator','Physical Android','iOS','Local persistence','Synchronization','Offline behavior','UI/UX',
 'Error handling','Performance','Test IDs','Evidence','Final classification','Remaining limitations'];
const dash='Not exercised';
const blockedAndroid='Blocked in this run. Owner chose emulator scope';
const blockedIOS='Physical Apple platform blocked. WebKit scope recorded separately';
const neutral=[dash,dash,dash,blockedAndroid,blockedIOS,dash,dash,dash,dash,dash,dash];
const classPartial='PARTIALLY IMPLEMENTED';
const B='BROKEN';
const N='NOT VERIFIED';
const classRequirement='BLOCKED — REQUIREMENT';
const resolveArea=section=>config.areas[section];
const descriptions={
 W:'browser-workflows/results.json', R:'reference-suite.txt', M:'web-chromium/results.json', A:'android-native/preflight.json',
 T:'notes-followup/browser-results.json', N:'native-notifications.txt', S:'reliability-suite.txt',
 P:'prior-issue-regressions.txt', D:'isolated-docker-storage.txt', B:'ordinary-blobs.jsonl',
 L:'notes-size/results.json', C:'production-metadata.json', X:'long-notes/browser-results.json',
 E:'repository-suite.txt', I:'android-5568/smoke.json', F:'firefox-diagnostic.json'};
const evidenceFile=key=>key.startsWith('../')?key.slice(3):evidenceRoot+(descriptions[key]??key);
const classify={V:'VERIFIED COMPLETE',M:'MOSTLY COMPLETE',P:classPartial,U:'UI ONLY',B,Z:'NOT IMPLEMENTED',
 G:'REGRESSION',A:'BLOCKED — ENVIRONMENT',Q:classRequirement,N};
const known={};
for(const rule of config.rules){
 const [ids,status,tests,refs,summary,limits,fields={}]=rule;
 for(const n of ids.split(',')){
  assert.ok(!known[n],n);
  known[n]={status:classify[status],tests,refs,summary,limits,fields};
 }
}
const makeDims=(special,otherwise=neutral)=>otherwise.map((value,index)=>special?.[String(index)]??value);
const coreUI='Open the named workspace, use the exact control, exercise a positive and a boundary case, then reload and recheck.';
const rows=base.map(([sec,name,old,priorStatement],i)=>{
 const number=i+1;
 const data=known[number];
 const [feature,files,next]=resolveArea(sec);
 const classification=data?.status??old;
 const priorEvidence=old===N?'':priorStatement;
 const original=old===N?'':` Prior classification ${old}. ${priorEvidence}`;
 const gap=data?.limits??`${next} ${coreUI}${original}`;
 const extra=data?.summary??'';
 const dims=makeDims(data?.fields);
 if(extra && data?.fields?.['0']===undefined)dims[0]=extra;
 const exactFiles=config.sources[number]??files;
 return [`R-${String(number).padStart(4,'0')}`,feature,name,`Owner brief §${sec}`,exactFiles,
  ...dims, data?.tests??(priorEvidence?'PRIOR':'—'),
  data?.refs?.split(',').map(evidenceFile).join('; ')??(priorEvidence?'../planaday-independent-review/02_COMPLETE_FEATURE_MATRIX.md':'—'),
  classification,gap];
});
const navRows=routeData.filter(r=>r.fixture==='blank'&&r.view==='desktop');
assert.equal(navRows.length,54);
assert.equal(config.routes.length,54);
for(const [i,row] of navRows.entries()){
 const [label,files]=config.routes[i];
 assert.equal(row.label,label);
 const samples=routeData.filter(r=>r.label===row.label);
 assert.equal(samples.length,46);
 const overflow=Math.max(...samples.map(r=>r.stageOverflow));
 const unnamed=Math.max(...samples.map(r=>r.unnamed.length));
 const tiny=Math.max(...samples.map(r=>r.tinyCount));
 const layout=`Max stage overflow ${overflow}px, unnamed ${unnamed}, sub-24px flags ${tiny}`;
 rows.push([`C-${String(i+1).padStart(4,'0')}`,label,`Open ${label} from the configured navigation and render its workspace.`,
  'Discovered registered workspace in current source',files,
  'Rendered in two Chromium fixture profiles at 1440 × 960',
  'Rendered at all 11 viewport pairs in both profiles',dash,blockedAndroid,blockedIOS,
  'Not exercised in this route-render case','Not exercised in this route-render case',dash,layout,dash,dash,
  'UI-001 through UI-003',evidenceFile('M'),overflow?'PARTIALLY IMPLEMENTED':'MOSTLY COMPLETE',
  'Route-render coverage. Exercise the workspace’s populated data lifecycle, direct small-screen navigation, accessibility, and native entry.']);
}
for(const [i,item] of config.extras.entries()){
 const [name,requirement,files,status,tests,refs,dims,limit]=item;
 assert.ok(classify[status]);
 rows.push([`C-${String(i+55).padStart(4,'0')}`,name,requirement,'Discovered current-source behavior or configuration',files,
  ...makeDims(dims),tests,refs.split(',').map(evidenceFile).join('; '),classify[status],limit]);
}
assert.equal(new Set(rows.map(row=>row[0])).size,rows.length);
assert.ok(rows.every(row=>row.length===20&&row.every(cell=>typeof cell==='string'&&cell.length)));
const csvCell=cell=>'"'+cell.replaceAll('"','""')+'"';
const csv=[columns,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
const {Workbook}=await import(pathToFileURL(artifactPath));
const workbook=await Workbook.fromCSV(csv,{sheetName:'Requirements'});
const roundTrip=workbook.worksheets.getItem('Requirements').getRange('A1:T'+(rows.length+1)).values;
const normalize=table=>table.map(row=>row.map(value=>typeof value==='string'?value:String(value)));
assert.deepEqual(normalize(roundTrip),[columns,...rows]);
writeFileSync(path.join(out,'03_FEATURE_VERIFICATION_MATRIX.csv'),csv);
const md=cell=>cell.replaceAll('|','\\|').replaceAll('\n',' ');
const evidenceLink=cell=>cell==='—'?'—':cell.split('; ').map(file=>`[${file.split('/').at(-1)}](${file})`).join(', ');
const counts=items=>Object.fromEntries(Object.keys(classify).map(key=>[classify[key],items.filter(r=>r[18]===classify[key]).length]));
const header=(items)=>'| '+items.map(md).join(' | ')+' |\n';
const stats={owner:counts(rows.slice(0,494)),discovered:counts(rows.slice(494)),total:rows.length,ownerContinuationMapped:Object.keys(known).length,baseline:494};
let report='# Complete feature verification matrix\n\n';
report+='Revision `d82bdc7`. Stable R IDs preserve the 494 owner rows in prior order. C IDs trace current registered routes and additional code-derived behaviors. A route render does not establish its data lifecycle. The [CSV](03_FEATURE_VERIFICATION_MATRIX.csv) has the same data.\n\n';
report+='| Classification | Owner rows | Source-derived rows |\n|---|---:|---:|\n';
for(const [label,count] of Object.entries(stats.owner)) report+=`| ${label} | ${count} | ${stats.discovered[label]} |\n`;
report+='\nRepeated items preserve the owner’s separate contexts. Engine-only cases are identified as such.\n\n';
function addSection(title,indexed){
 report+='## '+title+'\n\n'+header(columns)+'|'+columns.map(()=> '---').join('|')+'|\n';
 for(const row of indexed){
  const linked=row.map((value,index)=>index===17?evidenceLink(value):value);
  report+=header(linked);
 }
 report+='\n';
}
let line=0;
for(const sec of [...new Set(base.map(row=>row[0]))]){
 const length=base.filter(row=>row[0]===sec).length;
 addSection('Owner §'+sec+' · '+config.areas[sec][0],rows.slice(line,line+length));
 line+=length;
}
addSection('Registered navigation workspaces',rows.slice(494,548));
addSection('Additional current-source behaviors',rows.slice(548));
writeFileSync(path.join(out,'02_COMPLETE_FEATURE_VERIFICATION_MATRIX.md'),report);
writeFileSync(path.join(out,'evidence/matrix-summary.json'),JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({columns:columns.length,artifactToolRoundTrip:true,...stats}));
