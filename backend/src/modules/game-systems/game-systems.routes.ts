import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/authenticate.js';
import {
  characterAttributesSchemaFor,
  createCharacterInputSchema,
  createSystemInputSchema,
  updateGameSystemInputSchema,
} from './game-systems.schema.js';
import {
  createGameSystem,
  createSystemCharacter,
  listActiveGameSystems,
  listSystemCharacters,
  readActiveGameSystem,
  readGameSystemCharacterSheet,
  updateGameSystem,
} from './game-systems.repository.js';
import { characterSheetDefinitionSchema } from './game-systems.schema.js';

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
const conditionGroupJsonSchema = {
  type: 'object', required: ['logic', 'rules'], additionalProperties: false,
  properties: {
    logic: { type: 'string', enum: ['all', 'any'] },
    rules: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object', required: ['component_key', 'operator'], additionalProperties: false,
      properties: {
        component_key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' },
        operator: { type: 'string', enum: ['equals', 'not_equals', 'contains', 'not_contains', 'is_filled', 'is_empty'] },
        value: { type: 'string', minLength: 1, maxLength: 80 },
      },
    } },
  },
} as const;
const optionJsonSchema = {
  type: 'object', required: ['label'], additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 80 }, value: { type: 'string', minLength: 1, maxLength: 80 },
    image_url: { type: 'string', maxLength: 2048 }, description: { type: 'string', maxLength: 500 },
    x: { type: 'number', minimum: 0, maximum: 100 }, y: { type: 'number', minimum: 0, maximum: 100 },
    width: { type: 'number', minimum: 1, maximum: 100 }, height: { type: 'number', minimum: 1, maximum: 100 },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
    condition: conditionGroupJsonSchema,
  },
} as const;
const componentJsonSchema = {
  type: 'object', required: ['key', 'label', 'required', 'position', 'width', 'show_on_card', 'type'], additionalProperties: false,
  properties: {
    key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' }, label: { type: 'string', minLength: 1, maxLength: 80 },
    required: { type: 'boolean' }, position: { type: 'integer', minimum: 0, maximum: 49 }, width: { type: 'string', enum: ['full', 'half', 'third'] },
    show_on_card: { type: 'boolean' }, type: { type: 'string', enum: ['short_text', 'long_text', 'number', 'single_select'] },
    presentation: { type: 'string', enum: ['select', 'cards', 'canvas'] }, selection_mode: { type: 'string', enum: ['single', 'multiple'] },
    condition: conditionGroupJsonSchema, options: { type: 'array', minItems: 1, maxItems: 50, items: optionJsonSchema },
  },
} as const;
const visualElementJsonSchema = {
  type: 'object', required: ['key', 'type', 'x', 'y', 'width', 'height', 'rotation'], additionalProperties: false,
  properties: {
    key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' },
    type: { type: 'string', enum: ['text', 'image'] },
    x: { type: 'number', minimum: 0, maximum: 100 }, y: { type: 'number', minimum: 0, maximum: 100 },
    width: { type: 'number', minimum: 1, maximum: 100 }, height: { type: 'number', minimum: 1, maximum: 100 },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
    text: { type: 'string', minLength: 1, maxLength: 500 },
    image_url: { type: 'string', maxLength: 2048 }, description: { type: 'string', maxLength: 500 },
  },
} as const;
const definitionJsonSchema = {
  type: 'object', required: ['version', 'steps'], additionalProperties: false,
  properties: { version: { const: 1 }, steps: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', required: ['key', 'label', 'position', 'components'], additionalProperties: false, properties: { key: { type: 'string' }, label: { type: 'string' }, position: { type: 'integer' }, components: { type: 'array', maxItems: 50, items: componentJsonSchema }, elements: { type: 'array', maxItems: 50, items: visualElementJsonSchema }, condition: conditionGroupJsonSchema } } } },
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
    } catch (error) {
      throw error;
    }
  });

  app.post('/api/v1/game-systems', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Create a game system and its character sheet',
      response: {
        201: { type: 'object', required: ['system', 'definition'], additionalProperties: false, properties: { system: systemJsonSchema, definition: definitionJsonSchema } },
        400: errorSchema, 401: errorSchema, 500: errorSchema,
      },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', required: ['name', 'definition'], additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            description: { type: ['string', 'null'], maxLength: 500 },
            definition: definitionJsonSchema,
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

  app.put('/api/v1/game-systems/:systemId', {
    ...authOptions,
    schema: { ...authOptions.schema, summary: 'Update an owned game system name and description', response: {
      200: { type: 'object', required: ['system'], additionalProperties: false, properties: { system: systemJsonSchema } },
      400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema,
    } },
    config: { swaggerTransform: ({ schema, url }) => ({ url, schema: { ...schema, body: {
      type: 'object', required: ['name', 'description'], additionalProperties: false,
      properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, description: { type: ['string', 'null'], maxLength: 500 } },
    } } }) },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    const input = updateGameSystemInputSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid game system details' });
    try {
      const system = await updateGameSystem(request.supabase!, systemId, input.data);
      if (!system) return reply.code(404).send({ error: 'Game system not found' });
      return reply.send({ system });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '42501') return reply.code(403).send({ error: 'Only the system owner can update its details' });
      return databaseError(reply);
    }
  });

  app.get('/api/v1/game-systems/:systemId/character-sheet', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read the character sheet definition for an active game system',
      response: {
        200: { type: 'object', required: ['game_system_id', 'definition'], additionalProperties: false, properties: { game_system_id: { type: 'string', format: 'uuid' }, definition: definitionJsonSchema } },
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

  app.put('/api/v1/game-systems/:systemId/character-sheet', {
    ...authOptions,
    schema: { ...authOptions.schema, summary: 'Update the character sheet definition for an owned game system', response: {
      200: { type: 'object', required: ['definition'], additionalProperties: false, properties: { definition: definitionJsonSchema } },
      400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema,
    } },
    config: { swaggerTransform: ({ schema, url }) => ({ url, schema: { ...schema, body: { type: 'object', required: ['definition'], additionalProperties: false, properties: { definition: definitionJsonSchema } } } }) },
  }, async (request, reply) => {
    const systemId = systemIdFromParams(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    const body = z.strictObject({ definition: characterSheetDefinitionSchema }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid character sheet definition' });
    try {
      const { data, error } = await request.supabase!.rpc('update_game_system_character_sheet', { p_system_id: systemId, p_definition: body.data.definition });
      if (error) {
        if (error.code === '42501') return reply.code(403).send({ error: 'Only the system owner can update its character sheet' });
        if (error.code === 'P0002') return reply.code(404).send({ error: 'Game system character sheet not found' });
        if (error.code === '22023') return reply.code(400).send({ error: 'Invalid character sheet definition' });
        return databaseError(reply);
      }
      const result = z.strictObject({ game_system_id: z.uuid(), definition: characterSheetDefinitionSchema }).safeParse(data);
      if (!result.success) return databaseError(reply);
      return reply.send({ definition: result.data.definition });
    } catch { return databaseError(reply); }
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
      const attributes = characterAttributesSchemaFor(sheet.definition).safeParse(input.data.attributes);
      if (!attributes.success) return reply.code(400).send({ error: 'Invalid character attributes' });
      const result = await createSystemCharacter(request.supabase!, request.userId!, systemId, {
        ...input.data,
        attributes: attributes.data,
      });
      return reply.code(201).send(result);
    } catch (error) {
      request.log.error(error);
      return databaseError(reply);
    }
  });
}
