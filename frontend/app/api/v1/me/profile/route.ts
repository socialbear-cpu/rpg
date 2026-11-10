import { authenticateAccessToken, parseBearerToken, profilePatchSchema, readProfile, updateProfile } from '@rpg/backend';
import type { AuthenticatedRequestContext } from '@rpg/backend';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function authenticatedContext(request: Request) {
  const token = parseBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  return authenticateAccessToken(token);
}

async function withProfile(context: AuthenticatedRequestContext, operation: (userId: string, context: AuthenticatedRequestContext) => Promise<unknown>) {
  try {
    const profile = await operation(context.userId, context);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    return json(profile);
  } catch {
    return json({ error: 'Unable to access profile' }, 500);
  }
}

export function GET(request: Request) {
  return authenticatedContext(request).then((context) => context
    ? withProfile(context, (userId, auth) => readProfile(auth.supabase, userId))
    : json({ error: 'Unauthorized' }, 401));
}

export async function PATCH(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return json({ error: 'Unsupported Media Type' }, 415);

  const context = await authenticatedContext(request);
  if (!context) return json({ error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid profile patch' }, 400);
  }
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid profile patch' }, 400);

  return withProfile(context, (userId, auth) => updateProfile(auth.supabase, userId, parsed.data));
}
