# Cadastro, login e linguagem da aplicação

## Decisão recomendada

Adotar **TypeScript** para a aplicação. O repositório hoje contém apenas o esquema PostgreSQL e migrações, sem uma aplicação existente que imponha outra linguagem. TypeScript é uma boa escolha para uma aplicação web de RPG porque permite compartilhar tipos e validações entre interface e servidor, tem ampla oferta de bibliotecas e se integra diretamente ao Supabase.

Ponto de partida sugerido:

- **Interface web:** Next.js com TypeScript.
- **Identidade e sessões:** Supabase Auth.
- **Dados:** PostgreSQL no Supabase.
- **Validação:** Zod ou validação equivalente no servidor e na interface.
- **Aplicativo móvel futuro:** Expo/React Native também com TypeScript, reutilizando tipos e regras de domínio quando fizer sentido.

Esta decisão pressupõe que o primeiro cliente será web. Se o produto for exclusivamente mobile, Expo/React Native pode ser a primeira camada de interface, mantendo TypeScript, Supabase Auth e PostgreSQL.

## Responsabilidades

- **Supabase Auth** é dono de credenciais, sessões, confirmação de e-mail e recuperação de senha. Senhas nunca devem ir para tabelas da aplicação.
- **`public.users`** é um espelho mínimo de `auth.users`, identificado pelo mesmo UUID. Deve guardar apenas dados necessários à aplicação, como e-mail, sem senha.
- **`public.user_profiles`** guarda dados de perfil editáveis, como nome de exibição, avatar e biografia.
- **Aplicação** conduz os formulários e apresenta erros amigáveis; autorização e validação também devem ser aplicadas no servidor e no banco.
- **Row Level Security (RLS)** limita cada usuário às próprias informações. Antes de expor tabelas pela Data API, criar e revisar políticas para cada tabela.

A migração `003_supabase_auth.sql` já implementa a ligação entre `auth.users`, `public.users` e `user_profiles`, além de remover `password_hash`. A migração inicial ainda define o campo de senha, então novas instalações devem aplicar as migrações numeradas em ordem e a aplicação deve seguir o modelo da migração 003.

## Fluxo de cadastro

1. Formulário solicita e-mail, senha e nome de exibição; aceite dos termos pode ser incluído quando houver política publicada.
2. Validar formato do e-mail, tamanho mínimo da senha e limites de campos no cliente para feedback rápido e repetir validação no servidor.
3. Criar a conta com Supabase Auth, enviando o nome como metadado (`display_name`).
4. Exigir confirmação por e-mail, conforme a configuração do projeto Supabase.
5. O trigger da migração 003 sincroniza o usuário e cria o perfil. Não inserir essas linhas manualmente no fluxo normal.
6. Após confirmação, encaminhar para completar o perfil ou para a área inicial.

## Fluxo de login e conta

- **Login:** e-mail e senha via Supabase Auth. Mensagens de erro não devem revelar se um e-mail específico está cadastrado.
- **Persistência:** usar a sessão gerenciada pela integração oficial de Supabase adequada ao Next.js; proteger páginas no servidor e validar a sessão em operações privilegiadas.
- **Logout:** encerrar a sessão Supabase e redirecionar para a página pública.
- **Esqueci minha senha:** solicitar e-mail via fluxo de recuperação do Supabase; permitir definir senha nova apenas pelo link/token válido.
- **E-mail não confirmado:** oferecer reenvio de confirmação sem criar contas duplicadas.
- **Perfil:** editar `display_name`, `avatar_url` e `bio` em `user_profiles`, com política RLS que permita ao usuário alterar somente a própria linha.

## Limites de segurança

- Nunca armazenar senha em `public.users`, `user_profiles`, logs ou metadados.
- Nunca expor a chave `service_role` no navegador. Operações administrativas ficam no servidor.
- Aplicar RLS às tabelas acessíveis pelo cliente. O README do banco registra que as políticas para personagens, campanhas, loja e chat ainda não foram definidas.
- Não confiar em campos enviados pelo formulário para definir `user_id`, papel, saldo ou permissões; obter a identidade da sessão validada.
- Aplicar limitação de tentativas e usar mensagens neutras para reduzir abuso e enumeração de contas.

## Sequência de implementação

1. Configurar projeto Supabase, URLs de retorno, SMTP e confirmação de e-mail.
2. Aplicar as migrações na ordem documentada e conferir o requisito de correspondência de IDs da migração 003 caso já existam usuários.
3. Criar a aplicação Next.js em TypeScript e configurar cliente Supabase para navegador e servidor.
4. Implementar cadastro, confirmação, login, logout e recuperação de senha.
5. Definir e aplicar políticas RLS para perfil e, antes de cada nova funcionalidade, para suas tabelas.
6. Adicionar telas de estado: carregamento, e-mail pendente, sessão expirada e erro recuperável.

## Fora do escopo inicial

Login social, autenticação multifator, papéis administrativos e permissões de mestre/jogador podem ser adicionados quando as regras do produto estiverem definidas. Não usar um campo de perfil editável como fonte de autorização.
