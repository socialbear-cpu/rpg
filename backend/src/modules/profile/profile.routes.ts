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
    schema: { security: [{ bearerAuth: [] }], response: {
      200: { ...profileResponseSchema, description: 'The authenticated user\'s public profile.' },
      401: { ...errorSchema, description: 'Missing, malformed, expired or invalid bearer access token.' },
      404: { ...errorSchema, description: 'Profile not found; this endpoint does not provision profiles.' },
      500: { ...errorSchema, description: 'Unable to access profile; database details are withheld.' },
    } },
  };
  app.get('/api/v1/me/profile', {
    ...options,
    schema: { ...options.schema, summary: 'Read your profile' },
  }, async (request, reply) => {
    return respondWithProfile(reply, () => readProfile(request.supabase!, request.userId!));
  });
  app.patch('/api/v1/me/profile', {
    ...options,
    schema: {
      ...options.schema,
      summary: 'Update your profile',
      description: 'Updates only the verified token owner. Omitted fields remain unchanged. Display names are trimmed before validation.',
      response: {
        ...options.schema.response,
        400: { ...errorSchema, description: 'Invalid profile patch: supply at least one supported field within its limits.' },
      },
    },
    config: {
      // Documentation only: keep Zod authoritative rather than letting AJV
      // coerce values or remove unknown fields before strict validation.
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: {
            display_name: { type: 'string', minLength: 1, description: 'Trimmed before checking the 1–80 character limit; whitespace-only names are invalid.' },
            avatar_url: { type: ['string', 'null'], maxLength: 2048, format: 'uri', pattern: '^[hH][tT][tT][pP][sS]?://', description: 'HTTP(S) URL, or null to clear.' },
            bio: { type: ['string', 'null'], maxLength: 500, description: 'Profile bio, or null to clear.' },
          },
        },
      } }),
    },
  }, async (request, reply) => {
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid profile patch' });
    return respondWithProfile(reply, () => updateProfile(request.supabase!, request.userId!, parsed.data));
  });
}
