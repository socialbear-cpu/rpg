const fs=require('fs');
const s=JSON.parse(fs.readFileSync('.ua/intermediate/scan-result.json','utf8'));
const g=JSON.parse(fs.readFileSync('.ua/intermediate/assembled-graph.json','utf8'));
const ids=new Set(g.nodes.map(n=>n.id));
const paths=new Map(g.nodes.filter(n=>n.filePath).map(n=>[n.filePath,n.id]));
const prefixes=['file:','config:','document:','service:','pipeline:','table:','schema:','resource:','endpoint:'];
let expected=0,missing=[];
for(const [src,imps] of Object.entries(s.importMap)){const from=paths.get(src)||prefixes.map(p=>p+src).find(id=>ids.has(id));if(!from)continue;for(const imp of imps||[]){const to=paths.get(imp)||prefixes.map(p=>p+imp).find(id=>ids.has(id));if(!to)continue;expected++;if(!g.edges.some(e=>e.type==='imports'&&e.source===from&&e.target===to))missing.push([src,imp,from,to]);}}
const files=s.files.map(f=>f.path), graphFilePaths=new Set(g.nodes.filter(n=>n.filePath).map(n=>n.filePath));
const missingFiles=files.filter(p=>!graphFilePaths.has(p));
const knownTypes=['file','function','class','module','concept','config','document','service','table','endpoint','pipeline','schema','resource'];
const unknownTypes=[...new Set(g.nodes.map(n=>n.type).filter(t=>!knownTypes.includes(t)))];
const unknownComplexity=[...new Set(g.nodes.map(n=>n.complexity).filter(c=>c&&!['simple','moderate','complex'].includes(c)))];
const missingFields=g.nodes.filter(n=>!n.id||!n.type||!n.name||!n.summary||!Array.isArray(n.tags)||!n.tags.length).slice(0,20).map(n=>({id:n.id,type:n.type,name:n.name,summary:n.summary,tags:n.tags}));
console.log(JSON.stringify({expectedImportsCompared:expected,missingImportCount:missing.length,missingImports:missing.slice(0,30),fileNodes:graphFilePaths.size,inventoryFiles:files.length,missingFiles:missingFiles.slice(0,30),missingFilesCount:missingFiles.length,unknownTypes,unknownComplexity,missingFields,testedByCount:g.edges.filter(e=>e.type==='tested_by').length,testedNodes:g.nodes.filter(n=>n.tags?.includes('tested')).length},null,2));
