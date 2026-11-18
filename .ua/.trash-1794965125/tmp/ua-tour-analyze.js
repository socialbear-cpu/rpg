const fs=require('fs');
const [inputPath, outputPath]=process.argv.slice(2);
try {
 const g=JSON.parse(fs.readFileSync(inputPath,'utf8')), nodes=g.nodes||[], edges=g.edges||[], layers=g.layers||[];
 const byId=new Map(nodes.map(n=>[n.id,n])), fanIn=new Map(nodes.map(n=>[n.id,0])), fanOut=new Map(nodes.map(n=>[n.id,0]));
 const inPairs=new Set(),outPairs=new Set();
 for(const e of edges)if(e.source!==e.target){if(fanIn.has(e.target))inPairs.add(e.target+'\0'+e.source);if(fanOut.has(e.source))outPairs.add(e.source+'\0'+e.target)}
 for(const p of inPairs)fanIn.set(p.split('\0')[0],fanIn.get(p.split('\0')[0])+1);
 for(const p of outPairs)fanOut.set(p.split('\0')[0],fanOut.get(p.split('\0')[0])+1);
 const rank=(m,k)=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([id,v])=>({id,[k]:v,name:byId.get(id)?.name}));
 const fileNodes=nodes.filter(n=>n.type==='file'), outVals=[...fanOut.values()].sort((a,b)=>a-b),inVals=[...fanIn.values()].sort((a,b)=>a-b), quant=(a,p)=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))]||0;
 const topOut=quant(outVals,.9),lowIn=quant(inVals,.25),base=p=>(p||'').split(/[\\/]/).pop()||'';
 const candidates=[];
 for(const n of nodes){const p=n.filePath||'';let score=0;if(n.type==='file'){
  if(/^(index|main|app|server)\.(ts|js)$|^(mod\.rs|main\.go|main\.py|manage\.py|app\.py|wsgi\.py|asgi\.py|run\.py|__main__\.py|main\.rs|Application\.java|Main\.java|Program\.cs|config\.ru|index\.php|App\.swift|Application\.kt|main\.cpp|main\.c)$/i.test(base(p)))score+=3;
  if(p.split(/[\\/]/).length<=2)score++;if(fanOut.get(n.id)>=topOut)score++;if(fanIn.get(n.id)<=lowIn)score++;
 }else if(n.type==='document'){if(/^README\.md$/i.test(p))score+=5;else if(/^[^/]+\.md$/i.test(p))score+=2}if(score)candidates.push({id:n.id,score,name:n.name,summary:n.summary,type:n.type})}
 candidates.sort((a,b)=>b.score-a.score);
 const start=candidates.find(x=>x.type==='file'),adj=new Map(nodes.map(n=>[n.id,[]]));for(const e of edges)if(['imports','calls'].includes(e.type)&&adj.has(e.source)&&adj.has(e.target))adj.get(e.source).push(e.target);
 const order=[],depthMap={};if(start){const q=[start.id];depthMap[start.id]=0;for(let i=0;i<q.length;i++){const id=q[i];order.push(id);for(const next of adj.get(id)||[])if(depthMap[next]===undefined){depthMap[next]=depthMap[id]+1;q.push(next)}}}
 const byDepth={};for(const id of order)(byDepth[depthMap[id]]??=[]).push(id);
 const specs={documentation:['document'],infrastructure:['service','pipeline','resource'],data:['table','schema','endpoint'],config:['config']},nonCodeFiles={};for(const [k,t] of Object.entries(specs))nonCodeFiles[k]=nodes.filter(n=>t.includes(n.type)).map(({id,name,type,summary})=>({id,name,type,summary}));
 const mutual=new Map();for(const e of edges)if(['imports','calls'].includes(e.type)){const k=[e.source,e.target].sort().join('\0');if(!mutual.has(k))mutual.set(k,new Set());mutual.get(k).add(e.source+'>'+e.target)}
 const clusters=[];for(const [k,dirs] of mutual){const[a,b]=k.split('\0');if(dirs.has(a+'>'+b)&&dirs.has(b+'>'+a))clusters.push(new Set([a,b]))}
 const expanded=[];for(const c of clusters){for(const n of nodes){if(c.size>=5)break;const neighbors=new Set(edges.filter(e=>['imports','calls'].includes(e.type)&&((e.source===n.id&&c.has(e.target))||(e.target===n.id&&c.has(e.source)))).flatMap(e=>[e.source,e.target]).filter(x=>x!==n.id));if(neighbors.size>=2)c.add(n.id)}expanded.push(c)}
 const topClusters=[...new Map(expanded.map(c=>{const a=[...c].sort();return[a.join('|'),{nodes:a,edgeCount:edges.filter(e=>c.has(e.source)&&c.has(e.target)).length}]})).values()].sort((a,b)=>b.edgeCount-a.edgeCount).slice(0,10);
 const result={scriptCompleted:true,entryPointCandidates:candidates.slice(0,5),fanInRanking:rank(fanIn,'fanIn'),fanOutRanking:rank(fanOut,'fanOut'),bfsTraversal:{startNode:start?.id||null,order,depthMap,byDepth},nonCodeFiles,clusters:topClusters,layers:{count:layers.length,list:layers},nodeSummaryIndex:Object.fromEntries(nodes.map(n=>[n.id,{name:n.name,type:n.type,summary:n.summary}])),totalNodes:nodes.length,totalEdges:edges.length};
 fs.writeFileSync(outputPath,JSON.stringify(result,null,2));
}catch(e){console.error(e.stack||e.message);process.exit(1)}
