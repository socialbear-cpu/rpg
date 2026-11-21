import fs from 'node:fs';
const root=process.cwd();
const scan=JSON.parse(fs.readFileSync('.ua/intermediate/scan-result.json','utf8'));
const batches=JSON.parse(fs.readFileSync('.ua/intermediate/batches.json','utf8'));
const batch=batches.batches[4];
const extracted=JSON.parse(fs.readFileSync('.ua/tmp/ua-file-extract-results-5.json','utf8'));
const batchPaths=new Set(batch.files.map(f=>f.path));
const lookup=new Map(extracted.results.map(f=>[f.path,f]));
const desc={
'frontend/app/dashboard/systems/new/page.tsx':'Página Next.js de rota protegida para iniciar a criação de um sistema, validando a sessão antes de abrir o assistente.',
'frontend/app/systems/[systemId]/home/[characterId]/page.tsx':'Rota dinâmica que valida a sessão e encaminha o jogador para a página inicial do personagem no sistema selecionado.',
'frontend/app/trading/page.tsx':'Rota Next.js que monta a área de trocas entre personagens.',
'frontend/src/api.ts':'Cliente central da API frontend: define contratos de dados e funções autenticadas para perfis, sistemas, chat, presença, progressão, trocas e loja.',
'frontend/src/features/character-sheet/character-sheet-step-renderer.tsx':'Renderiza etapas e componentes de fichas de personagem, incluindo opções de escolha e layouts visuais.',
'frontend/src/features/character-sheet/format-value.test.ts':'Testes da formatação de valores de componentes de ficha, com foco nas opções de seleção e nos valores ausentes.',
'frontend/src/features/character-sheet/format-value.ts':'Formata valores de componentes da ficha para exibição legível, incluindo rótulos de opções e valores vazios.',
'frontend/src/features/characters/character-entry.tsx':'Componente de fluxo de entrada do personagem que reúne os dados e as ações da área de jogo.',
'frontend/src/features/characters/character-form.tsx':'Formulário guiado de criação ou edição de personagem, com validação de campos e composição dos valores da ficha.',
'frontend/src/features/characters/character-gallery.tsx':'Galeria de personagens com apresentação visual das opções disponíveis para o jogador.',
'frontend/src/features/characters/character-home-page.tsx':'Carrega os dados necessários e compõe a página inicial de um personagem dentro do sistema.',
'frontend/src/features/characters/character-home.tsx':'Interface principal da área de personagem, integrando dados, navegação e ações do jogador.',
'frontend/src/features/characters/character-record.tsx':'Apresenta o registro do personagem, sua ficha visual e inventário, formatando atributos e imagens com segurança.',
'frontend/src/features/characters/lobby-creator-tools.tsx':'Ferramentas do criador do lobby para administrar ações e recursos da sala de jogo.',
'frontend/src/features/characters/lobby-customization-form.tsx':'Formulário de personalização das configurações visuais e funcionais do lobby.',
'frontend/src/features/characters/lobby-presence.ts':'Mantém a presença do jogador no lobby por heartbeat periódico e fornece o hook de ciclo de vida da presença.',
'frontend/src/features/characters/lobby-settings-page.tsx':'Página de gerenciamento das configurações do lobby de um sistema.',
'frontend/src/features/characters/lobby-stats.tsx':'Calcula e apresenta contagens e horários das sessões ativas do lobby.',
'frontend/src/features/dashboard/dashboard.tsx':'Dashboard do jogador que carrega memberships e organiza sistemas próprios e acessíveis.',
'frontend/src/features/dashboard/systems-section.tsx':'Seção reutilizável do dashboard para exibir sistemas e ações de gerenciamento ou entrada.',
'frontend/src/features/notifications/notification-center.tsx':'Central de notificações com apresentação de eventos, anúncios e alterações de função, além de ações de leitura.'
};
const tagMap={
'frontend/app/dashboard/systems/new/page.tsx':['entry-point','next-route','system-creation','authentication'],
'frontend/app/systems/[systemId]/home/[characterId]/page.tsx':['entry-point','next-route','character-home','authentication'],
'frontend/app/trading/page.tsx':['entry-point','next-route','trading','route-composition'],
'frontend/src/api.ts':['api-client','http-requests','authentication','data-contracts','frontend-service'],
'frontend/src/features/character-sheet/character-sheet-step-renderer.tsx':['component','character-sheet','form-rendering','selection-ui'],
'frontend/src/features/character-sheet/format-value.test.ts':['test','character-sheet','formatting','unit-test'],
'frontend/src/features/character-sheet/format-value.ts':['utility','character-sheet','formatting','display'],
'frontend/src/features/characters/character-entry.tsx':['component','character','game-interface','navigation'],
'frontend/src/features/characters/character-form.tsx':['component','character','form','validation'],
'frontend/src/features/characters/character-gallery.tsx':['component','character','gallery','selection-ui'],
'frontend/src/features/characters/character-home-page.tsx':['component','character-home','data-loading','page-composition'],
'frontend/src/features/characters/character-home.tsx':['component','character-home','game-interface','navigation'],
'frontend/src/features/characters/character-record.tsx':['component','character-sheet','inventory','data-presentation'],
'frontend/src/features/characters/lobby-creator-tools.tsx':['component','lobby','creator-tools','game-management'],
'frontend/src/features/characters/lobby-customization-form.tsx':['component','lobby','form','configuration'],
'frontend/src/features/characters/lobby-presence.ts':['hook','lobby','presence','heartbeat'],
'frontend/src/features/characters/lobby-settings-page.tsx':['component','lobby','settings','page-composition'],
'frontend/src/features/characters/lobby-stats.tsx':['component','lobby','statistics','time-formatting'],
'frontend/src/features/dashboard/dashboard.tsx':['component','dashboard','systems','data-loading'],
'frontend/src/features/dashboard/systems-section.tsx':['component','dashboard','systems','navigation'],
'frontend/src/features/notifications/notification-center.tsx':['component','notifications','event-handling','formatting']
};
const nodes=[]; const edges=[];
const typeByPath=new Map(batch.files.map(f=>[f.path, f.fileCategory==='config'?'config':f.fileCategory==='docs'?'document':'file']));
for(const file of batch.files){
 const id=`${typeByPath.get(file.path)}:${file.path}`;
 const data=lookup.get(file.path);
 const lines=data?.totalLines??file.sizeLines;
 let complexity=lines>200?'complex':lines>50?'moderate':'simple';
 nodes.push({id,type:typeByPath.get(file.path),name:file.path.split('/').at(-1),filePath:file.path,summary:desc[file.path]??`Arquivo TypeScript do frontend responsável por ${file.path.split('/').at(-1).replace(/\.[^.]+$/,'').replaceAll('-',' ')}.`,tags:tagMap[file.path]??['typescript','frontend','application'],complexity});
}
for(const file of extracted.results){
 const src=`file:${file.path}`;
 const ex=new Set((file.exports??[]).map(x=>x.name));
 for(const f of file.functions??[]){
  const len=f.endLine-f.startLine+1;
  if(!(len>=10||ex.has(f.name))) continue;
  const id=`function:${file.path}:${f.name}`;
  let descf;
  if(file.path.endsWith('/api.ts')){
   const m=f.name.match(/^(get|search|check|take)(.+)$/);
   const a=f.name.match(/^(create|post|send|upload|publish)(.+)$/);
   const d=f.name.match(/^(delete|remove|cancel)(.+)$/);
   const u=f.name.match(/^(update|save|set|respond|claim|accept|mark|counter|request|deactivate|reactivate)(.+)$/);
   const obj=(m?.[2]||a?.[2]||d?.[2]||u?.[2]||f.name).replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase();
   const verb=m?'Consulta':a?'Envia ou cria':d?'Remove':u?'Atualiza ou processa':'Executa';
   descf=`${verb} dados de ${obj} por meio do cliente autenticado da API.`;
  } else {
   const human=f.name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase();
   const kind=/^(Character|Lobby|Dashboard|Systems|Notification|Canvas|Sheet)/.test(f.name)?'Componente':'Função';
   descf=`${kind} ${human}, usada no fluxo de ${file.path.split('/').at(-2).replaceAll('-',' ')}.`;
  }
  const lenf=f.endLine-f.startLine+1;
  const functionTags=file.path.endsWith('/api.ts')?['api-client','request','frontend-service']:(/^(use|start)/.test(f.name)?['hook','lobby','presence']:['typescript','frontend','component']);
  nodes.push({id,type:'function',name:f.name,filePath:file.path,summary:descf,tags:functionTags,complexity:lenf>40?'complex':lenf>15?'moderate':'simple',lineRange:[f.startLine,f.endLine]});
  edges.push({source:src,target:id,type:'contains',direction:'forward',weight:1});
  if(ex.has(f.name)) edges.push({source:src,target:id,type:'exports',direction:'forward',weight:0.8});
 }
}
for(const [from,targets] of Object.entries(batch.batchImportData??{})) for(const to of targets??[]){
 if(!batchPaths.has(from)||!to||to===from) continue;
 edges.push({source:`file:${from}`,target:`file:${to}`,type:'imports',direction:'forward',weight:0.7});
}
for(const test of extracted.results.filter(x=>/\.test\./.test(x.path))) for(const t of batch.batchImportData[test.path]??[]) if(batchPaths.has(t)) edges.push({source:`file:${t}`,target:`file:${test.path}`,type:'tested_by',direction:'forward',weight:0.5});
// Keep IDs unique and edges unique; imports are the scanner's canonical paths.
const uniqueNodes=[...new Map(nodes.map(n=>[n.id,n])).values()];
const uniqueEdges=[...new Map(edges.map(e=>[`${e.source}|${e.target}|${e.type}`,e])).values()];
const groups=[];const files=[...batch.files].sort((a,b)=>a.path.localeCompare(b.path));
const parts=Math.ceil(Math.max(uniqueNodes.length/60,uniqueEdges.length/120));
for(let i=0;i<parts;i++) groups.push(new Set(files.slice(i*Math.ceil(files.length/parts),(i+1)*Math.ceil(files.length/parts)).map(f=>f.path)));
for(let i=0;i<groups.length;i++){
 const ps=groups[i]; const ns=uniqueNodes.filter(n=>ps.has(n.filePath)); const ids=new Set(ns.map(n=>n.id));
 const es=uniqueEdges.filter(e=>ids.has(e.source));
 const out={nodes:ns,edges:es};
 const name=`.ua/intermediate/batch-5-part-${i+1}.json`;
 fs.writeFileSync(name,JSON.stringify(out,null,2));
 const chk=JSON.parse(fs.readFileSync(name,'utf8'));
 if(!Array.isArray(chk.nodes)||!Array.isArray(chk.edges)) throw new Error('Malformed output '+name);
 for(const e of chk.edges){
  const allowedTarget=ids.has(e.target)||e.target.startsWith('file:')&&(batch.batchImportData[e.source.slice(e.source.indexOf(':')+1)]??[]).includes(e.target.slice(5));
  if(!ids.has(e.source)||!allowedTarget) throw new Error(`invalid edge in ${name}: ${e.source} -> ${e.target}`);
 }
 console.log(`${name}: ${ns.length} nodes, ${es.length} edges`);
}
console.log(`TOTAL nodes=${uniqueNodes.length} edges=${uniqueEdges.length} files=${batch.files.length} parts=${groups.length}`);
