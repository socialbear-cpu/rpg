import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { readProfile, updateProfile } from './profile.repository.js';
import { profilePatchSchema, profileResponseSchema, type Profile } from './profile.schema.js';

async function respondWithProfile(reply: FastifyReply, operation: () => Promise<Profile | null>) {
  try {
    const profile = await operation();
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });
    return reply.send(profile);
  } catch {
    return reply.code(500).send({ error: 'Unable to access profile' });
  }
}

export async function profileRoutes(app: FastifyInstance) {
  const errorSchema = {
    type: 'object', required: ['error'], additionalProperties: false,
    properties: { error: { type: 'string' } },
  } as const;
  const options = {
    preHandler: authenticate,
    schema: { response: {
      200: profileResponseSchema, 400: errorSchema, 401: errorSchema,
      404: errorSchema, 500: errorSchema,
    } },
  };
  app.get('/api/v1/me/profile', options, async (request, reply) => {
    return respondWithProfile(reply, () => readProfile(request.supabase!, request.userId!));
  });
  app.patch('/api/v1/me/profile', options, async (request, reply) => {
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid profile patch' });
    return respondWithProfile(reply, () => updateProfile(request.supabase!, request.userId!, parsed.data));
  });
}
