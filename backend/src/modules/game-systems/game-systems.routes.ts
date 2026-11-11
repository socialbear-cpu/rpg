import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/authenticate.js';
import {
  characterAttributesSchemaFor,
  createCharacterInputSchema,
  createSystemInputSchema,
} from './game-systems.schema.js';
import {
  createGameSystem,
  createSystemCharacter,
  listActiveGameSystems,
  listSystemCharacters,
  readActiveGameSystem,
  readGameSystemCharacterSheet,
} from './game-systems.repository.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};
const systemParamsSchema = z.strictObject({ systemId: z.uuid() });
const systemJsonSchema = {
  type: 'object', required: ['id', 'slug', 'name', 'description'], additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' }, slug: { type: 'string' }, name: { type: 'string' },
    description: { type: ['string', 'null'] },
  },
} as const;
const fieldJsonSchema = {
  type: 'object', required: ['key', 'label', 'type', 'required', 'position', 'show_on_card'], additionalProperties: false,
  properties: {
    key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' }, label: { type: 'string', minLength: 1, maxLength: 80 },
    type: { type: 'string', enum: ['short_text', 'long_text', 'number', 'single_select'] },
    required: { type: 'boolean' }, position: { type: 'integer', minimum: 0, maximum: 49 },
    show_on_card: { type: 'boolean' }, options: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 80 } },
  },
} as const;
const characterJsonSchema = {
  type: 'object', required: ['id', 'game_system_id', 'character_name', 'attributes', 'status'], additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' }, game_system_id: { type: 'string', format: 'uuid' },
    character_name: { type: 'string' }, attributes: { type: 'object', additionalProperties: true }, status: { const: 'active' },
  },
} as const;

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access game systems or characters' });
}

function systemIdFromParams(params: unknown) {
  const result = systemParamsSchema.safeParse(params);
  return result.success ? result.data.systemId : null;
}

export async function gameSystemsRoutes(app: FastifyInstance) {
  app.get('/api/v1/game-systems', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'List active game systems available to the authenticated user',
      response: {
        200: { type: 'object', required: ['systems'], additionalProperties: false, properties: { systems: { type: 'array', items: systemJsonSchema } } },
        401: errorSchema, 500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return reply.send(await listActiveGameSystems(request.supabase!));
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/game-systems', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Create a game system and its character sheet',
      response: {
        201: { type: 'object', required: ['system', 'fields'], additionalProperties: false, properties: { system: systemJsonSchema, fields: { type: 'array', items: fieldJsonSchema } } },
        400: errorSchema, 401: errorSchema, 500: errorSchema,
      },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', required: ['name', 'fields'], additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            description: { type: ['string', 'null'], maxLength: 500 },
            fields: { type: 'array', maxItems: 50, items: fieldJsonSchema },
          },
        },
      } }),
    },
  }, async (request, reply) => {
    const input = createSystemInputSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid game system or character sheet' });
    try {
      return reply.code(201).send(await createGameSystem(request.supabase!, input.data));
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/game-systems/:systemId/character-sheet', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read the character sheet definition for an active game system',
      response: {
        200: { type: 'object', required: ['game_system_id', 'fields'], additionalProperties: false, properties: { game_system_id: { type: 'string', format: 'uuid' }, fields: { type: 'array', items: fieldJsonSchema } } },
        400: errorSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      if (!await readActiveGameSystem(request.supabase!, systemId)) return reply.code(404).send({ error: 'Game system not found' });
      const sheet = await readGameSystemCharacterSheet(request.supabase!, systemId);
      if (!sheet) return reply.code(404).send({ error: 'Game system character sheet not found' });
      return reply.send(sheet);
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/game-systems/:systemId/characters', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'List your active characters in an active game system',
      response: {
        200: { type: 'object', required: ['characters'], additionalProperties: false, properties: { characters: { type: 'array', items: characterJsonSchema } } },
        400: errorSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      if (!await readActiveGameSystem(request.supabase!, systemId)) return reply.code(404).send({ error: 'Game system not found' });
      return reply.send(await listSystemCharacters(request.supabase!, request.userId!, systemId));
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/game-systems/:systemId/characters', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Create your character from the selected system sheet',
      response: {
        201: { type: 'object', required: ['character'], additionalProperties: false, properties: { character: characterJsonSchema } },
        400: errorSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema,
      },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', required: ['character_name', 'attributes'], additionalProperties: false,
          properties: { character_name: { type: 'string', minLength: 1, maxLength: 80 }, attributes: { type: 'object', additionalProperties: true } },
        },
      } }),
    },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    const input = createCharacterInputSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid character' });

    try {
      if (!await readActiveGameSystem(request.supabase!, systemId)) return reply.code(404).send({ error: 'Game system not found' });
      const sheet = await readGameSystemCharacterSheet(request.supabase!, systemId);
      if (!sheet) return reply.code(404).send({ error: 'Game system character sheet not found' });
      const attributes = characterAttributesSchemaFor(sheet.fields).safeParse(input.data.attributes);
      if (!attributes.success) return reply.code(400).send({ error: 'Invalid character attributes' });
      const result = await createSystemCharacter(request.supabase!, request.userId!, systemId, {
        ...input.data,
        attributes: attributes.data,
      });
      return reply.code(201).send(result);
    } catch {
      return databaseError(reply);
    }
  });
}
