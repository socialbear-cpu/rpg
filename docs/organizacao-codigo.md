# Organização do código — 18/11/2026

## Objetivo e resultado

Esta revisão remove repetições de configuração e de montagem de requisições, simplifica cálculos do lobby e evita processamento duplicado na prévia de perfil. As funcionalidades, URLs, mensagens de erro e regras de autorização existentes foram preservadas.

Nos arquivos de produção alterados, incluindo o novo módulo compartilhado, o total passou de **3.542 para 3.439 linhas: 103 linhas a menos**. A contagem exclui testes, documentação e arquivos gerados. Foram centralizadas configurações de 14 módulos de rotas e 34 requisições JSON. Esses números descrevem esta revisão, não uma promessa de que todo o repositório atingiu um mínimo absoluto de linhas.

Reduzir linhas por meio de minificação não reduz necessariamente o trabalho em execução. Por isso, as funções mantêm nomes e tipos legíveis; a busca da próxima sessão usa algumas linhas adicionais para evitar uma ordenação e listas temporárias.

## Como o código está organizado

| Área | Responsabilidade |
| --- | --- |
| `backend/src/http/` | Configurações HTTP realmente compartilhadas entre módulos. |
| `backend/src/modules/` | Rotas, validação e acesso a dados de cada domínio. |
| `frontend/src/api.ts` | Tipos e funções usadas pela interface para conversar com a API. |
| `frontend/src/features/` | Componentes e comportamento de cada funcionalidade. |
| `backend/test/` e `frontend/test/` | Verificações executadas sob demanda, separadas do comportamento da aplicação. |
| `database/` e `supabase/` | Histórico de banco, configuração e verificações SQL. |

## Backend: arquivo compartilhado novo

### `backend/src/http/route-options.ts`

- **Imports:** Zod fornece a validação de UUID; `authenticate` continua sendo o middleware real de autenticação.
- **`errorSchema`:** descreve a resposta HTTP `{ error: string }`, exige a propriedade e não permite propriedades adicionais. É reutilizado na serialização e na documentação OpenAPI.
- **`authOptions`:** associa `authenticate` ao `preHandler` e declara segurança Bearer para o OpenAPI. Compartilhar a configuração não guarda dados de usuários: identidade e cliente Supabase continuam vinculados a cada requisição pelo middleware.
- **`systemParamsSchema`:** exige exatamente um parâmetro `systemId` com UUID válido. A validação estrita rejeita chaves extras, como as declarações substituídas já faziam.
- **`systemIdFromParams(params)`:** usa `safeParse` e devolve o UUID validado ou `null`; cada rota mantém sua resposta de erro específica.

Antes, os consumidores criavam cópias dessas mesmas declarações. Agora importam apenas as partes utilizadas. O nome local `auth` é mantido em alguns módulos por meio de `authOptions as auth`, evitando reescrever seus handlers.

## Backend: alterações por arquivo de rotas

Os handlers continuam com esta sequência: autenticar, validar entrada, verificar permissões do domínio, chamar o repositório/RPC e traduzir o resultado em uma resposta HTTP. Só as declarações idênticas indicadas abaixo foram centralizadas; validações e mensagens específicas permanecem locais.

### `backend/src/modules/account/account.routes.ts`

**Mudança:** importa `errorSchema`, removendo sua cópia local.

- Os schemas locais descrevem os dados da conta e os resultados das operações.
- `databaseError` oculta detalhes internos de falhas de banco; `sendRpcStatus` converte estados retornados pelas RPCs em respostas HTTP.
- `accountRoutes` registra consulta, desativação, reativação e exclusão da conta, além da criação, aceitação e cancelamento de transferências de sistemas.
- Os guards específicos são preservados: certas operações usam `authenticateAllowInactive`, pois precisam funcionar para contas desativadas.

### `backend/src/modules/chats/chats.routes.ts`

**Mudança:** importa `authOptions` com nome local `auth` e `errorSchema`.

- `documentedChatInput` transforma os schemas em documentação sem antecipar a remoção de chaves pela validação do Fastify.
- `chatsRoutes` cria salas com personagem anfitrião, lista salas do personagem e lê/envia mensagens.
- Os handlers mantêm as verificações de acesso ao sistema, de propriedade do personagem e de participação na sala antes de operar nos dados.

### `backend/src/modules/daily-login/daily-login.routes.ts`

**Mudança:** importa `authOptions` e `errorSchema`.

