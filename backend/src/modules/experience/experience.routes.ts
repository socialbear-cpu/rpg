import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/authenticate.js';
import {
  readCharacterExperience,
  readOwnerExperienceSettings,
  saveOwnerExperienceSettings,
} from './experience.repository.js';
import {
  characterExperienceSummaryResponseSchema,
  experienceSettingsInputOpenApiSchema,
  experienceSettingsInputSchema,
  experienceSettingsResponseSchema,
} from './experience.schema.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};
const systemParamsSchema = z.strictObject({ systemId: z.uuid() });
const characterParamsSchema = z.strictObject({ characterId: z.uuid() });

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access character experience' });
}

function systemIdFromParams(params: unknown) {
  const result = systemParamsSchema.safeParse(params);
  return result.success ? result.data.systemId : null;
}

function characterIdFromParams(params: unknown) {
  const result = characterParamsSchema.safeParse(params);
  return result.success ? result.data.characterId : null;
}

export async function experienceRoutes(app: FastifyInstance) {
  app.get('/api/v1/owner/game-systems/:systemId/xp', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read XP rules for your game system',
      response: {
        200: experienceSettingsResponseSchema,
        400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const result = await readOwnerExperienceSettings(request.supabase!, systemId);
      if ('status' in result && result.status === 'not_owner') {
        return reply.code(403).send({ error: 'Only this system’s owner can read its XP settings.' });
      }
      if (!result) return reply.code(404).send({ error: 'Game system not found' });
      return reply.send(result);
    } catch {
      return databaseError(reply);
    }
  });

  app.put('/api/v1/owner/game-systems/:systemId/xp', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Update XP rules for your game system',
      response: {
        200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'updated' } } },
        400: errorSchema, 401: errorSchema, 403: errorSchema, 500: errorSchema,
      },
    },
    config: {
      // Keep strict Zod validation authoritative rather than letting AJV remove unknown keys.
      swaggerTransform: ({ schema, url }) => ({ url, schema: { ...schema, body: experienceSettingsInputOpenApiSchema } }),
    },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    const parsed = experienceSettingsInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid XP settings' });
    try {
      const result = await saveOwnerExperienceSettings(request.supabase!, systemId, parsed.data);
      switch (result.status) {
        case 'updated': return reply.send(result);
        case 'not_owner': return reply.code(403).send({ error: 'Only this system’s owner can change its XP settings.' });
        case 'invalid_settings': return reply.code(400).send({ error: 'Invalid XP settings' });
        case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
        default: return databaseError(reply);
      }
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/me/characters/:characterId/xp', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read XP and level for one of your characters',
      response: {
        200: characterExperienceSummaryResponseSchema,
        400: errorSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const characterId = characterIdFromParams(request.params);
    if (!characterId) return reply.code(400).send({ error: 'Invalid character ID' });
    try {
      const summary = await readCharacterExperience(request.supabase!, characterId);
      if (!summary) return reply.code(404).send({ error: 'Character experience not found' });
      return reply.send(summary);
    } catch {
      return databaseError(reply);
    }
  });
}
