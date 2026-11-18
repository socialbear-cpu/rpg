import fs from 'node:fs';

const root = process.cwd();
const batch = JSON.parse(fs.readFileSync('.ua/intermediate/batches.json', 'utf8')).batches[0];
const extracted = JSON.parse(fs.readFileSync('.ua/tmp/ua-file-extract-results-1.json', 'utf8'));
const fileInfo = {
  'backend/src/authenticate-user.ts': ['Valida o formato do bearer token e consulta o Supabase Auth para autenticar o usuário.', ['autenticação', 'supabase-auth', 'segurança']],
  'backend/src/clients/supabase.ts': ['Cria um cliente Supabase associado ao token do usuário para chamadas autenticadas à API.', ['supabase', 'cliente', 'autenticação']],
  'backend/src/config.ts': ['Valida as variáveis de ambiente e monta a configuração usada nos ambientes de execução e desenvolvimento.', ['configuração', 'ambiente', 'validação']],
  'backend/src/modules/account/account.routes.ts': ['Registra endpoints de consulta, atualização, desativação e transferência relacionados à conta do usuário.', ['api-handler', 'conta', 'segurança']],
  'backend/src/modules/chats/chats.repository.ts': ['Implementa consultas e mutações de chats e mensagens, verificando o acesso do personagem ao chat.', ['repositório', 'chat', 'supabase']],
  'backend/src/modules/chats/chats.routes.ts': ['Expõe endpoints autenticados para listar chats de personagens, obter mensagens e enviar mensagens.', ['api-handler', 'chat', 'validação']],
  'backend/src/modules/chats/chats.schema.ts': ['Define schemas Zod para parâmetros, mensagens e respostas dos endpoints de chat.', ['validação', 'schema-api', 'chat']],
  'backend/src/modules/direct-messages/direct-messages.routes.ts': ['Registra as rotas de mensagens diretas e aplica autenticação às operações de conversa entre usuários.', ['api-handler', 'mensagens', 'autenticação']],
  'backend/src/modules/experience/experience.repository.ts': ['Consulta e atualiza configurações de experiência e o histórico de experiência dos personagens.', ['repositório', 'experiência', 'supabase']],
  'backend/src/modules/experience/experience.routes.ts': ['Expõe endpoints autenticados para consultar e administrar configurações e dados de experiência.', ['api-handler', 'experiência', 'validação']],
  'backend/src/modules/experience/experience.schema.ts': ['Define schemas de entrada e saída para configurações, fontes e resumos de experiência.', ['validação', 'schema-api', 'experiência']],
  'backend/src/modules/health/health.routes.ts': ['Registra a rota de saúde usada para verificar se a API está respondendo.', ['api-handler', 'health-check', 'monitoramento']],
  'backend/src/modules/lobby-presence/lobby-presence.repository.ts': ['Atualiza o heartbeat de presença de um sistema de jogo no lobby.', ['repositório', 'lobby', 'presença']],
  'backend/src/modules/lobby-presence/lobby-presence.routes.ts': ['Expõe operações autenticadas de presença no lobby e consulta da contagem de participantes.', ['api-handler', 'lobby', 'presença']],
  'backend/src/modules/lobby-presence/lobby-presence.schema.ts': ['Valida os parâmetros e a resposta de contagem da presença no lobby.', ['validação', 'schema-api', 'lobby']],
  'backend/src/modules/notifications/notifications.repository.ts': ['Lê, transforma e atualiza notificações do usuário e cria anúncios para sistemas de jogo.', ['repositório', 'notificações', 'supabase']],
  'backend/src/modules/notifications/notifications.routes.ts': ['Expõe endpoints autenticados para listar notificações, marcá-las como lidas e publicar anúncios.', ['api-handler', 'notificações', 'autenticação']],
  'backend/src/modules/notifications/notifications.schema.ts': ['Define schemas para notificações, paginação, anúncios e resultados de mutação.', ['validação', 'schema-api', 'notificações']],
  'backend/src/modules/social/public-profile.routes.ts': ['Registra endpoints públicos de perfil e as operações de perfil que exigem usuário autenticado.', ['api-handler', 'perfil', 'social']],
  'backend/src/modules/social/social.repository.ts': ['Implementa busca de perfis, amizades e convites entre usuários, sistemas e chats.', ['repositório', 'social', 'supabase']],
  'backend/src/modules/social/social.routes.ts': ['Registra rotas de busca social, amizades e convites para sistemas e chats, com validação e respostas HTTP.', ['api-handler', 'social', 'convites']],
  'backend/src/modules/social/social.schema.ts': ['Define schemas para busca de perfis, amizades, decisões de convite e respostas das operações sociais.', ['validação', 'schema-api', 'social']],
  'backend/src/plugins/authenticate.ts': ['Adapta a autenticação Supabase para preHandlers Fastify, incluindo contas inativas e opcionais.', ['middleware', 'autenticação', 'fastify']],
  'backend/src/register-app.ts': ['Registra plugins e módulos de rota da API Fastify em uma única aplicação.', ['registro', 'fastify', 'api']],
  'backend/src/server.ts': ['Inicializa o servidor HTTP de desenvolvimento e inicia a aplicação Fastify.', ['entry-point', 'servidor', 'fastify']],
  'backend/src/vercel-app.ts': ['Prepara a aplicação Fastify para execução integrada às funções do Vercel.', ['vercel', 'fastify', 'deploy']],
  'backend/test/config.test.ts': ['Testa a leitura e validação da configuração, incluindo cenários de ambiente inválido.', ['test', 'configuração', 'validação']],
  'backend/test/social.schema.test.ts': ['Testa os schemas Zod de parâmetros e entradas usados nas rotas sociais.', ['test', 'social', 'validação']],
};
const functionInfo = {
  parseBearerToken: 'Extrai um token válido do cabeçalho Authorization no formato Bearer.',
  authenticateAccessToken: 'Valida o access token com Supabase Auth e devolve o usuário autenticado.',
  createUserSupabaseClient: 'Cria um cliente Supabase com o access token do usuário.',
  loadRuntimeConfig: 'Valida variáveis obrigatórias e constrói a configuração de execução.',
  loadConfig: 'Carrega a configuração considerando valores de runtime e defaults de desenvolvimento.',
  accountRoutes: 'Registra os endpoints de gerenciamento da conta do usuário.',
  createSystemChat: 'Cria um chat associado a um sistema e personagem, respeitando as regras de acesso.',
  listCharacterChats: 'Lista os chats aos quais o personagem tem acesso.',
  listChatMessages: 'Busca as mensagens de um chat acessível ao personagem.',
  createChatMessage: 'Grava uma mensagem no chat após verificar o acesso do personagem.',
  chatsRoutes: 'Registra os endpoints de consulta e envio de mensagens de chat.',
  documentedChatInput: 'Monta os metadados documentados para o schema de entrada do chat.',
  directMessagesRoutes: 'Registra as rotas de mensagens diretas protegidas por autenticação.',
  readOwnerExperienceSettings: 'Lê as configurações de experiência do proprietário do sistema.',
  saveOwnerExperienceSettings: 'Salva as configurações de experiência administradas pelo proprietário.',
  readCharacterExperience: 'Consulta o resumo de experiência de um personagem.',
  experienceRoutes: 'Registra endpoints de consulta e administração da experiência.',
  healthRoutes: 'Registra a rota de health check da API.',
  heartbeatGameSystemLobbyPresence: 'Atualiza o heartbeat de presença do sistema no lobby.',
  lobbyPresenceRoutes: 'Registra endpoints para heartbeat e contagem de presença do lobby.',
  parseNotification: 'Converte o registro do banco para a representação de notificação da API.',
  listMyNotifications: 'Lista as notificações do usuário autenticado.',
  markMyNotificationRead: 'Marca uma notificação do usuário como lida.',
  createSystemAnnouncement: 'Cria uma notificação de anúncio para os membros do sistema.',
  notificationsRoutes: 'Registra endpoints de consulta, leitura e publicação de notificações.',
  publicProfileRoutes: 'Registra as rotas de consulta e atualização de perfis públicos.',
  rpc: 'Executa chamadas RPC sociais e padroniza o tratamento de erros do Supabase.',
  searchSocialProfiles: 'Busca perfis públicos disponíveis para descoberta social.',
  listMyFriendships: 'Lista as amizades e solicitações associadas ao usuário atual.',
  createFriendRequest: 'Cria uma solicitação de amizade entre usuários.',
  respondFriendRequest: 'Aceita ou recusa uma solicitação de amizade.',
  cancelFriendRequest: 'Cancela uma solicitação de amizade pendente.',
  removeFriend: 'Remove uma amizade existente.',
  createRpgInvitation: 'Cria um convite para um sistema ou chat de RPG.',
  listMySocialInvitations: 'Lista os convites sociais recebidos pelo usuário.',
  respondRpgInvitation: 'Aceita ou recusa um convite de RPG.',
  sendMutationResult: 'Converte estados de mutação social em respostas HTTP e mensagens de erro.',
  sendInvitationResult: 'Converte estados de convite em respostas HTTP coerentes.',
  socialRoutes: 'Registra rotas de busca social, amizades e convites de RPG.',
  authenticateRequest: 'Lê o token da requisição, autentica o usuário e injeta credenciais no contexto Fastify.',
  authenticate: 'Cria um preHandler que exige um usuário autenticado e ativo.',
  authenticateAllowInactive: 'Cria um preHandler que autentica sem bloquear usuários inativos.',
  registerApp: 'Registra configuração, plugins e todas as famílias de rotas da aplicação.',
};