- `claimOpenApiBody` e `scheduleOpenApiBody` descrevem os corpos do resgate e da configuração do calendário.
- `getSystemId` mantém sua validação local existente. Ela não é trocada pela validação estrita compartilhada porque não é uma implementação idêntica.
- `databaseError` produz a mensagem própria de falha das recompensas.
- `dailyLoginRoutes` controla o popup, lista sistemas/recompensas, solicita resgates por personagem e permite ao responsável consultar/salvar o calendário.
- A entrega atômica de recompensas permanece na RPC do banco.

### `backend/src/modules/experience/experience.routes.ts`

**Mudança:** importa `errorSchema`, `authOptions` e `systemIdFromParams`; remove as declarações correspondentes.

- `characterParamsSchema` e `characterIdFromParams` validam o identificador específico de personagem.
- `databaseError` mantém o tratamento próprio das falhas de experiência.
- `experienceRoutes` registra leitura/alteração de regras de XP pelo proprietário e consulta de XP, nível e histórico de personagens.
- A validação estrita do corpo e a conversão de estados como `not_owner`, `invalid_settings` e `unauthorized` continuam locais.

### `backend/src/modules/game-systems/game-systems.routes.ts`

**Mudança:** importa `errorSchema`, `authOptions` e `systemIdFromParams`.

- Os schemas locais descrevem sistemas, campos de ficha, senha, ciclo de vida e filtros de listagem.
- `databaseError` e `gameSystemLifecycleDatabaseError` mantêm mensagens adequadas à operação que falhou.
- `gameSystemsRoutes` registra catálogo de tags, listagem/criação/edição de sistemas, arquivamento/ativação/exclusão, autorização por senha e leitura/alteração de fichas e personagens.
- `rejectSystemAccess` continua traduzindo recusas de acesso; as verificações de proprietário e a validação dos atributos da ficha não foram removidas.

### `backend/src/modules/lobby-presence/lobby-presence.routes.ts`

**Mudança:** importa `authOptions` como `auth` e `errorSchema`.

- `lobbyPresenceParamsSchema` continua validando a entrada do domínio.
- `lobbyPresenceRoutes` recebe o heartbeat autenticado e devolve a contagem agregada de jogadores online.
- O repositório continua responsável pela chamada à RPC e pelo resultado; o handler mantém as respostas para recusas e falhas.

### `backend/src/modules/lobby-settings/lobby-settings.routes.ts`

**Mudança:** importa `authOptions` como `auth`, `systemParamsSchema` e `errorSchema`; remove o import de Zod que ficou sem uso.

- `checkMemberAccess` aplica as regras existentes de acesso ao sistema.
- `canManage` exige administrador da plataforma ou proprietário daquele sistema.
- `lobbySettingsRoutes` consulta as configurações visíveis e permite salvar a personalização a quem pode administrar.
- `lobbySettingsSchema` continua validando o conteúdo salvo.

### `backend/src/modules/notifications/notifications.routes.ts`

**Mudança:** importa `errorSchema` e `authOptions`.

- Os schemas de paginação, identificadores e anúncios validam as entradas de cada operação.
- `databaseError` mantém a resposta segura de falha de notificações.
- `notificationsRoutes` lista notificações e total não lido, marca notificações como lidas e publica anúncios de sistemas.
- Os limites de paginação, formatos de resposta e regras do repositório permanecem preservados.

### `backend/src/modules/profile/profile.routes.ts`

**Mudança:** importa `errorSchema`, removendo a cópia que era recriada ao registrar as rotas.

- `respondWithProfile` executa uma operação de perfil e trata resultado inexistente ou falha de banco.
- `isUniqueViolation` reconhece conflito de unicidade; `isUsernameChangeUsed` reconhece a restrição da troca de nick.
- `respondWithUsernameClaim` trata a escolha/troca do nick, inclusive conflitos e limites já existentes.
- `profileRoutes` registra leitura e alteração do perfil, preservando a edição independente de nick e as descrições OpenAPI específicas.

### `backend/src/modules/social/social.routes.ts`

**Mudança:** importa `errorSchema` e `authOptions`.

- Os schemas locais documentam perfis sociais, amizades, pedidos e convites.
- `databaseError` mantém a mensagem da rede de amigos.
- `sendMutationResult` traduz resultados de pedidos/amizades; `sendInvitationResult` traduz resultados de convites para códigos e mensagens HTTP.
- `socialRoutes` registra busca de jogadores, listagem de amigos, criação/resposta de pedidos, remoção de amizade e criação/listagem/resposta de convites para sistemas e salas.

### `backend/src/modules/store/store.routes.ts`

**Mudança:** importa `authOptions` como `auth`, removendo sua configuração idêntica.

