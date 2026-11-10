import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authenticateAccessToken, parseBearerToken } from '../authenticate-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
    supabase: SupabaseClient | null;
  }
}

// Use as a route preHandler; public routes do not install this guard.
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
  request.userId = context.userId;
  request.supabase = context.supabase;
}
