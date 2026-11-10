# RPG backend

Fastify API on Node.js 24+ with TypeScript. Supabase Auth owns accounts and sessions; this service exposes the authenticated user's profile. Passwords are never stored in application tables.

## Local configuration and development

From `backend/`, install the locked dependencies and create the ignored local environment file (PowerShell):

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` with these values:

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` | Required HTTP(S) Supabase API URL; local default `http://127.0.0.1:54321`. |
| `SUPABASE_PUBLISHABLE_KEY` | Required nonempty publishable key for that project. Replace the template placeholder. Never use a service-role or secret key. |
| `PORT` | Integer 1–65535; defaults to `3000`. |
| `NODE_ENV` | `development`, `test`, or `production`; defaults to `development`. |

Run from `backend/`:

```powershell
npm run dev
```

The development command loads `.env` and starts TypeScript directly; it does not enable file watching. Visit [health](http://localhost:3000/healthz), [Swagger UI](http://localhost:3000/docs/), or [OpenAPI JSON](http://localhost:3000/docs/json). Docs routes are registered only in development. `/healthz` checks the API process, not database readiness. Server startup requires valid configuration even though the health handler itself does not use Supabase.

For a compiled server, run from `backend/`:

```powershell
npm run build
node --env-file=.env dist/server.js
```

`npm start` runs `node dist/server.js` and expects the environment to have already been supplied by the process manager or shell; it does not load `.env`.

## Local database setup (runtime verification pending)

**Task 3 database runtime tests were explicitly deferred.** The commands below are the future local setup procedure, not evidence that migrations, Auth provisioning, grants, or RLS have passed. No hosted database changes are part of this work.

Prerequisites: a working Docker engine, Supabase CLI, and PostgreSQL `psql` on PATH. Run these commands from the repository root, one at a time, stopping on any nonzero exit. The project already contains `supabase/config.toml`; do not initialize it again.

```powershell
supabase --help
supabase start --help
supabase status --help
supabase test db --help
supabase start
supabase status
```

Use the local publishable key reported by your local stack for `backend/.env`. If the installed CLI only reports legacy keys, its `anon` key is the compatibility fallback for this variable; never copy the service-role key. Keep local credentials out of commits and logs shared publicly. The CLI reports the local connection details; see the [CLI reference](https://supabase.com/docs/reference/cli/introduction).

On a fresh local database, apply the canonical SQL files in order. The following URL is the default local database from this repository's port configuration; adjust it only if your local configuration differs:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/002_character_fields.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/003_supabase_auth.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database/migrations/004_profile_rls.sql
supabase test db
```

These files live in `database/migrations/`, not the CLI's `supabase/migrations/` directory; `supabase start` alone does not apply them. Do not rerun them on an already migrated database. Migration 003 requires any existing `public.users.id` to match an Auth user; map existing accounts before attempting it. Migration 003 installs the Auth trigger and backfills profiles; migration 004 restricts profile access to the owner, with updates limited to the three editable columns. Broader game-domain tables still need their own authorization work before exposure.

The pgTAP suite is `supabase/tests/004_profile_rls.test.sql`. Backend tests use an HTTP fixture and cannot establish database policy or trigger correctness. Running the local database suite remains required before deployment.

## Client account flow

Create a Supabase JavaScript client in the client application using its project URL and publishable key. Account operations go directly through Supabase Auth; this backend has no registration, login, logout, or recovery routes.

1. Register with `supabase.auth.signUp({ email, password, options: { data: { display_name } } })`. Local `supabase/config.toml` enables email confirmation: complete the confirmation email flow before expecting an authenticated session. Use the local mail inbox URL reported by the stack during development. Profile creation belongs to the Auth database trigger, not a client insert. See [signUp](https://supabase.com/docs/reference/javascript/auth-signup).
2. Sign in with `supabase.auth.signInWithPassword({ email, password })`. Check `error`, then use `data.session.access_token` for this API. The client SDK manages its session and token refresh; use the current access token for each request. See [signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
3. Sign out with `supabase.auth.signOut()` and stop sending the cleared session's token. See [signOut](https://supabase.com/docs/reference/javascript/auth-signout).
4. Request recovery with `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. Use an allowed client redirect URL, handle the recovery session, then call `supabase.auth.updateUser({ password: newPassword })`. The local allowed redirect is currently `http://localhost:3000`; change the local Auth configuration when your client runs elsewhere. See [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Handle every SDK error before advancing the flow. Do not use user-editable metadata as an authorization claim. A browser client must use a same-origin reverse proxy for this API or explicitly configure CORS in a later change; this backend currently does not install a CORS plugin.

## Profile API contract

Send `Authorization: Bearer <Supabase access token>` to both operations. The backend verifies the token with Supabase Auth and forwards it to the Data API with the publishable key. Identity comes from the verified user; caller-supplied IDs, query parameters, and identity headers cannot select another profile. Swagger's Authorize dialog takes the access token without the `Bearer ` prefix.

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

Unknown fields, empty objects, nonobjects, and invalid values are rejected. Send `Content-Type: application/json`. The following client fragment reads and updates an existing signed-in session's profile; `accessToken` is its current access token and `apiBase` is your API origin:

```javascript
const headers = { Authorization: `Bearer ${accessToken}` };
const profile = await fetch(`${apiBase}/api/v1/me/profile`, { headers });
if (!profile.ok) throw new Error(`Profile read failed: ${profile.status}`);
const currentProfile = await profile.json();

const updated = await fetch(`${apiBase}/api/v1/me/profile`, {
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

Malformed JSON, unsupported media types, and request-size limits use Fastify's own transport-level error responses and may have a different shape. Refresh or reauthenticate on an expired token; do not send a user ID to bypass a 401. If a profile is missing, investigate the Auth trigger/migrations rather than inserting it from the client.

## Backend verification

Run from `backend/`:

```powershell
npm test -- --run test/openapi.test.ts
npm test -- --run
npm run typecheck
npm run build
```

These commands require no running Supabase stack. Contract checks inspect the generated development OpenAPI JSON; route tests exercise the real Fastify/auth/repository code with external HTTP replaced. They do not prove Postgres RLS. Database verification remains deferred as stated above.
