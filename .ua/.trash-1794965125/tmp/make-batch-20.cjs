const fs = require('fs');
const paths = [
  ['file','.superpowers/brainstorm/astra-review/state/server-info','Marcador de estado de um servidor local de prévia usado durante a revisão Astra. Registra metadados de execução; valores voláteis foram omitidos.',['estado','revisao','desenvolvimento'],'simple'],
  ['file','.superpowers/brainstorm/character-sheet-visual/content/approaches.html','Protótipo visual em português que compara dois fluxos para montar fichas de personagem: campos organizados e montagem livre por etapas, ambos com opções gráficas e prévia do jogador.',['prototipo','ficha-personagem','experiencia-usuario'],'moderate'],
  ['file','.superpowers/brainstorm/character-sheet-visual/state/server-stopped','Registro de que o servidor local de prévia do protótipo de ficha foi encerrado após inatividade.',['estado','prototipo','desenvolvimento'],'simple'],
  ['file','.superpowers/brainstorm/codex-cards-20261115/state/server-stopped','Registro de encerramento por inatividade do servidor local usado para visualizar os cartões de Codex.',['estado','prototipo','desenvolvimento'],'simple'],
  ['file','.superpowers/brainstorm/sheet-mockup/state/server-info','Metadados de execução do servidor local de prévia do mockup de fichas; detalhes voláteis da conexão foram omitidos.',['estado','mockup','desenvolvimento'],'simple'],
  ['config','.ua/config.json','Preferência do Understand Anything para gerar o conteúdo do grafo em português.',['configuracao','idioma','understand-anything'],'simple'],
  ['document','database/README.md','Documenta a organização das migrações SQL, os domínios do banco e convenções de segurança e evolução; detalha ainda a economia da loja, carteiras, lançamentos e compras atômicas.',['documentacao','banco-de-dados','convencoes'],'moderate'],
  ['document','database/schema/README.md','Resume os domínios do esquema relacional, incluindo contas, autorização, sistemas de jogo, progressão, trocas, loja e conversas; aponta as migrações como DDL canônico.',['documentacao','esquema','banco-de-dados'],'simple'],
  ['file','database/tests/daily_login_per_character_rollback.sql','Teste transacional que valida reivindicações de recompensa diária por personagem, atualização de saldo, disponibilidade entre personagens do mesmo sistema e prevenção de crédito duplicado; desfaz as alterações ao final.',['teste','sql','recompensa-diaria','rollback'],'simple'],
  ['file','frontend/app/account-page.css','Define a apresentação responsiva da página de autenticação, com painéis de narrativa e formulário, identidade visual escura e componentes de acesso.',['estilos','autenticacao','interface'],'complex'],
  ['file','frontend/app/globals.css','Define estilos globais, tokens de cor e tipografia da aplicação, além de padrões compartilhados para navegação por abas e superfícies visuais.',['estilos','tema-global','interface'],'moderate'],
  ['file','frontend/app/layout.tsx','Layout raiz do Next.js que define viewport, metadados, idioma pt-BR e envolve as páginas com a estrutura HTML base.',['ponto-de-entrada','layout','nextjs'],'simple'],
  ['file','frontend/next-env.d.ts','Declarações de tipos geradas pelo Next.js para integrar os tipos do framework e as definições de rotas geradas.',['typescript','tipos','gerado'],'simple'],
  ['file','frontend/next.config.ts','Configura o Next.js para o workspace: injeta variáveis públicas de URL do Supabase e da aplicação, define a raiz do Turbopack e ajusta aliases de extensão do webpack.',['configuracao','nextjs','supabase','build-system'],'simple'],
  ['file','frontend/src/features/account/account-settings-page.css','Estiliza a página de configurações da conta, seus cartões, avisos de confirmação e estados inativos, mantendo hierarquia de títulos e campos consistente.',['estilos','conta','interface'],'moderate'],
  ['file','frontend/src/features/characters/characters.css','Reúne estilos das telas e componentes de personagens, incluindo entradas, formulários, galerias, cartões e áreas de lobby.',['estilos','personagens','interface'],'complex'],
  ['file','frontend/src/features/characters/lobby-creator-tools.css','Estiliza controles de criação e personalização do lobby, com campos, opções e ações compactas.',['estilos','lobby','ferramentas'],'simple'],
  ['file','frontend/src/features/chats/chat.css','Define a apresentação dos painéis de chat, mensagens e controles associados à conversa durante o jogo.',['estilos','chat','interface'],'simple'],
  ['file','frontend/src/features/daily-login/daily-login-admin.css','Estiliza os controles administrativos de configuração das recompensas de login diário.',['estilos','recompensa-diaria','administracao'],'simple'],
  ['file','frontend/src/features/daily-login/daily-login-popup.css','Define o layout visual do popup de login diário, incluindo apresentação da recompensa e ações de reivindicação.',['estilos','recompensa-diaria','popup'],'simple'],
  ['file','frontend/src/features/dashboard/dashboard.css','Folha extensa de estilos do dashboard, cobrindo navegação, painéis, cartões, listas e layouts responsivos da área principal do jogo.',['estilos','dashboard','responsivo'],'complex'],
  ['file','frontend/src/features/notifications/notifications.css','Estiliza a central de notificações, seus itens, estados de leitura, ações e apresentação responsiva.',['estilos','notificacoes','interface'],'complex'],
  ['file','frontend/src/features/profile/profile-card.css','Define cartões de perfil, avatares, identidade visual e estados de interação usados na apresentação de jogadores.',['estilos','perfil','cartao'],'moderate'],
  ['file','frontend/src/features/profile/public-profile-page.css','Estiliza a página pública de perfil e os elementos de apresentação compartilháveis do jogador.',['estilos','perfil-publico','interface'],'simple'],
  ['file','frontend/src/features/shell/app-header.css','Define a barra superior da aplicação, incluindo marca, navegação e menu popover do perfil do usuário.',['estilos','cabecalho','navegacao'],'moderate']
];
const nodes = paths.map(([type,filePath,summary,tags,complexity]) => {
  const id = `${type === 'document' ? 'document' : type === 'config' ? 'config' : 'file'}:${filePath}`;
  return {id,type,name:filePath.split('/').pop(),filePath,summary,tags,complexity};
});
const fn = {id:'function:frontend/app/layout.tsx:RootLayout',type:'function',name:'RootLayout',filePath:'frontend/app/layout.tsx',lineRange:[16,22],summary:'Monta a estrutura HTML raiz da aplicação, aplica o idioma pt-BR e renderiza o conteúdo das páginas dentro do body.',tags:['layout','nextjs','componente-raiz'],complexity:'simple'};
nodes.push(fn);
const edges = [
  {source:'file:frontend/app/layout.tsx',target:'file:frontend/app/globals.css',type:'imports',direction:'forward',weight:0.7},
  {source:'file:frontend/app/layout.tsx',target:fn.id,type:'contains',direction:'forward',weight:1.0},
  {source:'file:frontend/app/layout.tsx',target:fn.id,type:'exports',direction:'forward',weight:0.8}
];
const relationships = {
  'frontend/app/account-page.css':['frontend/app/rpg-app.tsx'],
  'frontend/src/features/account/account-settings-page.css':['frontend/src/features/account/account-settings-page.tsx'],
  'frontend/src/features/characters/characters.css':['frontend/src/features/characters/character-entry.tsx','frontend/src/features/characters/character-form.tsx','frontend/src/features/characters/character-gallery.tsx','frontend/src/features/characters/character-home.tsx','frontend/src/features/characters/lobby-settings-page.tsx'],
  'frontend/src/features/characters/lobby-creator-tools.css':['frontend/src/features/characters/lobby-creator-tools.tsx','frontend/src/features/characters/lobby-customization-form.tsx','frontend/src/features/characters/lobby-settings-page.tsx'],
  'frontend/src/features/chats/chat.css':['frontend/src/features/chats/chats.tsx'],
  'frontend/src/features/daily-login/daily-login-admin.css':['frontend/src/features/daily-login/daily-login-admin-card.tsx'],
  'frontend/src/features/daily-login/daily-login-popup.css':['frontend/src/features/daily-login/daily-login-popup.tsx'],
  'frontend/src/features/dashboard/dashboard.css':['frontend/src/features/dashboard/dashboard.tsx'],
  'frontend/src/features/notifications/notifications.css':['frontend/src/features/notifications/notification-center.tsx'],
  'frontend/src/features/profile/profile-card.css':['frontend/src/features/profile/profile-card.tsx'],
  'frontend/src/features/profile/public-profile-page.css':['frontend/src/features/profile/public-profile-page.tsx'],
  'frontend/src/features/shell/app-header.css':['frontend/src/features/shell/app-header.tsx']
};
for (const [css,components] of Object.entries(relationships)) for(const component of components) edges.push({source:`file:${css}`,target:`file:${component}`,type:'related',direction:'forward',weight:0.5});
const out={nodes,edges};
fs.writeFileSync('.ua/intermediate/batch-20.json',JSON.stringify(out,null,2)+'\n');
const ids=new Set(nodes.map(n=>n.id));
const invalid=edges.filter(e=>!ids.has(e.source)&&!e.source.startsWith('file:frontend/'));
if(invalid.length) throw new Error(JSON.stringify(invalid));
console.log(JSON.stringify({nodes:nodes.length,edges:edges.length,fileNodes:paths.length,unresolvedExternalReferences:edges.filter(e=>!ids.has(e.target)).length}));
