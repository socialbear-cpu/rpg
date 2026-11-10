# Módulos compartilhados do backend RPG

Este workspace TypeScript contém a validação, autenticação de requisições e acesso ao perfil usados pelos Route Handlers em `frontend/app/api/`. A aplicação e a API são executadas juntas pelo Next.js; este pacote não precisa de um projeto Vercel ou servidor separado. Supabase Auth é responsável pelas contas e sessões. Senhas não são armazenadas nas tabelas da aplicação.

## Local configuration and development

Na raiz do repositório, instale os workspaces e crie a configuração local do Next.js (PowerShell):

```powershell
npm ci
Copy-Item frontend/.env.example frontend/.env.local
```

Preencha `frontend/.env.local` com estas variáveis públicas:

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase; para o stack local, `http://127.0.0.1:54321`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon do projeto. Nunca use uma service-role ou chave secreta. |

Inicie a aplicação a partir da raiz:

```powershell
npm run dev
```

O Next.js atende a interface e a API na origem `http://localhost:3000`. A rota `/healthz` verifica se a aplicação está ativa e não depende de credenciais Supabase. As operações de perfil exigem uma URL e chave publishable válidas.

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

## Client account flow

Create a Supabase JavaScript client in the client application using its project URL and publishable key. Account operations go directly through Supabase Auth; this backend has no registration, login, logout, or recovery routes.

1. Register with `supabase.auth.signUp({ email, password, options: { data: { display_name } } })`. Local `supabase/config.toml` enables email confirmation: complete the confirmation email flow before expecting an authenticated session. Use the local mail inbox URL reported by the stack during development. Profile creation belongs to the Auth database trigger, not a client insert. See [signUp](https://supabase.com/docs/reference/javascript/auth-signup).
2. Sign in with `supabase.auth.signInWithPassword({ email, password })`. Check `error`, then use `data.session.access_token` for this API. The client SDK manages its session and token refresh; use the current access token for each request. See [signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
3. Sign out with `supabase.auth.signOut()` and stop sending the cleared session's token. See [signOut](https://supabase.com/docs/reference/javascript/auth-signout).
4. Request recovery with `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. Use an allowed client redirect URL, handle the recovery session, then call `supabase.auth.updateUser({ password: newPassword })`. The local allowed redirect is currently `http://localhost:3000`; change the local Auth configuration when your client runs elsewhere. See [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Handle every SDK error before advancing the flow. Do not use user-editable metadata as an authorization claim. The Next.js application calls this API on the same origin.

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
