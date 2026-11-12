# API Fastify RPG

Este workspace TypeScript contém a API Fastify. Em produção, as rotas Node.js do Next.js em `frontend/` invocam a aplicação por `app.inject` no mesmo deploy; `src/server.ts` inicia o listener para desenvolvimento direto do backend. A API atende `/api/*` e `/healthz`; todas as rotas privadas exigem bearer token validado pelo Supabase Auth. Senhas não são armazenadas nas tabelas da aplicação.

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

Inicie a aplicação a partir da raiz:

```powershell
npx vercel dev -L
```

O CLI executa a aplicação em um único serviço Next.js. `/healthz` e as operações de API chegam ao Fastify pelo handler local e exigem uma URL e chave publishable válidas quando a operação usa Supabase.

## Database migrations and tests

The numbered files in `database/migrations/` are the canonical schema history (001–018). The timestamped files in `supabase/migrations/` mirror that history for the Supabase CLI. Apply one sequence only, in order, and never reapply it to an already migrated database. Migration 003 requires existing `public.users.id` values to match `auth.users`; reconcile existing accounts before applying it.

The database includes system membership and RLS, daily login, character experience and trading, system-specific character sheets, and the system store. `database/README.md` describes the migration and schema layout. Review the target database's migration history before applying pending changes; migrations update schema and database functions.

The SQL integration suite lives in `supabase/tests/`. It requires a PostgreSQL database with the repository migrations applied. These database tests are separate from the focused backend and frontend test suites; passing application tests does not verify PostgreSQL functions, RLS, or transaction behavior.

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

## Daily login rewards

All routes require the same Supabase bearer token. The database derives the account from that token, enforces one claim per system and local date, checks that the selected active character belongs to the account and system, and adds the configured item to inventory atomically.

| Operation | Purpose |
| --- | --- |
| `GET /api/v1/me/daily-login/systems` | List active systems with a configured daily reward calendar. |
| `GET /api/v1/game-systems/:systemId/daily-login/rewards` | Read today's reward and this account's claim status. |
| `POST /api/v1/game-systems/:systemId/daily-login/claims` | Claim today's reward for `{ "character_id": "..." }`. |
| `GET /api/v1/owner/game-systems/:systemId/daily-login/rewards` | Owner-only calendar and same-system item catalog. |
| `PUT /api/v1/owner/game-systems/:systemId/daily-login/rewards` | Owner-only replacement of all seven entries and enabled state. |

The owner endpoint accepts seven unique ISO weekdays (Monday=1 to Sunday=7), each with one existing item and a positive quantity. Non-owners cannot view the owner catalog or save the schedule. A missed weekday's reward expires and does not accumulate.

## Notifications

All notification routes require the Supabase bearer token. The authenticated account is the notification recipient; do not pass a user ID to select another account.

| Operation | Purpose |
| --- | --- |
| `GET /api/v1/me/notifications?limit=20&offset=0` | List the newest notifications and unread count. `limit` defaults to 20 (maximum 50); `offset` defaults to 0. |
| `PATCH /api/v1/me/notifications/:notificationId/read` | Mark one of your notifications as read. Repeating the request is safe. |
| `POST /api/v1/game-systems/:systemId/announcements` | Publish `{ "title": "...", "body": "..." }` to current members. Only an Owner or Mod in that system can publish. |

The dashboard refreshes the feed when the panel opens and can load older pages. The API and app are not subscribed to Realtime in this first version.

The list response contains `notifications`, `unread_count`, `limit`, and `offset`. Each notification contains its ID, optional system ID, type, structured payload, creation time, and `read_at` (null while unread). Initial types are `system_role_changed` (`game_system_name`, `previous_role`, `new_role`) and `system_announcement` (`title`, `body`). Unknown types are shown as a generic notice so new notification types can be added without changing the inbox contract.

Announcement titles are trimmed and limited to 100 characters; bodies are trimmed and limited to 2000 characters. Content is plain text. Role changes create a notice for the affected member only when the role actually changes. Announcements are delivered separately to every system member at publication time, including the publisher.

An unknown notification ID and an ID owned by someone else both return `404 { "error": "Notification not found" }`. Invalid announcement content returns 400, a caller without Owner/Mod membership receives 403, and database failures return 500 without exposing database details. The Next.js API route invokes Fastify locally for GET, PATCH, POST, and PUT requests. RLS restricts feed reads to the recipient; creation and read-state changes go through validated RPCs.

## Backend verification

Run from the repository root:

```powershell
npm test
npm run typecheck
npm run build
```

These commands require no running Supabase stack. Route tests exercise the Next.js handlers and Supabase/auth/repository modules with external HTTP replaced. They do not prove Postgres RLS. Database verification remains deferred as stated above.
