# Aplicação RPG

O projeto é composto por dois serviços Vercel no mesmo domínio: `frontend/` usa Next.js e `backend/` usa Fastify. A UI chama `/api/...` na mesma origem; as regras de roteamento da Vercel encaminham `/api/*` e `/healthz` diretamente ao backend. As rotas da API exigem bearer token.

## Desenvolvimento local

Na raiz do repositório, instale os workspaces e configure o Supabase:

```powershell
npm ci
Copy-Item frontend/.env.example frontend/.env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `frontend/.env.local`. No deploy, o Next também aceita os nomes já usados no projeto Vercel (`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`) e os expõe no bundle como configuração pública. Use apenas a chave publishable/anon; nunca inclua uma service-role ou chave secreta nessas variáveis.

Instale/tenha o Vercel CLI disponível e inicie os serviços juntos:

```powershell
npx vercel dev -L
```

O CLI inicia ambos os serviços. Acesse `http://localhost:3000`. `/healthz` e `/api/...` são encaminhados ao backend, então o indicador verifica o serviço real. Cadastro, login e recuperação chamam Supabase Auth diretamente do navegador; o token fica apenas em memória e é perdido ao atualizar a página. Os fluxos usam a origem atual como URL de retorno. Adicione `http://localhost:3000` às URLs permitidas de redirecionamento do Supabase Auth e, se usar Supabase local, à configuração correspondente em `supabase/config.toml`.

## Vercel Services

O arquivo `../vercel.json` define `backend` como Fastify e `frontend` como Next.js. Na configuração do projeto Vercel, selecione o framework **Services**. Os rewrites enviam `/api/*` e `/healthz` ao backend e o restante ao frontend. A API mantém autenticação bearer em todas as rotas privadas.

Configure a URL do projeto Supabase e a chave publishable nos ambientes Production, Preview e Development do projeto Vercel. São aceitos os nomes `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e os nomes existentes `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. O domínio de produção e os domínios Preview usados nos fluxos de confirmação e recuperação também precisam estar permitidos no Supabase Auth.

TypeScript está fixado em 5.9.3 nos dois serviços porque o builder Fastify da Vercel ainda usa `ts.sys`, que não existe no pacote raiz do TypeScript 7. Atualize esse pin quando o builder oferecer compatibilidade; a falha está registrada na [issue da Vercel](https://github.com/vercel/vercel/issues/17390).

Vercel Services é uma funcionalidade Beta; o projeto precisa ter acesso habilitado. Consulte a [documentação de Vercel Services](https://vercel.com/docs/services).

## Login diário

Ao selecionar um sistema no dashboard, um pop-up centralizado oferece a recompensa desse sistema. A exibição automática é registrada por conta e sistema no banco, uma vez por dia no fuso configurado no sistema, inclusive entre dispositivos. Entrar em outro sistema permite uma exibição independente. Fechar o pop-up não resgata itens e não permite nova abertura automática para o mesmo sistema naquele dia. Sem recompensa disponível para um personagem próprio, o pop-up não abre nem consome a exibição. A mudança requer as migrations `008_daily_login_popup.sql` e `010_daily_login_popup_per_system.sql`; o teste da separação por sistema está em `supabase/tests/010_daily_login_popup_per_system.test.sql`.

Na área autenticada, a pessoa escolhe um sistema ativo e um personagem próprio para resgatar o item do dia. O calendário é independente por sistema, usa segunda a domingo e considera o fuso configurado no sistema (padrão `America/Sao_Paulo`). Há um resgate por conta, por sistema, por data local; dias não resgatados expiram. O owner do sistema configura no painel os sete itens já cadastrados e suas quantidades.
