import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createUserSupabaseClient } from './supabase.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
    supabase: SupabaseClient | null;
  }
}

// Use as a route preHandler; public routes do not install this guard.
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(request.headers.authorization ?? '');
  const accessToken = match?.[1];
  if (!accessToken) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const supabase = createUserSupabaseClient(accessToken);
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user?.id) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    request.userId = data.user.id;
    request.supabase = supabase;
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
