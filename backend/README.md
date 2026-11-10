# API Fastify RPG

Este workspace TypeScript executa a API Fastify como serviço `backend` do projeto Vercel Services. O serviço Next.js encaminha `/api/...` para ele usando o binding privado `BACKEND_URL`; não há acesso público direto ao serviço. Supabase Auth é responsável pelas contas e sessões. Senhas não são armazenadas nas tabelas da aplicação.

## Local configuration and development

Na raiz do repositório, instale os workspaces e configure o Next.js (PowerShell):

```powershell
npm ci
Copy-Item frontend/.env.example frontend/.env.local
```

Preencha `frontend/.env.local` com estas variáveis públicas:

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase; para o stack local, `http://127.0.0.1:54321`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon do projeto. Nunca use uma service-role ou chave secreta. |

Inicie os dois serviços a partir da raiz:

```powershell
npx vercel dev -L
```

O CLI executa os serviços juntos e injeta os bindings locais. `/healthz` e as operações de perfil chegam a este Fastify pelo binding do frontend e exigem uma URL e chave publishable válidas.

## Local database setup (runtime verification pending)

**Task 3 database runtime tests were explicitly deferred.** The commands below are the future local setup procedure, not evidence that migrations, Auth provisioning, grants, or RLS have passed. No hosted database changes are part of this work.

Prerequisites: a working Docker engine, Node.js 20+, and PostgreSQL `psql` on PATH. The Supabase CLI is a repository-level development dependency. From the repository root, run `npm ci` once, then run these commands from the repository root, one at a time, stopping on any nonzero exit. The project already contains `supabase/config.toml`; do not initialize it again.

```powershell
npx supabase --help
npx supabase start --help
npx supabase status --help
npx supabase test db --help
npx supabase start
npx supabase status
```

Use a URL e chave publishable reportadas pelo stack local em `frontend/.env.local`. Se a CLI mostrar apenas chaves antigas, a chave `anon` é compatível; nunca copie a service-role. Mantenha configurações locais fora de commits e logs públicos. A CLI informa os detalhes da conexão; consulte a [referência da CLI](https://supabase.com/docs/reference/cli/introduction).

On a fresh local database, apply the canonical SQL files in order. The following URL is the default local database from this repository's port configuration; adjust it only if your local configuration differs:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/002_character_fields.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/003_supabase_auth.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/004_profile_rls.sql
npx supabase test db
```

These files live in `database/migrations/`, not the CLI's `supabase/migrations/` directory; `supabase start` alone does not apply them. Do not rerun them on an already migrated database. Migration 003 requires any existing `public.users.id` to match an Auth user; map existing accounts before attempting it. Migration 003 installs the Auth trigger and backfills profiles; migration 004 restricts profile access to the owner, with updates limited to the three editable columns. Broader game-domain tables still need their own authorization work before exposure.

The pgTAP suite is `supabase/tests/004_profile_rls.test.sql`. Backend tests use an HTTP fixture and cannot establish database policy or trigger correctness. Running the local database suite remains required before deployment.

## Conta e autenticação

O cadastro, o login, o logout e a recuperação são iniciados pelo navegador contra o Supabase Auth, em `frontend/src/supabase-auth.ts`. O Fastify não tem rotas de conta; ele valida o access token recebido e atende o perfil. A sessão atual fica em memória no módulo do cliente, sem persistência ou renovação automática; atualizar a página encerra a sessão. Use apenas a chave publishable no cliente. O token verificado é enviado ao Fastify para ler ou atualizar o perfil.

O callback de recuperação limpa os tokens da URL antes da atualização da senha. A origem atual precisa estar permitida no Supabase Auth. Não use metadados editáveis pelo usuário como identidade ou autorização.

## Profile API contract

Send `Authorization: Bearer <Supabase access token>` to both operations. The server verifies the token with Supabase Auth and forwards it to the Data API with the publishable key. Identity comes from the verified user; caller-supplied IDs, query parameters, and identity headers cannot select another profile.

| Operation | Result |
| --- | --- |
| `GET /healthz` | Public `200 { "status": "ok" }`. |
| `GET /api/v1/me/profile` | `200` with the four profile fields below. |
| `PATCH /api/v1/me/profile` | JSON object with at least one editable field; returns the updated four-field profile. |

Success example:

```json
{
  "user_id": "a72adcaf-9d23-46cc-b312-5fbe7fb6214b",
  "display_name": "Player",
  "avatar_url": null,
  "bio": null
}
```

PATCH allows only these fields; omitted fields remain unchanged:

| Field | Validation |
| --- | --- |
| `display_name` | String, trimmed first, 1–80 characters after trimming. Cannot be null or whitespace-only. |
| `avatar_url` | HTTP(S) URL up to 2048 characters, or `null` to clear. |
| `bio` | String up to 500 characters (empty allowed), or `null` to clear. |

Unknown fields, empty objects, nonobjects, and invalid values are rejected. Send `Content-Type: application/json`. The following client fragment reads and updates an existing signed-in session's profile; `accessToken` is its current access token. The API uses the same origin as the Next.js application:

```javascript
const headers = { Authorization: `Bearer ${accessToken}` };
const profile = await fetch('/api/v1/me/profile', { headers });
if (!profile.ok) throw new Error(`Profile read failed: ${profile.status}`);
const currentProfile = await profile.json();

const updated = await fetch('/api/v1/me/profile', {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ display_name: 'Player', bio: null }),
});
if (!updated.ok) throw new Error(`Profile update failed: ${updated.status}`);
const updatedProfile = await updated.json();
```

Application errors use `{ "error": "..." }`:

| Status | Meaning / body |
| --- | --- |
| `400` | Invalid PATCH payload: `{ "error": "Invalid profile patch" }`. |
| `401` | Missing, malformed, expired, or invalid bearer token: `{ "error": "Unauthorized" }`. |
| `404` | No profile row: `{ "error": "Profile not found" }`. No automatic provisioning or upsert occurs. |
| `500` | Database access failure: `{ "error": "Unable to access profile" }`; database details are withheld. |

Malformed JSON and invalid PATCH payloads return `400 { "error": "Invalid profile patch" }`; unsupported PATCH media types return 415. Refresh or reauthenticate on an expired token; do not send a user ID to bypass a 401. If a profile is missing, investigate the Auth trigger/migrations rather than inserting it from the client.

## Backend verification

Run from the repository root:

```powershell
npm test
npm run typecheck
npm run build
```

These commands require no running Supabase stack. Route tests exercise the Next.js handlers and Supabase/auth/repository modules with external HTTP replaced. They do not prove Postgres RLS. Database verification remains deferred as stated above.
