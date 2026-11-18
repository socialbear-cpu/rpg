const fs=require('fs');
const g=JSON.parse(fs.readFileSync('.ua/intermediate/assembled-graph.json','utf8'));
const fileTypes=new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const fileNodes=g.nodes.filter(n=>fileTypes.has(n.type));
const ids=new Set(fileNodes.map(n=>n.id));
const importEdges=g.edges.filter(e=>e.type==='imports'&&ids.has(e.source)&&ids.has(e.target));
const allEdges=g.edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
fs.writeFileSync('.ua/tmp/architecture-input.json',JSON.stringify({fileNodes,importEdges,allEdges},null,2));
