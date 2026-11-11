import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import {
  claimDailyLoginReward,
  listMyDailyLoginSystems,
  readOwnerDailyLoginCalendar,
  readPlayerDailyLoginSystem,
  saveOwnerDailyLoginCalendar,
} from './daily-login.repository.js';
import { dailyLoginClaimSchema, dailyLoginScheduleSchema } from './daily-login.schema.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};
const claimOpenApiBody = {
  type: 'object', required: ['character_id'], additionalProperties: false,
  properties: { character_id: { type: 'string', format: 'uuid' } },
};
const scheduleOpenApiBody = {
  type: 'object', required: ['rewards', 'is_active'], additionalProperties: false,
  properties: {
    rewards: { type: 'array', minItems: 7, maxItems: 7, items: {
      type: 'object', required: ['weekday', 'item_id', 'quantity'], additionalProperties: false,
      properties: {
        weekday: { type: 'integer', minimum: 1, maximum: 7 },
        item_id: { type: 'string', format: 'uuid' },
        quantity: { type: 'integer', minimum: 1, maximum: 1000000 },
      },
    } },
    is_active: { type: 'boolean' },
  },
};

function getSystemId(params: unknown) {
  const systemId = (params as { systemId?: unknown } | null)?.systemId;
  return typeof systemId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(systemId)
    ? systemId
    : null;
}

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access daily login rewards' });
}

export async function dailyLoginRoutes(app: FastifyInstance) {
  app.post('/api/v1/game-systems/:systemId/daily-login/popup', authOptions, async (request, reply) => {
    const systemId = getSystemId(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const system = await readPlayerDailyLoginSystem(request.supabase!, request.userId!, systemId);
      if (!system || system.today?.status !== 'available') return reply.send({ show: false, systems: [] });
      const { data, error } = await request.supabase!.rpc('take_daily_login_popup', { p_game_system_id: systemId });
      if (error) return databaseError(reply);
      return reply.send({ show: data === true, systems: data === true ? [system] : [] });
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/me/daily-login/systems', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'List your daily login systems and current rewards',
      response: { 500: errorSchema },
    },
  }, async (request, reply) => {
    try {
      return reply.send(await listMyDailyLoginSystems(request.supabase!, request.userId!));
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/game-systems/:systemId/daily-login/rewards', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read today’s daily login reward for a system',
      response: { 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
  }, async (request, reply) => {
    const systemId = getSystemId(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const result = await readPlayerDailyLoginSystem(request.supabase!, request.userId!, systemId);
      if (!result) return reply.code(404).send({ error: 'Daily login system not found' });
      return reply.send(result);
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/game-systems/:systemId/daily-login/claims', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Claim today’s daily login reward',
      response: {
        201: {
          type: 'object', required: ['status', 'claim_id', 'game_system_id', 'character_id', 'item_id', 'item_name', 'quantity', 'weekday', 'local_claim_date', 'timezone', 'xp_awarded'],
          additionalProperties: false,
          properties: {
            status: { const: 'claimed' }, claim_id: { type: 'string', format: 'uuid' },
            game_system_id: { type: 'string', format: 'uuid' }, character_id: { type: 'string', format: 'uuid' },
            item_id: { type: 'string', format: 'uuid' }, item_name: { type: 'string' }, quantity: { type: 'integer', minimum: 1 },
            weekday: { type: 'integer', minimum: 1, maximum: 7 }, local_claim_date: { type: 'string', format: 'date' },
            timezone: { type: 'string' }, xp_awarded: { type: 'integer', minimum: 0 },
          },
        },
        400: errorSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema,
      },
    },
    config: {
      // Keep strict Zod parsing authoritative: Fastify's runtime AJV may
      // remove unknown body keys before the route can reject them.
      swaggerTransform: ({ schema, url }) => ({ url, schema: { ...schema, body: claimOpenApiBody } }),
    },
  }, async (request, reply) => {
    const systemId = getSystemId(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    const parsed = dailyLoginClaimSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid daily login claim' });
    try {
      const result = await claimDailyLoginReward(request.supabase!, systemId, parsed.data);
      switch (result.status) {
        case 'claimed': return reply.code(201).send(result);
        case 'already_claimed': return reply.code(409).send({ error: 'You have already claimed this system reward today.' });
        case 'invalid_character': return reply.code(400).send({ error: 'Choose an active character you own in this system.' });
        case 'calendar_unavailable': return reply.code(409).send({ error: 'The daily login calendar is not available today.' });
        case 'system_unavailable': return reply.code(404).send({ error: 'Daily login system not found' });
        case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
        default: return databaseError(reply);
      }
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/owner/game-systems/:systemId/daily-login/rewards', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read your system’s daily login calendar',
      response: { 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
  }, async (request, reply) => {
    const systemId = getSystemId(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const result = await readOwnerDailyLoginCalendar(request.supabase!, systemId);
      if (!result) return reply.code(404).send({ error: 'Owned game system not found' });
      return reply.send(result);
    } catch {
      return databaseError(reply);
    }
  });

  app.put('/api/v1/owner/game-systems/:systemId/daily-login/rewards', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Replace your system’s daily login calendar',
      response: { 200: { type: 'object', additionalProperties: true }, 400: errorSchema, 401: errorSchema, 403: errorSchema, 500: errorSchema },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: { ...schema, body: scheduleOpenApiBody } }),
    },
  }, async (request, reply) => {
    const systemId = getSystemId(request.params);
    if (!systemId) return reply.code(400).send({ error: 'Invalid game system ID' });
    const parsed = dailyLoginScheduleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid daily login schedule' });
    try {
      const result = await saveOwnerDailyLoginCalendar(request.supabase!, systemId, parsed.data);
      switch (result.status) {
        case 'updated': return reply.send(result);
        case 'not_owner': return reply.code(403).send({ error: 'Only this system’s owner can manage its calendar.' });
        case 'invalid_calendar': return reply.code(400).send({ error: 'The calendar must contain one valid item and quantity for each weekday.' });
        case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
        default: return databaseError(reply);
      }
    } catch {
      return databaseError(reply);
    }
  });
}
