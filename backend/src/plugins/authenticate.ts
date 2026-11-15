import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authenticateAccessToken, parseBearerToken } from '../authenticate-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
    supabase: SupabaseClient | null;
  }
}

async function authenticateRequest(request: FastifyRequest, reply: FastifyReply, allowInactive: boolean): Promise<void> {
  const accessToken = parseBearerToken(request.headers.authorization ?? null);
  if (!accessToken) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const context = await authenticateAccessToken(accessToken);
  if (!context) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  const { data: accountIsActive, error } = await context.supabase.rpc('get_my_account_status');
  if (error || typeof accountIsActive !== 'boolean') {
    reply.code(500).send({ error: 'Unable to verify account status' });
    return;
  }
  if (!accountIsActive && !allowInactive) {
    reply.code(403).send({ error: 'Account is deactivated' });
    return;
  }
  request.userId = context.userId;
  request.supabase = context.supabase;
}

// Use as route preHandlers; public routes do not install either guard.
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticateRequest(request, reply, false);
}

export async function authenticateAllowInactive(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticateRequest(request, reply, true);
}