- `documentedInputs` publica schemas de corpo, query e parâmetros no OpenAPI sem substituir a validação estrita em execução.
- `storeRoutes` consulta loja/saldo, solicita compras e registra operações administrativas de itens, catálogo, moeda e ofertas.
- A autorização de acesso, a propriedade do personagem e a permissão de administrar continuam verificadas.
- Compra e atualização atômica da loja continuam delegadas às RPCs existentes.

### `backend/src/modules/system-events/system-events.routes.ts`

**Mudança:** importa `authOptions` como `auth`, `systemParamsSchema` e `errorSchema`.

- `eventParamsSchema` mantém a validação conjunta de sistema e evento.
- `checkEventAccess` distingue permissão de administração e acesso comum ao sistema.
- `documentedBody` prepara o corpo documentado sem alterar a validação estrita.
- `systemEventsRoutes` lista, cria, edita, inicia e exclui eventos com as permissões já existentes.

### `backend/src/modules/system-membership/system-membership.routes.ts`

**Mudança:** importa `errorSchema` e `authOptions`.

- Os schemas de busca, parâmetros e atualização de moderador continuam validando cada entrada.
- `databaseError` mantém o tratamento de falhas de participação.
- `systemMembershipRoutes` consulta os vínculos do usuário, busca membros pelo personagem e concede/revoga a função de moderador.
- As regras de proprietário e a tradução de recusas das RPCs permanecem intactas.

### `backend/src/modules/trading/trading.routes.ts`

**Mudança:** importa `errorSchema`, `authOptions` e `systemParamsSchema`.

- Os schemas locais continuam validando personagem, oferta, paginação e linhas da negociação.
- `databaseError` e `inventoryDatabaseError` distinguem falhas de negociação e de inventário.
- `mutationReply` converte os estados das trocas em sucesso ou erro HTTP; `uuidParam` extrai identificadores validados.
- `tradingRoutes` lista personagens/inventários/ofertas e registra criação, resposta, contraproposta e cancelamento de ofertas.
- A revalidação de inventário e a transferência atômica continuam nas operações existentes do banco.

## Frontend: alterações por arquivo

### `frontend/src/api.ts`

**Mudança:** 34 funções passam a usar `jsonRequest`; `getMyProfile` e `updateMyProfile` deixam de passar pelo intermediário `profileRequest`, que foi excluído. A tipagem `Profile` passa diretamente ao transporte, dispensando as coerções `as Promise<Profile>` desses pontos.

| Parte | O que faz |
| --- | --- |
| Interfaces e tipos | Descrevem perfis, contas, amizades, sistemas, fichas, personagens, salas, eventos, recompensas, XP, inventários e lojas. Continuam no mesmo arquivo, sem duplicar os modelos em uma nova camada. |
| Funções sociais | Consultam jogadores, comentários, mensagens, amizades e convites; enviam alterações com os mesmos campos e URLs. |
| Funções de conta | Consultam/desativam/reativam/excluem conta e administram transferências de sistemas. Operações sem corpo continuam sem corpo. |
| Funções de sistemas e fichas | Listam, criam e atualizam sistemas, controlam disponibilidade/acesso e consultam/salvam fichas e personagens. |
| Funções de lobby, eventos e salas | Consultam/salvam personalização, enviam heartbeat e operam eventos, salas e mensagens. |
| Funções de progressão e trocas | Consultam/resgatam recompensas, configuram XP e enviam/criam/respondem/cancelam negociações. |
| Funções de loja | Consultam catálogo e saldo, criam itens, salvam ofertas/moeda e solicitam compra. |
| `jsonHeaders` | Mantém uma única definição de `Content-Type: application/json`. O transporte cria os cabeçalhos finais com o token da requisição atual. |
| `jsonRequest<T>(path, method, body)` | Serializa o corpo uma vez com `JSON.stringify` e chama `authenticatedRequest<T>`. Aceita os métodos usados nesses envios: POST, PUT e PATCH. |
| `authenticatedRequest<T>` | Obtém o token atual, rejeita ausência de sessão, envia Bearer e `cache: no-store`, interpreta JSON e mantém as mensagens de erro do servidor ou o fallback HTTP. Não guarda token em configuração compartilhada. |
| `checkHealth` | Consulta o endpoint público de saúde; não passa a exigir autenticação. |
| `getGameSystemCoverUrl` | Monta o endereço público da capa com segmentos escapados. |
| `uploadGameSystemCover` | Valida sessão, MIME e tamanho, gera um caminho único e envia o arquivo diretamente ao Storage. Mantém seu transporte binário. |
| `deleteGameSystemCover` | Valida o caminho e solicita exclusão no Storage com seus cabeçalhos e tratamento próprios. |

