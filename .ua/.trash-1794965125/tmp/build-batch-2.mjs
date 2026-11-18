import fs from 'node:fs';
const root='C:/Users/opsce/OneDrive/Documents/ChatGPT/RPG';
const base='.ua/intermediate/';
const batches=JSON.parse(fs.readFileSync(base+'batches.json','utf8'));
const batch=batches.batches[1];
const x=JSON.parse(fs.readFileSync('.ua/tmp/ua-file-extract-results-2.json','utf8'));
const descriptions={
'backend/src/modules/daily-login/daily-login.repository.ts':'Consulta e atualiza dados de login diário, calendários de recompensas e resgates de personagens por meio do Supabase.',
'backend/src/modules/daily-login/daily-login.routes.ts':'Registra a API de login diário, validando requisições e aplicando regras de acesso antes de consultar ou alterar recompensas.',
'backend/src/modules/daily-login/daily-login.schema.ts':'Define os esquemas de validação para resgates, recompensas e calendários de login diário.',
'backend/src/modules/game-systems/game-systems.repository.ts':'Coordena a persistência de sistemas de jogo, acesso, personagens, fichas e ciclo de vida no banco de dados.',
'backend/src/modules/game-systems/game-systems.routes.ts':'Expõe rotas para administrar sistemas de jogo, seus membros, personagens, fichas e operações de ciclo de vida.',
'backend/src/modules/game-systems/game-systems.schema.ts':'Centraliza os esquemas Zod de entrada e saída para sistemas, fichas de personagem, atributos e operações relacionadas.',
'backend/src/modules/game-systems/system-access.ts':'Reúne a resposta padrão para solicitações que não têm acesso autorizado ao sistema de jogo.',
'backend/src/modules/lobby-settings/lobby-settings.repository.ts':'Lê e salva configurações do lobby de um sistema de jogo no Supabase.',
'backend/src/modules/lobby-settings/lobby-settings.routes.ts':'Define os endpoints de leitura e atualização das configurações do lobby e verifica permissões dos membros.',
'backend/src/modules/lobby-settings/lobby-settings.schema.ts':'Valida os dados de entrada usados para atualizar as configurações do lobby.',
'backend/src/modules/store/store.repository.ts':'Executa operações de catálogo, estoque, moeda e ofertas da loja, incluindo compras de personagens.',
'backend/src/modules/store/store.routes.ts':'Registra endpoints para consultar e administrar a loja e para realizar compras de ofertas.',
'backend/src/modules/store/store.schema.ts':'Define os esquemas de validação e resposta para catálogo, itens, ofertas, moeda e operações da loja.',
'backend/src/modules/system-events/system-events.repository.ts':'Consulta e altera eventos de sistemas de jogo, incluindo criação, edição, remoção e início de eventos.',
'backend/src/modules/system-events/system-events.routes.ts':'Expõe rotas para consultar e administrar eventos de sistemas, com verificações de acesso e validação de payloads.',
'backend/src/modules/system-events/system-events.schema.ts':'Define os formatos válidos para eventos de sistema e para as respostas da API de eventos.',
'backend/src/modules/system-membership/system-membership.repository.ts':'Consulta associações de jogadores, atualiza permissões de moderador e pesquisa membros pelo nome do personagem.',
'backend/src/modules/system-membership/system-membership.routes.ts':'Registra endpoints de associação e administração de membros, protegendo operações por autenticação e autorização.',
'backend/src/modules/system-membership/system-membership.schema.ts':'Valida parâmetros, papéis e respostas usados nos fluxos de associação de membros ao sistema.',
'backend/src/modules/trading/trading.repository.ts':'Coordena consultas e mutações de trocas entre personagens, ofertas e inventários por meio de RPCs do Supabase.',
'backend/src/modules/trading/trading.routes.ts':'Expõe endpoints para listar personagens e inventários e para criar, responder, contrapor ou cancelar trocas.',
'backend/src/modules/trading/trading.schema.ts':'Define os esquemas Zod para personagens, inventários, ofertas e respostas das operações de troca.',
'backend/test/daily-login.schema.test.ts':'Verifica a validação dos esquemas de resgate e calendário de login diário.',
'backend/test/game-systems.schema.test.ts':'Testa validações e transformações dos esquemas de sistemas, fichas e personagens.',
'backend/test/store.schema.test.ts':'Confere a validação dos dados usados nas operações da loja.',
'backend/test/system-membership.schema.test.ts':'Testa os esquemas de associação e pesquisa de membros do sistema.',
'backend/test/trading.schema.test.ts':'Verifica os esquemas de entrada e saída dos fluxos de troca e inventário.'
};
const domainByPath=[['daily-login','login diário'],['game-systems','sistemas de jogo'],['lobby-settings','lobby'],['store','loja'],['system-events','eventos do sistema'],['system-membership','associação de membros'],['trading','trocas']];
function domain(p){return (domainByPath.find(([k])=>p.includes(k))||['','dados do módulo'])[1];}
function action(n,p){const d=domain(p); const map=[[/^list|^search/,'Lista'],[/^read|^get/,'Consulta'],[/^create/,'Cria'],[/^save|^update|^replace|^set/,'Atualiza'],[/^delete|^cancel/,'Remove ou cancela'],[/^start/,'Inicia'],[/^claim/,'Processa o resgate de'],[/^counter/,'Registra uma contraproposta para'],[/^respond/,'Registra a resposta a'],[/^authorize/,'Autoriza'],[/^manage/,'Aplica regras de ciclo de vida a'],[/^parse/,'Converte e valida'],[/^canManage/,'Verifica a permissão de gerenciamento de'],[/^reject/,'Formata a rejeição de acesso a'],[/^hasValue/,'Verifica se há valor informado em'],[/^characterAttributes/,'Cria o esquema de atributos de personagem para'],[/^legacyFields/,'Converte campos antigos de ficha em'],[/^getTag/,'Obtém opções de tags para'],[/^check|^systemId|^uuid/,'Valida ou extrai parâmetros usados por'],[/^databaseError/,'Converte erros de banco em respostas HTTP para'],[/^inventoryDatabaseError/,'Converte falhas de inventário em respostas da API de'],[/^mutationReply/,'Normaliza as respostas das mutações de'],[/^documented/,'Extrai entradas documentadas para']]; const hit=map.find(([re])=>re.test(n)); const verb=hit?hit[1]:'Coordena'; let object=n.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase(); return `${verb} ${d}, com base nos parâmetros e regras da operação ${object}.`;}
const nodes=[],edges=[];
const testTag=(p)=>p.includes('/test/')||p.includes('.test.')?['teste','validação','backend']:null;
for(const f of x.results){
 const p=f.path; const isTest=!!testTag(p); const summary=descriptions[p]||`Implementa a lógica de ${domain(p)} na camada ${p.includes('.schema.')?'de validação':p.includes('.repository.')?'de acesso a dados':p.includes('.routes.')?'de API':'do backend'}.`;
 const tags=isTest?testTag(p):p.includes('.schema.')?['validação','esquema','backend']:p.includes('.repository.')?['repositório','supabase','backend']:p.includes('.routes.')?['api','rotas','autorização']:['backend','sistemas-de-jogo','lógica-de-negócio'];
 const type='file'; const id=`${type}:${p}`; const lines=f.nonEmptyLines??f.totalLines;
 nodes.push({id,type,name:p.split('/').pop(),filePath:p,summary,tags,complexity:lines>200?'complex':lines>50?'moderate':'simple'});
 const exported=new Set((f.exports||[]).map(e=>e.name));
 for(const fn of f.functions||[]){ const count=fn.endLine-fn.startLine+1; if(!exported.has(fn.name)&&count<10)continue;
  const fid=`function:${p}:${fn.name}`; nodes.push({id:fid,type:'function',name:fn.name,filePath:p,lineRange:[fn.startLine,fn.endLine],summary:action(fn.name,p),tags:['backend',isTest?'teste':'lógica-de-negócio',p.includes('.routes.')?'api-handler':p.includes('.schema.')?'validação':p.includes('.repository.')?'persistência':'serviço'],complexity:count>35?'complex':count>=10?'moderate':'simple'});
  edges.push({source:id,target:fid,type:'contains',direction:'forward',weight:1.0}); if(exported.has(fn.name))edges.push({source:id,target:fid,type:'exports',direction:'forward',weight:0.8});
 }
 for(const imported of batch.batchImportData[p]||[]){edges.push({source:id,target:`file:${imported}`,type:'imports',direction:'forward',weight:0.7});}
}
const tested={
'backend/test/daily-login.schema.test.ts':'backend/src/modules/daily-login/daily-login.schema.ts',
'backend/test/game-systems.schema.test.ts':'backend/src/modules/game-systems/game-systems.schema.ts',
'backend/test/store.schema.test.ts':'backend/src/modules/store/store.schema.ts',
'backend/test/system-membership.schema.test.ts':'backend/src/modules/system-membership/system-membership.schema.ts',
'backend/test/trading.schema.test.ts':'backend/src/modules/trading/trading.schema.ts'
};
for(const [t,p] of Object.entries(tested))edges.push({source:`file:${p}`,target:`file:${t}`,type:'tested_by',direction:'forward',weight:0.5});
const output={nodes,edges};
const sum=Object.values(batch.batchImportData).reduce((n,a)=>n+a.length,0); const actual=edges.filter(e=>e.type==='imports').length;
if(sum!==actual)throw new Error(`imports mismatch ${actual} != ${sum}`);
fs.writeFileSync('.ua/intermediate/batch-2.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({nodes:nodes.length,edges:edges.length,imports:actual,testedBy:5,output:'.ua/intermediate/batch-2.json'}));

