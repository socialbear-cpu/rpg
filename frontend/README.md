# Aplicação RPG

O projeto é composto por dois serviços Vercel no mesmo domínio: `frontend/` usa Next.js e `backend/` usa Fastify. A UI chama `/api/v1/me/profile` na mesma origem; o Route Handler do Next encaminha a chamada ao backend privado usando o binding `BACKEND_URL`.

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

O CLI inicia ambos os serviços e injeta o binding local. Acesse `http://localhost:3000`. `/healthz` e `/api/v1/me/profile` são encaminhados ao backend, então o indicador verifica o serviço real. Cadastro, login e recuperação chamam Supabase Auth diretamente do navegador; o token fica apenas em memória e é perdido ao atualizar a página. Os fluxos usam a origem atual como URL de retorno. Adicione `http://localhost:3000` às URLs permitidas de redirecionamento do Supabase Auth e, se usar Supabase local, à configuração correspondente em `supabase/config.toml`.

## Vercel Services

O arquivo `../vercel.json` define `backend` como Fastify e `frontend` como Next.js. Na configuração do projeto Vercel, selecione o framework **Services**. Os rewrites públicos enviam todo o tráfego ao frontend; o frontend acessa o backend exclusivamente pelo binding `BACKEND_URL`, então o backend não recebe tráfego público direto.

Configure a URL do projeto Supabase e a chave publishable nos ambientes Production, Preview e Development do projeto Vercel. São aceitos os nomes `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e os nomes existentes `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. O domínio de produção e os domínios Preview usados nos fluxos de confirmação e recuperação também precisam estar permitidos no Supabase Auth.

TypeScript está fixado em 5.9.3 nos dois serviços porque o builder Fastify da Vercel ainda usa `ts.sys`, que não existe no pacote raiz do TypeScript 7. Atualize esse pin quando o builder oferecer compatibilidade; a falha está registrada na [issue da Vercel](https://github.com/vercel/vercel/issues/17390).

Vercel Services é uma funcionalidade Beta; o projeto precisa ter acesso habilitado. Consulte a [documentação de Vercel Services](https://vercel.com/docs/services).

## Login diário

Na área autenticada, a pessoa escolhe um sistema ativo e um personagem próprio para resgatar o item do dia. O calendário é independente por sistema, usa segunda a domingo e considera o fuso configurado no sistema (padrão `America/Sao_Paulo`). Há um resgate por conta, por sistema, por data local; dias não resgatados expiram. O owner do sistema configura no painel os sete itens já cadastrados e suas quantidades.