Por exemplo, uma alteração de perfil agora chama `jsonRequest<Profile>(caminho, 'PATCH', patch)`. O helper fornece os cabeçalhos e a serialização antes repetidos em cada função. GET, DELETE e POST sem corpo conservam seus comportamentos anteriores. O cancelamento de troca continua enviando `{}` como JSON, e o identificador opcional de personagem nos convites só é incluído quando informado.

### `frontend/src/features/characters/lobby-stats.tsx`

- **`countActiveLobbyChats`:** conta salas ativas com `reduce`, sem criar o array intermediário de `filter`. Mantém zero para entrada vazia.
- **`findNextLobbySession`:** percorre os eventos, ignora os iniciados, converte cada data relevante uma vez e guarda apenas o evento futuro mais próximo. Calcula a referência de tempo uma vez. Datas inválidas não vencem a comparação; em empate, mantém o primeiro evento da entrada. Não reordena a lista recebida.
- **`startLobbySessionClock`:** continua emitindo a hora a cada 30 segundos e quando a aba volta a ficar visível; sua limpeza cancela timer e listener.
- **`formatLobbySession`:** mantém os textos de hoje, amanhã e data completa. Compara com `now` diretamente, removendo uma cópia desnecessária da data atual.
- **`LobbyStatsDisplay`:** continua exibindo contagens, próxima sessão e estados de carregamento/indisponibilidade.
- **`LobbyStats`:** mantém carregamento de salas/eventos, controle de respostas após desmontagem e seleção da sessão com a hora atual.

### `frontend/src/features/profile/profile-card.tsx`

- **Tipos de props:** continuam descrevendo campos editáveis, autenticação, estado de salvamento e callbacks.
- **Preparação de interesses:** na prévia, separa por vírgula, remove espaços e entradas vazias e limita a 12 itens uma única vez. Na edição, não processa essa lista.
- **Ramo de prévia:** reutiliza a lista para decidir entre etiquetas de interesses e o texto de ausência de interesses.
- **Ramo de edição:** mantém os inputs, limites, callbacks e estados de botões existentes.

## Testes: arquivos alterados ou novos

Na primeira execução, 102 testes do backend falharam. A maior parte dos simuladores antigos não respondia à RPC `get_my_account_status`, que o middleware já exigia. Após atualizar esses simuladores, restaram duas expectativas antigas do OpenAPI; elas foram alinhadas aos campos já presentes no perfil. O código de autenticação da aplicação não foi alterado para contornar essas falhas.

### `backend/test/fixtures/supabase-fetch.ts` — novo

`withActiveAccount(fetch)` envolve o simulador HTTP existente: responde `true` à consulta de conta ativa e delega as demais requisições ao simulador original. Não substitui o middleware nem os repositórios. Destina-se aos cenários de conta ativa das suítes abaixo; recusas de autenticação são verificadas separadamente.

| Arquivo alterado | Mudança e responsabilidade preservada |
| --- | --- |
| `backend/test/chats.routes.test.ts` | Envolve o fetch com `withActiveAccount`; testa criação, acesso e mensagens de salas. |
| `backend/test/daily-login.routes.test.ts` | Usa o mesmo suporte; testa popup, calendário, resgates e recusas. |
| `backend/test/experience.routes.test.ts` | Usa o suporte; testa leitura de XP, configuração e permissões. |
| `backend/test/game-systems.routes.test.ts` | Usa o suporte; testa sistemas, fichas, personagens, senha e ciclo de vida. |
| `backend/test/store.routes.test.ts` | Usa o suporte; testa catálogo, compras, configurações e validação. |
| `backend/test/system-events.routes.test.ts` | Usa o suporte; testa listagem e administração de eventos. |
| `backend/test/system-membership.routes.test.ts` | Usa o suporte; testa vínculos, busca e mudanças de moderação. |
| `backend/test/trading.routes.test.ts` | Envolve os dois simuladores de fetch do arquivo; testa ofertas, contrapropostas, inventário e propriedade. |

### `backend/test/authenticate.test.ts`

O simulador passa a responder explicitamente à RPC de conta ativa. A asserção da sequência de chamadas inclui essa consulta e continua verificando Bearer e chave pública. Três cenários adicionais comprovam que conta desativada é recusada com 403 e respostas nula ou inválida são recusadas com 500, sem executar o handler protegido.

### `backend/test/openapi.test.ts`

As expectativas passam a incluir os campos de perfil já existentes: `username_change_used`, `banner_url`, `status`, `interests` e `phone`, conforme aplicável à resposta ou à edição. Limites e tipos também são verificados. Permanecem as verificações de segurança Bearer, corpo estrito, URLs permitidas e respostas de erro.

