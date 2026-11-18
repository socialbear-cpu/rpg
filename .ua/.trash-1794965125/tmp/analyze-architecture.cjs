const fs=require('fs');
const [inputPath,outputPath]=process.argv.slice(2);
const {fileNodes,importEdges,allEdges}=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const fileById=new Map(fileNodes.map(n=>[n.id,n]));
const pathOf=n=>(n.filePath||n.name||n.id).replace(/\\/g,'/');
const directories=fileNodes.map(n=>pathOf(n).split('/').slice(0,-1));
let prefix=[]; if(directories.length){prefix=[...directories[0]];for(const d of directories.slice(1)){let i=0;while(i<prefix.length&&i<d.length&&prefix[i]===d[i])i++;prefix=prefix.slice(0,i)}}
const groupName=n=>{const seg=pathOf(n).split('/');const dir=seg.slice(0,-1);if(prefix.length&&prefix.every((x,i)=>dir[i]===x)){const rest=dir.slice(prefix.length);return rest[0]||'root'}return dir[0]||'root'};
const directoryGroups={}; for(const n of fileNodes)(directoryGroups[groupName(n)]??=[]).push(n.id);
const nodeTypeGroups={}; for(const n of fileNodes)(nodeTypeGroups[n.type]??=[]).push(n.id);
const fanIn={},fanOut={},inter={};for(const n of fileNodes){fanIn[n.id]=0;fanOut[n.id]=0}
const getGroup=id=>{const n=fileById.get(id);return n?groupName(n):null};
for(const e of importEdges){fanOut[e.source]++;fanIn[e.target]++;const a=getGroup(e.source),b=getGroup(e.target);if(a&&b){const k=a+' -> '+b;inter[k]=(inter[k]||0)+1}}
const density={};for(const [group,ids] of Object.entries(directoryGroups)){const set=new Set(ids),edges=importEdges.filter(e=>set.has(e.source)||set.has(e.target));const internal=edges.filter(e=>set.has(e.source)&&set.has(e.target)).length;density[group]={internalEdges:internal,totalEdges:edges.length,density:edges.length?internal/edges.length:0}}
const cats={};for(const e of allEdges){const a=fileById.get(e.source),b=fileById.get(e.target);if(!a||!b)continue;const k=[a.type,b.type,e.type].join('|');cats[k]=(cats[k]||0)+1}
const sortedInter=Object.entries(inter).map(([key,count])=>{const [from,to]=key.split(' -> ');return {from,to,count}}).sort((a,b)=>b.count-a.count);
const report={scriptCompleted:true,fileStats:{totalFileNodes:fileNodes.length,totalImports:importEdges.length,byType:Object.fromEntries(Object.entries(nodeTypeGroups).map(([k,v])=>[k,v.length]))},directoryGroups,nodeTypeGroups,crossCategoryEdges:Object.entries(cats).map(([k,count])=>{const [fromType,toType,edgeType]=k.split('|');return {fromType,toType,edgeType,count}}),interGroupImports:sortedInter,intraGroupDensity:density,fanInFanOut:{highestFanIn:Object.entries(fanIn).sort((a,b)=>b[1]-a[1]).slice(0,12),highestFanOut:Object.entries(fanOut).sort((a,b)=>b[1]-a[1]).slice(0,12)},deploymentTopology:{hasDockerfile:fileNodes.some(n=>/dockerfile/i.test(pathOf(n))),hasCompose:fileNodes.some(n=>/docker-compose/i.test(pathOf(n))),hasK8s:fileNodes.some(n=>/k8s|kubernetes/i.test(pathOf(n))),hasTerraform:fileNodes.some(n=>/\.tf$/i.test(pathOf(n))),hasCI:fileNodes.some(n=>/\.github\/workflows|\.gitlab-ci|Jenkinsfile/i.test(pathOf(n))),infraFiles:fileNodes.filter(n=>/dockerfile|docker-compose|\.tf$|\.github\/workflows|\.gitlab-ci|Jenkinsfile/i.test(pathOf(n))).map(pathOf)},dataPipeline:{schemaFiles:fileNodes.filter(n=>n.type==='schema'||/schema/i.test(pathOf(n))).map(pathOf),migrationFiles:fileNodes.filter(n=>/migration/i.test(pathOf(n))).map(pathOf),dataModelFiles:fileNodes.filter(n=>/repository|model|schema/i.test(pathOf(n))).map(pathOf),apiHandlerFiles:fileNodes.filter(n=>/\.routes\.|\/route\./.test(pathOf(n))).map(pathOf)},docCoverage:{groupsWithDocs:Object.keys(directoryGroups).filter(k=>directoryGroups[k].some(id=>/readme\.md|docs?\//i.test(pathOf(fileById.get(id))))),totalGroups:Object.keys(directoryGroups).length}};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({fileNodes:report.fileStats,groups:Object.keys(directoryGroups).map(k=>[k,directoryGroups[k].length]).sort((a,b)=>b[1]-a[1]),topImportPairs:sortedInter.slice(0,20),docGroups:report.docCoverage},null,2));

