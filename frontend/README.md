# Aplicação RPG

O projeto é composto por dois serviços Vercel no mesmo domínio: `frontend/` usa Next.js e `backend/` usa Fastify. A UI chama `/api/v1/me/profile` na mesma origem; o Route Handler do Next encaminha a chamada ao backend privado usando o binding `BACKEND_URL`.

## Desenvolvimento local

Na raiz do repositório, instale os workspaces e configure o Supabase:

```powershell
npm ci
Copy-Item frontend/.env.example frontend/.env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `frontend/.env.local`. Use apenas a chave publishable/anon; nunca inclua uma service-role ou chave secreta no frontend.

Instale/tenha o Vercel CLI disponível e inicie os serviços juntos:

```powershell
npx vercel dev -L
```

O CLI inicia ambos os serviços e injeta o binding local. Acesse `http://localhost:3000`. `/healthz` é servido pelo frontend; `/api/v1/me/profile` é encaminhado ao backend. Os fluxos de cadastro e recuperação usam a origem atual como URL de retorno. Adicione `http://localhost:3000` às URLs permitidas de redirecionamento do Supabase Auth e, se usar Supabase local, à configuração correspondente em `supabase/config.toml`.

## Vercel Services

O arquivo `../vercel.json` define `backend` como Fastify e `frontend` como Next.js. Na configuração do projeto Vercel, selecione o framework **Services**. Os rewrites públicos enviam todo o tráfego ao frontend; o frontend acessa o backend exclusivamente pelo binding `BACKEND_URL`, então o backend não recebe tráfego público direto.

Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nos ambientes Production, Preview e Development do projeto. O domínio de produção e os domínios Preview usados nos fluxos de confirmação e recuperação também precisam estar permitidos no Supabase Auth.

Vercel Services é uma funcionalidade Beta; o projeto precisa ter acesso habilitado. Consulte a [documentação de Vercel Services](https://vercel.com/docs/services).