### `frontend/test/api-request.test.ts` — novo

O teste substitui apenas a leitura do token e a fronteira HTTP. Confere métodos POST/PUT/PATCH, caminhos escapados, Bearer, Content-Type, ausência de cache, listas, campos nulos/opcionais e corpo vazio de cancelamento. Também verifica bloqueio sem sessão, retorno do perfil, mensagem do servidor e fallback para resposta não JSON.

### `frontend/test/lobby-stats.test.ts`

Além dos cenários existentes, verifica contagem vazia, ausência de sessão válida, datas inválidas, evento exatamente no horário atual, empate entre eventos e preservação da ordem de entrada. Mantém verificações do relógio, resumo visual e heartbeat.

### `frontend/test/ui-render.test.ts`

Três cenários adicionais verificam a prévia de interesses: lista vazia, limpeza de espaços/entradas vazias e limite de 12 itens. As verificações de formulário, navegação e estados de autenticação continuam existentes.

## Recursos: o que efetivamente mudou

| Trecho | Antes | Depois |
| --- | --- | --- |
| Próxima sessão | Filtra, aloca lista e ordena os eventos futuros: O(n + k log k), com k eventos elegíveis. | Uma passagem O(n), com espaço auxiliar O(1). |
| Contagem de salas | `filter` cria uma lista apenas para consultar seu tamanho. | Contagem O(n) com espaço auxiliar O(1). |
| Interesses na prévia | Separação, limpeza e filtragem repetidas para condição e renderização. | Um processamento por renderização da prévia. |
| Cabeçalhos de JSON | Mesmo objeto literal repetido em 34 pontos. | Uma definição compartilhada; o Bearer continua sendo montado com o token atual. |
| Configurações HTTP | Cópias de schemas/opções em vários módulos. | Definições compartilhadas e imports locais. |

Não foi realizado benchmark de CPU, heap, tempo de rede ou tamanho do bundle de produção. A redução de texto-fonte não equivale à mesma redução no JavaScript compilado. As quantidades de requisições, consultas ao banco, intervalos de polling e dependências não foram alteradas.

## Decisões de preservação

- Migrações em `database/migrations/` e `supabase/migrations/` representam sequências de instalação documentadas. Apagar cópias ou editar migrações já aplicadas pode quebrar instalações e não faz parte desta limpeza.
- Validações apenas parecidas não foram fundidas. Por exemplo, os parâmetros locais do login diário não têm a mesma semântica estrita de `systemParamsSchema`.
- Não foram acrescentadas bibliotecas, camadas genéricas de repositório ou reformulações da interface.
- Os testes permanecem no repositório para detectar regressões em mudanças futuras. Relatórios e logs temporários de execução são descartáveis.
- `docs/superpowers/plans/2026-11-18-organizacao-codigo.md` registra o plano local e seu checklist. Essa pasta já é ignorada pelo Git; este guia em `docs/organizacao-codigo.md` é a documentação entregável.

## Verificação

| Verificação | Resultado |
| --- | --- |
| Backend: `npm test --workspace @rpg/backend` com relatório JSON | **298 testes aprovados em 23 arquivos; zero falhas.** Inclui os 295 testes existentes e os três cenários novos de estado da conta. |
| Frontend: `npm test --workspace @rpg/frontend -- test/api-request.test.ts test/lobby-stats.test.ts test/ui-render.test.ts test/system-cover-storage.test.ts --reporter=dot` | **25 testes aprovados em quatro arquivos; zero falhas.** |
| Integração das rotas Next: `test/next-routes.test.ts`, executado junto à seleção inicial do frontend | **Três testes aprovados**, cobrindo saúde pública e encaminhamento autenticado da API. |
| `npm run typecheck --workspace @rpg/backend` | Aprovado. |
| `npm run typecheck --workspace @rpg/frontend` | Aprovado, incluindo geração de tipos de rotas. |
| `npm exec --workspace @rpg/frontend -- tsc --noEmit` | Aprovado novamente após restaurar `next-env.d.ts` ao conteúdo original. |
| `git diff --check` | Aprovado, sem erros de whitespace. |
| Revisão independente do diff | Sem achados acionáveis de regressão. |

A revisão verificou validação estrita, autenticação, reutilização dos schemas, métodos/corpos JSON, erros, seleção de datas e interesses. Não foram executados build de produção, testes SQL ou acesso a serviços reais. O banco e suas migrações não foram alterados. Os relatórios JSON e logs locais usados na conferência foram removidos da entrega.
