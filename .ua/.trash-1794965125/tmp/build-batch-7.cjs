const fs = require('fs');
const base = '.ua/intermediate/';
const data = JSON.parse(fs.readFileSync(base+'batches.json','utf8'));
const batch = data.batches[6];
const extracted = JSON.parse(fs.readFileSync('.ua/tmp/ua-file-extract-results-7.json','utf8'));
const descriptions = {
'frontend/app/dashboard/systems/[systemId]/manage/page.tsx':['Rota Next.js da área de gestão de um sistema. Encaminha a página para o componente de gestão compartilhado.',['rota','nextjs','gestao']],
'frontend/src/features/daily-login/daily-login-admin-card.tsx':['Formulário administrativo para configurar os prêmios de login diário, incluindo itens, quantidades e ativação semanal.',['componente','login-diario','administracao']],
'frontend/src/features/daily-login/daily-login-card.tsx':['Interface para escolher um personagem elegível, consultar o prêmio do dia e solicitar a recompensa de login diário.',['componente','login-diario','recompensas']],
'frontend/src/features/daily-login/daily-login-messages.ts':['Formata a mensagem de sucesso após a reivindicação de um prêmio diário, incluindo a moeda recebida.',['utilitario','login-diario','mensagens']],
'frontend/src/features/daily-login/daily-login-popup.tsx':['Carrega e apresenta o aviso de login diário da sessão, permite reivindicar o prêmio e atualiza o estado exibido.',['componente','login-diario','estado']],
'frontend/src/features/experience/experience-admin-card.tsx':['Editor administrativo das regras de experiência do sistema, com campos de nível, fontes de XP e ações para salvar.',['componente','experiencia','administracao']],
'frontend/src/features/experience/experience-model.ts':['Cria fontes personalizadas de experiência e valida limites, tipos obrigatórios, nomes únicos e valores das regras.',['modelo','experiencia','validacao']],
'frontend/src/features/store/store-admin-card.tsx':['Componentes de administração da loja: edição de ofertas e moeda, validação dos campos e salvamento automático.',['componente','loja','salvamento-automatico']],
'frontend/src/features/store/store-card.tsx':['Exibe ofertas da loja de um sistema e permite que o personagem selecione e compre itens.',['componente','loja','compras']],
'frontend/src/features/system-management/book-category.tsx':['Organiza o conteúdo da gestão do sistema em categorias navegáveis, com controle de página e adaptação de layout.',['componente','gestao','navegacao']],
'frontend/src/features/system-management/system-management-page.tsx':['Coordena a tela de gestão do sistema: carrega dados, controla categorias e executa ações administrativas de calendário, XP, membros e ciclo de vida.',['pagina','gestao-de-sistema','administracao']],
'frontend/src/features/system-membership/system-membership-card.tsx':['Apresenta as associações do usuário a sistemas e permite pesquisar personagens para atribuir função de moderador.',['componente','membros','permissoes']],
'frontend/test/daily-login-render.test.ts':['Testes de renderização das telas de administração e reivindicação de login diário, além da formatação da mensagem de sucesso.',['teste','login-diario','renderizacao']],
'frontend/test/experience-render.test.ts':['Testa a renderização do editor de experiência e as regras que criam e validam fontes de XP.',['teste','experiencia','renderizacao']],
'frontend/test/store-render.test.ts':['Testa a renderização dos controles administrativos de loja e de ofertas.',['teste','loja','renderizacao']],
'frontend/test/system-membership-render.test.ts':['Testa a renderização dos papéis de associação e dos controles de atribuição de moderadores.',['teste','membros','renderizacao']]
};
const fnInfo = {
ManageSystemRoute:['Renderiza a página compartilhada de gestão para a rota do sistema.',['rota','componente','gestao'],'simple'],
DailyLoginAdminCard:['Renderiza os controles para selecionar sistemas e editar ou salvar recompensas semanais de login diário.',['componente','login-diario','administracao'],'moderate'],
DailyLoginCard:['Apresenta sistemas e personagens elegíveis, seleciona o personagem e encaminha a reivindicação do prêmio diário.',['componente','login-diario','recompensas'],'moderate'],
formatDailyLoginClaimSuccess:['Converte o resultado da reivindicação em uma mensagem legível com o valor de moeda concedido.',['utilitario','login-diario','mensagens'],'simple'],
DailyLoginPopup:['Busca os dados do aviso diário, gerencia sua abertura e permite reivindicar a recompensa, tratando erros e atualizando os sistemas.',['componente','login-diario','estado'],'moderate'],
ExperienceAdminCard:['Renderiza os ajustes de XP por nível e as fontes habilitadas, delegando mudanças e salvamento aos callbacks recebidos.',['componente','experiencia','administracao'],'moderate'],
addCustomExperienceSource:['Adiciona uma fonte personalizada desativada com nome que não colide com fontes personalizadas existentes.',['experiencia','fonte-personalizada','utilitario'],'simple'],
experienceSettingsAreValid:['Valida XP por nível, fontes obrigatórias, limites, nomes personalizados únicos e IDs sem duplicação.',['experiencia','validacao','regras-de-negocio'],'moderate'],
useAutosaveField:['Mantém o estado de um campo editável e coordena salvamentos imediatos ou adiados, revisões pendentes e o estado de erro.',['hook','loja','salvamento-automatico'],'moderate'],
autosaveStatusText:['Traduz o estado de salvamento em texto apresentado ao usuário.',['loja','status','utilitario'],'simple'],
CurrencySlot:['Renderiza um campo de moeda e sua imagem, conectando alterações ao mecanismo de salvamento automático.',['componente','loja','moeda'],'moderate'],
OfferEditor:['Renderiza e valida os campos de uma oferta da loja, incluindo preço, descrição e imagem.',['componente','loja','ofertas'],'moderate'],
StoreAdminCard:['Edita o conteúdo administrativo da loja e suas ofertas, apresentando estados de disponibilidade e operações de salvamento.',['componente','loja','administracao'],'moderate'],
SystemStoreAdmin:['Carrega e administra a loja do sistema, incluindo moeda e ofertas, integrando dados e ações de edição.',['componente','loja','administracao'],'moderate'],
StoreCard:['Exibe as ofertas e seus preços e chama a ação de compra para a oferta selecionada.',['componente','loja','compras'],'moderate'],
SystemStore:['Carrega a loja e o estado de compra do personagem e apresenta as ofertas disponíveis.',['componente','loja','compras'],'moderate'],
BookCategory:['Organiza conteúdo em páginas de categoria e adapta a navegação ao layout disponível usando referências e medidas do DOM.',['componente','gestao','navegacao'],'moderate'],
SystemManagementPage:['Carrega dados de gestão e integra operações de calendário diário, experiência, associação, permissões e ciclo de vida do sistema.',['pagina','gestao-de-sistema','administracao'],'complex'],
SystemMembershipError:['Apresenta um erro de associação e oferece uma ação para repetir a operação.',['componente','membros','erro'],'simple'],
SystemMembershipCard:['Exibe as associações atuais e permite pesquisar membros e atribuir moderadores com tratamento de estados de busca.',['componente','membros','permissoes'],'moderate']
};
const nodes=[], edges=[];
const fileType = p => p.startsWith('frontend/test/')?'file':'file';
for(const f of extracted.results){
 const [summary,tags]=descriptions[f.path];
 const id='file:'+f.path;
 nodes.push({id,type:fileType(f.path),name:f.path.split('/').pop(),filePath:f.path,summary,tags,complexity:f.totalLines>200?'complex':f.nonEmptyLines<50?'simple':'moderate'});
 for(const fn of (f.functions||[])){
  const exported=(f.exports||[]).some(e=>e.name===fn.name);
  const size=fn.endLine-fn.startLine+1;
  if(size<10 && !exported) continue;
  const meta=fnInfo[fn.name]||['Implementa uma operação interna deste módulo.',['utilitario','logica','typescript'],size>200?'complex':size>50?'moderate':'simple'];
  const fid='function:'+f.path+':'+fn.name;
  nodes.push({id:fid,type:'function',name:fn.name,filePath:f.path,lineRange:[fn.startLine,fn.endLine],summary:meta[0],tags:meta[1],complexity:meta[2]});
  edges.push({source:id,target:fid,type:'contains',direction:'forward',weight:1.0});
  if(exported) edges.push({source:id,target:fid,type:'exports',direction:'forward',weight:0.8});
 }
}
for(const [source,targets] of Object.entries(batch.batchImportData)) for(const target of targets){
 const sourceId='file:'+source;
 const targetId='file:'+target;
 if(sourceId!==targetId) edges.push({source:sourceId,target:targetId,type:'imports',direction:'forward',weight:0.7});
}
const tested = {
'frontend/src/features/daily-login/daily-login-admin-card.tsx':['frontend/test/daily-login-render.test.ts'],
'frontend/src/features/daily-login/daily-login-card.tsx':['frontend/test/daily-login-render.test.ts'],
'frontend/src/features/daily-login/daily-login-messages.ts':['frontend/test/daily-login-render.test.ts','frontend/test/experience-render.test.ts'],
'frontend/src/features/experience/experience-admin-card.tsx':['frontend/test/experience-render.test.ts'],
'frontend/src/features/experience/experience-model.ts':['frontend/test/experience-render.test.ts'],
'frontend/src/features/store/store-admin-card.tsx':['frontend/test/store-render.test.ts'],
'frontend/src/features/store/store-card.tsx':['frontend/test/store-render.test.ts'],
'frontend/src/features/system-membership/system-membership-card.tsx':['frontend/test/system-membership-render.test.ts']
};
for(const [prod, tests] of Object.entries(tested)) for(const t of tests) edges.push({source:'file:'+prod,target:'file:'+t,type:'tested_by',direction:'forward',weight:0.5});
for(const [srcFn,tgtFn] of [
 ['frontend/src/features/daily-login/daily-login-popup.tsx:DailyLoginPopup','frontend/src/features/daily-login/daily-login-messages.ts:formatDailyLoginClaimSuccess'],
 ['frontend/src/features/experience/experience-admin-card.tsx:ExperienceAdminCard','frontend/src/features/experience/experience-model.ts:experienceSettingsAreValid'],
 ['frontend/src/features/system-management/system-management-page.tsx:SystemManagementPage','frontend/src/features/experience/experience-model.ts:addCustomExperienceSource']
]) edges.push({source:'function:'+srcFn,target:'function:'+tgtFn,type:'calls',direction:'forward',weight:0.8});
const out={nodes,edges};
fs.writeFileSync(base+'batch-7.json',JSON.stringify(out,null,2));
const ids=new Set(nodes.map(n=>n.id));
const errors=[];
for(const e of edges){if(e.source===e.target)errors.push('self '+e.source);if(!ids.has(e.source)&&!e.source.startsWith('file:'))errors.push('source '+e.source);if(!ids.has(e.target)&&!e.target.startsWith('file:'))errors.push('target '+e.target);}
console.log(JSON.stringify({files:extracted.filesAnalyzed,nodes:nodes.length,edges:edges.length,localMissing:errors,output:base+'batch-7.json'}));
