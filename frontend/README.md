# Aplicação RPG

O deploy usa um único serviço Next.js em `frontend/`. As rotas Node.js do Next invocam a aplicação Fastify de `backend/` localmente com `app.inject`, sem uma chamada entre serviços. As rotas privadas da API exigem bearer token.

## Desenvolvimento local

Na raiz do repositório, instale os workspaces e configure o Supabase:

```powershell
npm ci
Copy-Item frontend/.env.example frontend/.env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `frontend/.env.local`. No deploy, o Next também aceita os nomes já usados no projeto Vercel (`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`) e os expõe no bundle como configuração pública. Use apenas a chave publishable/anon; nunca inclua uma service-role ou chave secreta nessas variáveis.

Instale/tenha o Vercel CLI disponível e inicie a aplicação:

```powershell
npx vercel dev -L
```

O CLI inicia a aplicação. Acesse `http://localhost:3000`. `/healthz` e `/api/...` passam pelo handler Next.js e chegam à aplicação Fastify no mesmo processo. Cadastro, login e recuperação chamam Supabase Auth diretamente do navegador; o token fica apenas em memória e é perdido ao atualizar a página. Os fluxos usam a origem atual como URL de retorno. Adicione `http://localhost:3000` às URLs permitidas de redirecionamento do Supabase Auth e, se usar Supabase local, à configuração correspondente em `supabase/config.toml`.

## Vercel Services

O arquivo `../vercel.json` define um único serviço `frontend`, com framework Next.js, e encaminha as requisições para ele. A rota catch-all da API e `/healthz` chamam a instância Fastify localmente por `app.inject`. A API mantém autenticação bearer em todas as rotas privadas.

Configure a URL do projeto Supabase e a chave publishable nos ambientes Production, Preview e Development do projeto Vercel. São aceitos os nomes `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e os nomes existentes `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. O domínio de produção e os domínios Preview usados nos fluxos de confirmação e recuperação também precisam estar permitidos no Supabase Auth.

TypeScript está fixado em 5.9.3 no frontend.

## Login diário

Ao selecionar um sistema no dashboard, um pop-up centralizado oferece a recompensa desse sistema. A exibição automática é registrada por conta e sistema no banco, uma vez por dia no fuso configurado no sistema, inclusive entre dispositivos. Entrar em outro sistema permite uma exibição independente. Fechar o pop-up não resgata itens e não permite nova abertura automática para o mesmo sistema naquele dia. Sem recompensa disponível para um personagem próprio, o pop-up não abre nem consome a exibição. A mudança requer as migrations `008_daily_login_popup.sql` e `010_daily_login_popup_per_system.sql`; o teste da separação por sistema está em `supabase/tests/010_daily_login_popup_per_system.test.sql`.

Na área autenticada, a pessoa escolhe um sistema ativo e um personagem próprio para resgatar o item do dia. O calendário é independente por sistema, usa segunda a domingo e considera o fuso configurado no sistema (padrão `America/Sao_Paulo`). Há um resgate por conta, por sistema, por data local; dias não resgatados expiram. O owner do sistema configura no painel os sete itens já cadastrados e suas quantidades.
