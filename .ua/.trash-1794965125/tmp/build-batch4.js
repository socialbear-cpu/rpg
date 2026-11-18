const fs = require('fs');
const root = process.cwd();
const batch = JSON.parse(fs.readFileSync('.ua/intermediate/batches.json','utf8')).batches[3];
const extract = JSON.parse(fs.readFileSync('.ua/tmp/ua-file-extract-results-4.json','utf8'));
const meta = {
'frontend/app/account-settings/page.tsx':['Rota App Router que encaminha a página de configurações da conta para o componente da funcionalidade.',['entry-point','routing','account-settings']],
'frontend/app/dashboard/page.tsx':['Carrega o perfil autenticado, aplica o fluxo inicial de escolha de username e apresenta o dashboard; também redireciona sessões ausentes e permite sair.',['entry-point','routing','authentication','dashboard']],
'frontend/app/page.tsx':['Página inicial do Next.js que monta a experiência de cadastro e login do aplicativo RPG.',['entry-point','routing','authentication']],
'frontend/app/players/[username]/page.tsx':['Resolve o parâmetro dinâmico de username e entrega a rota pública ao componente de perfil do jogador.',['entry-point','routing','profile']],
'frontend/app/profile/page.tsx':['Rota autenticada da área de perfil, delegando a edição ao componente ProfilePage.',['entry-point','routing','profile']],
'frontend/app/rpg-app.tsx':['Componente cliente da entrada do Bifrost RPG: conduz cadastro, login e recuperação de senha, processa callbacks de autenticação e confirma exclusão de sistemas.',['component','authentication','account-management','client-state']],
'frontend/app/systems/[systemId]/characters/page.tsx':['Rota protegida de personagens de um sistema; aguarda a sessão e encaminha systemId e parâmetros de convite para CharacterEntry.',['entry-point','routing','authentication','characters']],
'frontend/app/systems/[systemId]/lobby-settings/page.tsx':['Rota de configurações do lobby protegida por sessão, que fornece o systemId à página de configurações.',['entry-point','routing','authentication','lobby']],
'frontend/src/auth-state.ts':['Interpreta fragmentos de URL do Supabase para reconhecer recuperação de senha, magic link e erros de autenticação, além de sinalizar limpeza do histórico.',['authentication','url-parsing','state']],
'frontend/src/config.ts':['Centraliza as variáveis públicas do Supabase e da aplicação e informa quais valores obrigatórios de autenticação estão ausentes.',['configuration','supabase','environment']],
'frontend/src/features/account/account-card.tsx':['Apresenta os formulários de login, cadastro, recuperação de senha e estado da sessão, delegando ações ao componente pai.',['component','authentication','forms','account']],
'frontend/src/features/account/account-settings-page.tsx':['Gerencia leitura e edição das configurações da conta, troca única de username e operações de segurança com confirmação por e-mail.',['component','account-settings','authentication','forms']],
'frontend/src/features/account/username-settings-field.tsx':['Renderiza o campo de username e o controle de salvamento, refletindo se a troca única já foi usada ou está indisponível.',['component','account-settings','username','form']],
'frontend/src/features/profile/profile-card.tsx':['Exibe os campos editáveis do perfil e suas ações, incluindo visualização prévia e estados de carregamento.',['component','profile','forms','ui']],
'frontend/src/features/profile/profile-page.tsx':['Coordena carregamento e atualização do perfil próprio e compõe o cabeçalho da aplicação, cartão de perfil e visualização pública.',['component','profile','account','data-loading']],
'frontend/src/features/profile/public-profile-page.tsx':['Carrega e apresenta o perfil público de um jogador, permitindo interações contextuais como visualizar comentários e mensagens.',['component','profile','social','public-page']],
'frontend/src/features/profile/username-setup.tsx':['Apresenta a escolha obrigatória do username no primeiro acesso e entrega o valor ao callback de submissão.',['component','profile','username','onboarding']],
'frontend/src/supabase-auth.ts':['Implementa a sessão de autenticação no cliente e as chamadas ao Supabase Auth para cadastro, login, logout, recuperação, callbacks e ações de conta.',['authentication','supabase','session-management','api-client']],
'frontend/test/account-username-settings-render.test.ts':['Verifica a renderização do campo de username e os estados disponíveis antes e depois da troca única.',['test','account-settings','username','rendering']],
'frontend/test/client-auth.test.ts':['Testa leitura de callbacks da URL, detecção de configuração ausente, limpeza do histórico e ciclo de sessão da recuperação de senha.',['test','authentication','supabase','rendering']],
'frontend/test/system-cover-storage.test.ts':['Testa upload, URL pública e exclusão autenticada de capas de sistemas, incluindo rejeição de caminhos e formatos inválidos.',['test','storage','authentication','validation']],
'frontend/test/ui-render.test.ts':['Agrupa testes de renderização dos componentes de conta, perfil e dashboard e valida navegação inicial e checagem de saúde da API.',['test','ui','rendering','navigation']],
'frontend/test/username-setup-render.test.ts':['Verifica a apresentação do fluxo de primeiro acesso para escolha de username.',['test','profile','username','rendering']],
};
const functionDescriptions = {
AccountSettingsRoute:'Encaminha a rota de configurações para AccountSettingsPage.',
DashboardPage:'Verifica a sessão, carrega o perfil, orienta a escolha de username e monta o dashboard com ações de logout.',
HomePage:'Monta RpgApp como tela inicial.',
PlayerRoute:'Obtém o username dos parâmetros assíncronos da rota e o repassa à página pública do jogador.',
PlayerProfileRoute:'Monta a página do perfil próprio.',
RpgApp:'Coordena o fluxo de autenticação, recuperação de conta, callback do Supabase e confirmação de exclusão permanente de sistema.',
SystemCharactersPage:'Envolve o conteúdo de personagens em Suspense para aguardar parâmetros de navegação.',
SystemCharactersContent:'Confirma a sessão e abre CharacterEntry com o sistema e os dados de convite da URL.',
SystemLobbySettingsRoute:'Confirma a sessão, obtém systemId e monta as configurações do lobby.',
readAuthCallback:'Decodifica o fragmento da URL e classifica tokens de recuperação, magic link e erros.',
missingSupabaseConfig:'Lista os valores públicos obrigatórios do Supabase que não foram configurados.',
AccountCard:'Renderiza os modos de login, cadastro e recuperação, além dos controles de sessão.',
AccountSettingsPage:'Carrega e atualiza dados da conta, organiza ações de segurança e estados de confirmação.',
confirmationTitle:'Escolhe o título de confirmação conforme a ação de segurança da conta.',
confirmationDescription:'Monta a explicação correspondente à ação de segurança que será confirmada.',
confirmationButton:'Escolhe o rótulo do botão final conforme a ação de segurança.',
UsernameSettingsField:'Exibe o username e habilita edição ou salvamento conforme a disponibilidade da troca.',
ProfileCard:'Renderiza dados do perfil, campos de edição, preview e ações de carregar e salvar.',
profileFields:'Converte os dados do perfil em campos para exibição e edição.',
ProfilePage:'Carrega e salva o perfil do jogador e compõe os cartões de perfil e cabeçalho.',
PublicProfilePage:'Carrega a página pública e seus dados associados para um username específico.',
UsernameSetup:'Coleta e envia o username definido pelo jogador no primeiro acesso.',
authRequest:'Constrói e executa requisições autenticadas contra os endpoints do Supabase Auth.',
sendDeletionEmailLink:'Solicita por e-mail o link de confirmação para excluir um sistema.',
readPendingSystemDeletion:'Lê e valida a intenção pendente de exclusão de sistema armazenada no navegador.',
clearPendingSystemDeletion:'Remove do armazenamento local a solicitação de exclusão pendente.',
sendAccountConfirmationEmail:'Inicia uma ação sensível de conta e registra o contexto para confirmação por e-mail.',
readPendingAccountAction:'Lê e valida os diferentes formatos de ação de conta aguardando confirmação.',
clearPendingAccountAction:'Remove a ação de conta pendente do armazenamento local.',
getCurrentAuthUser:'Consulta o usuário associado ao token de sessão atual.',
signUp:'Cria uma conta no Supabase Auth, configura o redirecionamento e registra a sessão retornada.',
signIn:'Autentica por e-mail e senha e registra a sessão retornada.',
signOut:'Encerra a sessão remota quando há token e limpa o estado local mesmo se a chamada falhar.',
requestPasswordReset:'Solicita recuperação de senha com uma URL de retorno da aplicação.',
updatePassword:'Atualiza a senha com a sessão de recuperação atual e limpa o token após a conclusão.',
consumeAuthCallback:'Consome o callback de autenticação, grava a sessão e remove tokens do fragmento da URL.',
currentAccessToken:'Retorna o token de acesso mantido apenas na memória da sessão.',
hasSession:'Indica se existe token de acesso no estado de sessão em memória.',
setSession:'Atualiza o token de acesso guardado na sessão em memória.',
clearSession:'Apaga o token de acesso da sessão em memória.'
};
const fileTypes = {code:'file',config:'config',docs:'document',infra:'service',data:'table',script:'file',markup:'file'};
const nodes = [];
const fileIds = new Set();
for (const item of extract.results) {
  const {path, language, fileCategory, nonEmptyLines=0} = item;
  const [summary,tags] = meta[path] || [`Arquivo ${fileCategory} do aplicativo RPG com responsabilidades de ${path.split('/').slice(-2).join(' e ')}.`,[fileCategory,'rpg','application']];
  const type = fileTypes[fileCategory] || 'file';
  const id = `${type}:${path}`; fileIds.add(path);
  nodes.push({id,type,name:path.split('/').at(-1),filePath:path,summary,tags,complexity:nonEmptyLines>200?'complex':nonEmptyLines>50?'moderate':'simple'});
  const exports = new Set((item.exports||[]).map(e=>e.name));
  for (const fn of item.functions||[]) {
    const length = fn.endLine-fn.startLine+1;
    if (!exports.has(fn.name) && length < 10) continue;
    const fnId=`function:${path}:${fn.name}`;
    nodes.push({id:fnId,type:'function',name:fn.name,filePath:path,lineRange:[fn.startLine,fn.endLine],summary:functionDescriptions[fn.name] || `Executa a rotina ${fn.name} na camada de ${path.includes('/features/')?'interface do usuário':'autenticação e perfil'}.`,tags:['function',path.includes('/test/')?'test':'application-logic',path.includes('auth')?'authentication':path.includes('profile')?'profile':'rpg'],complexity:length>60?'complex':length>20?'moderate':'simple'});
  }
}
const edges=[];
const edgeKeys=new Set();
function edge(source,target,type,weight) { if(source===target)return; const k=[source,target,type].join('|');if(edgeKeys.has(k))return;edgeKeys.add(k);edges.push({source,target,type,direction:'forward',weight}); }
for(const item of extract.results){
 const fileType=fileTypes[item.fileCategory]||'file'; const source=`${fileType}:${item.path}`;
 for(const fn of item.functions||[]){
  const length=fn.endLine-fn.startLine+1, exports=new Set((item.exports||[]).map(e=>e.name));
  if(!exports.has(fn.name)&&length<10)continue;
  edge(source,`function:${item.path}:${fn.name}`,'contains',1.0);
 }
 for(const targetPath of batch.batchImportData[item.path]||[]){
  const targetInfo=extract.results.find(x=>x.path===targetPath);
  const targetType=targetInfo?fileTypes[targetInfo.fileCategory]||'file':'file';
  edge(source,`${targetType}:${targetPath}`,'imports',0.7);
 }
}
const testedBy={
'frontend/src/features/account/username-settings-field.tsx':['frontend/test/account-username-settings-render.test.ts'],
'frontend/src/auth-state.ts':['frontend/test/client-auth.test.ts'],
'frontend/src/config.ts':['frontend/test/client-auth.test.ts'],
'frontend/src/supabase-auth.ts':['frontend/test/client-auth.test.ts','frontend/test/system-cover-storage.test.ts'],
'frontend/src/api.ts':['frontend/test/system-cover-storage.test.ts','frontend/test/ui-render.test.ts'],
'frontend/src/features/account/account-card.tsx':['frontend/test/ui-render.test.ts'],
'frontend/src/features/dashboard/dashboard.tsx':['frontend/test/ui-render.test.ts'],
'frontend/src/features/profile/profile-card.tsx':['frontend/test/ui-render.test.ts'],
'frontend/app/rpg-app.tsx':['frontend/test/ui-render.test.ts'],
'frontend/src/features/shell/app-header.tsx':['frontend/test/ui-render.test.ts'],
'frontend/src/features/profile/username-setup.tsx':['frontend/test/username-setup-render.test.ts'],
};
for(const [production,tests] of Object.entries(testedBy)) for(const testPath of tests) edge(`file:${production}`,`file:${testPath}`,'tested_by',0.5);
const output={nodes,edges};
fs.writeFileSync('.ua/intermediate/batch-4.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({files:extract.filesAnalyzed,nodes:nodes.length,edges:edges.length,functions:nodes.filter(n=>n.type==='function').length,imports:edges.filter(e=>e.type==='imports').length},null,2));
