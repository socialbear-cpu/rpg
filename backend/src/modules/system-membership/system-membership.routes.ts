import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { readMySystemMemberships, searchSystemMembersByCharacterName, setSystemModerator } from './system-membership.repository.js';
import {
  memberSearchParamsSchema,
  memberSearchQuerySchema,
  membershipParamsSchema,
  moderatorAssignmentSchema,
  systemMemberSearchResponseSchema,
  systemMembershipsResponseSchema,
} from './system-membership.schema.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access system memberships' });
}

export async function systemMembershipRoutes(app: FastifyInstance) {
  app.get('/api/v1/owner/game-systems/:systemId/members/search', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Search system members by active character name',
      response: {
        200: { type: 'object', required: ['status', 'results'], additionalProperties: false, properties: {
          status: { const: 'ok' },
          results: { type: 'array', items: { type: 'object', required: ['user_id', 'character_name', 'display_name'], additionalProperties: false, properties: {
            user_id: { type: 'string', format: 'uuid' }, character_name: { type: 'string' }, display_name: { type: 'string' },
          } } },
        } },
        400: errorSchema, 401: errorSchema, 403: errorSchema, 500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const params = memberSearchParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid system ID' });
    const query = memberSearchQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Search with at least two characters' });
    try {
      const result = systemMemberSearchResponseSchema.safeParse(await searchSystemMembersByCharacterName(request.supabase!, params.data.systemId, query.data.query));
      if (!result.success) return databaseError(reply);
      if (result.data.status === 'unauthorized') return reply.code(401).send({ error: 'Unauthorized' });
      if (result.data.status === 'not_owner') return reply.code(403).send({ error: 'Only this system’s owner or a platform admin can search its members.' });
      return reply.send({ status: 'ok', results: result.data.results });
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/me/system-memberships', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read your system roles and global platform access',
      response: {
        200: {
          type: 'object', required: ['is_platform_admin', 'memberships'], additionalProperties: false,
          properties: {
            is_platform_admin: { type: 'boolean' },
            memberships: { type: 'array', items: {
              type: 'object', required: ['game_system_id', 'game_system_name', 'role'], additionalProperties: false,
              properties: {
                game_system_id: { type: 'string', format: 'uuid' },
                game_system_name: { type: 'string' },
                role: { type: 'string', enum: ['owner', 'mod', 'user'] },
              },
            } },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
  }, async (_request, reply) => {
    try {
      const result = systemMembershipsResponseSchema.safeParse(await readMySystemMemberships(_request.supabase!));
      if (!result.success) return databaseError(reply);
      return reply.send(result.data);
    } catch {
      return databaseError(reply);
    }
  });

  app.put('/api/v1/owner/game-systems/:systemId/members/:userId/moderator', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Grant or revoke the moderator role in your system',
      response: {
        200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'updated' } } },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', required: ['is_moderator'], additionalProperties: false,
          properties: { is_moderator: { type: 'boolean' } },
        },
      } }),
    },
  }, async (request, reply) => {
    const params = membershipParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid system or user ID' });
    const assignment = moderatorAssignmentSchema.safeParse(request.body);
    if (!assignment.success) return reply.code(400).send({ error: 'Invalid moderator assignment' });

    try {
      const result = await setSystemModerator(request.supabase!, params.data.systemId, params.data.userId, assignment.data);
      switch (result.status) {
        case 'updated': return reply.send(result);
        case 'not_owner': return reply.code(403).send({ error: 'Only this system’s owner or a platform admin can manage moderators.' });
        case 'invalid_member': return reply.code(404).send({ error: 'System member not found or cannot be changed.' });
        case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
        default: return databaseError(reply);
      }
    } catch {
      return databaseError(reply);
    }
  });
}
