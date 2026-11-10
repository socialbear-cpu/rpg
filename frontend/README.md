# Aplicação RPG

Aplicação web em Next.js e TypeScript. A interface e a API rodam na mesma origem; `backend/` fornece os módulos de autenticação, validação e acesso ao perfil usados pelos Route Handlers.

## Desenvolvimento local

Na raiz do repositório, instale os workspaces e crie a configuração local:

```powershell
npm ci
Copy-Item frontend/.env.example frontend/.env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `frontend/.env.local`. Use apenas a chave publishable/anon. Essas variáveis são públicas e entram no bundle do navegador; nunca use uma service-role ou chave secreta.

Inicie a aplicação a partir da raiz:

```powershell
npm run dev
```

Acesse `http://localhost:3000`. Os Route Handlers estão em `/healthz` e `/api/v1/me/profile`; a interface os chama na mesma origem. Os fluxos de cadastro e recuperação usam a origem atual como URL de retorno. Adicione `http://localhost:3000` às URLs permitidas de redirecionamento do Supabase Auth e, se usar o Supabase local, à configuração correspondente em `supabase/config.toml`.

A sessão continua em memória nesta interface de validação. Atualizar a página encerra a sessão; tokens não são renovados automaticamente.

## Deploy único na Vercel

Use um único projeto Vercel vinculado ao repositório, com **Root Directory** `frontend` e Node.js 24 ou superior. Habilite **Include source files outside of the Root Directory in the Build Step** para incluir o workspace `backend/`. Mantenha a instalação padrão com o lockfile da raiz; `frontend/next.config.ts` configura o rastreamento do workspace compartilhado. O comando de build do pacote executa primeiro a compilação de `backend/` e depois `next build`.

Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nos ambientes Production e Preview. Não há rewrites para outro projeto Vercel. O domínio de produção e os domínios Preview usados para confirmar cadastro e recuperar senha também precisam estar permitidos no Supabase Auth.

Verificação local, a partir da raiz:

```powershell
npm test
npm run typecheck
npm run build
```