const complexity = (lines) => lines > 200 ? 'complex' : lines >= 50 ? 'moderate' : 'simple';
const nodes = [];
const edges = [];
const nodeIds = new Set();
const addNode = (node) => { if (nodeIds.has(node.id)) return; nodeIds.add(node.id); nodes.push(node); };

for (const file of extracted.results) {
  const [summary, tags] = fileInfo[file.path];
  const fileId = `file:${file.path}`;
  addNode({ id: fileId, type: 'file', name: file.path.split('/').at(-1), filePath: file.path, summary, tags, complexity: complexity(file.nonEmptyLines) });
  const exports = new Set((file.exports ?? []).map((item) => typeof item === 'string' ? item : item.name));
  for (const fn of file.functions ?? []) {
    const fnId = `function:${file.path}:${fn.name}`;
    if (fn.endLine - fn.startLine + 1 < 10 && !exports.has(fn.name)) continue;
    addNode({ id: fnId, type: 'function', name: fn.name, filePath: file.path, lineRange: [fn.startLine, fn.endLine], summary: functionInfo[fn.name] ?? `Executa a operação de ${fn.name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} nesta camada.`, tags: ['função', /Routes$|Routes$/.test(fn.name) ? 'api-handler' : 'backend', /parse|validate|safeParse/i.test(fn.name) ? 'validação' : 'serviço'], complexity: complexity(fn.endLine - fn.startLine + 1) });
    edges.push({ source: fileId, target: fnId, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exports.has(fn.name)) edges.push({ source: fileId, target: fnId, type: 'exports', direction: 'forward', weight: 0.8 });
  }
  for (const target of batch.batchImportData[file.path] ?? []) edges.push({ source: fileId, target: `file:${target}`, type: 'imports', direction: 'forward', weight: 0.7 });
}

// Canonical production-to-test coverage for the two tests whose imports are explicit in the map.
edges.push({ source: 'file:backend/src/config.ts', target: 'file:backend/test/config.test.ts', type: 'tested_by', direction: 'forward', weight: 0.5 });
edges.push({ source: 'file:backend/src/modules/social/social.schema.ts', target: 'file:backend/test/social.schema.test.ts', type: 'tested_by', direction: 'forward', weight: 0.5 });

const expectedImports = Object.values(batch.batchImportData).reduce((n, paths) => n + paths.length, 0);
const actualImports = edges.filter((edge) => edge.type === 'imports').length;
if (expectedImports !== actualImports) throw new Error(`Import edge mismatch: expected ${expectedImports}, got ${actualImports}`);
const out = { nodes, edges };
fs.writeFileSync('.ua/intermediate/batch-1.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ files: extracted.results.length, nodes: nodes.length, edges: edges.length, imports: actualImports }));
