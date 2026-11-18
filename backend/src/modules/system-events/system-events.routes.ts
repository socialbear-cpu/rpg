import { authOptions as auth, systemParamsSchema, errorSchema } from '../../http/route-options.js';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from 'fastify';
import { authorizeSystemAccess } from '../game-systems/game-systems.repository.js';
import { rejectSystemAccess } from '../game-systems/system-access.js';
import {
  canManageSystemEvents,
  createSystemEvent,
  deleteSystemEvent,
  listSystemEvents,
  startSystemEvent,
  updateSystemEvent,
} from './system-events.repository.js';
import { systemEventInputSchema } from './system-events.schema.js';

const eventParamsSchema = z.strictObject({ systemId: z.uuid(), eventId: z.uuid() });

async function checkEventAccess(client: NonNullable<FastifyRequest['supabase']>, reply: FastifyReply, systemId: string) {
  const canManage = await canManageSystemEvents(client, systemId);
  if (canManage) return { error: null, canManage };
  const error = rejectSystemAccess(reply, await authorizeSystemAccess(client, systemId));
  return { error, canManage };
}

const systemEventInputOpenApiSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'starts_at', 'ends_at'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: ['string', 'null'], maxLength: 2000 },
    starts_at: { type: 'string', format: 'date-time' },
    ends_at: { type: 'string', format: 'date-time' },
  },
} as const;

function documentedBody() {
  return { swaggerTransform: ({ schema, url }: { schema: FastifySchema; url: string }) => ({
    url, schema: { ...schema, body: systemEventInputOpenApiSchema },
  }) };
}

export async function systemEventsRoutes(app: FastifyInstance) {
  app.post('/api/v1/owner/game-systems/:systemId/events/:eventId/start', {
    ...auth,
    schema: { ...auth.schema, summary: 'Start a scheduled system event', response: { 200: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema } },
  }, async (request, reply) => {
    const params = eventParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid system event ID' });
    try {
      const access = await checkEventAccess(request.supabase!, reply, params.data.systemId);
      if (access.error) return access.error;
      if (!access.canManage) return reply.code(403).send({ error: 'Only the system owner or Admin can start events.' });
      const result = await startSystemEvent(request.supabase!, params.data.systemId, params.data.eventId);
      if (result.status === 'not_found') return reply.code(404).send({ error: 'System event not found' });
      if (result.status === 'already_started') return reply.code(409).send({ error: 'System event has already started' });
      return reply.send({ event: result.event });
    } catch { return reply.code(500).send({ error: 'Unable to start system event' }); }
  });

  app.get('/api/v1/game-systems/:systemId/events', auth, async (request, reply) => {
    const params = systemParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const access = await checkEventAccess(request.supabase!, reply, params.data.systemId);
      if (access.error) return access.error;
      return reply.send({ events: await listSystemEvents(request.supabase!, params.data.systemId) });
    } catch { return reply.code(500).send({ error: 'Unable to access system events' }); }
  });

  app.post('/api/v1/owner/game-systems/:systemId/events', {
    ...auth,
    schema: { ...auth.schema, summary: 'Create a system event', response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 500: errorSchema } },
    config: documentedBody(),
  }, async (request, reply) => {
    const params = systemParamsSchema.safeParse(request.params);
    const input = systemEventInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid system event' });
    try {
      const access = await checkEventAccess(request.supabase!, reply, params.data.systemId);
      if (access.error) return access.error;
      if (!access.canManage) return reply.code(403).send({ error: 'Only the system owner or Admin can manage events.' });
      return reply.code(201).send({ event: await createSystemEvent(request.supabase!, params.data.systemId, input.data) });
    } catch { return reply.code(500).send({ error: 'Unable to create system event' }); }
  });

  app.put('/api/v1/owner/game-systems/:systemId/events/:eventId', {
    ...auth,
    schema: { ...auth.schema, summary: 'Update a system event', response: { 200: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema } },
    config: documentedBody(),
  }, async (request, reply) => {
    const params = eventParamsSchema.safeParse(request.params);
    const input = systemEventInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid system event ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid system event' });
    try {
      const access = await checkEventAccess(request.supabase!, reply, params.data.systemId);
      if (access.error) return access.error;
      if (!access.canManage) return reply.code(403).send({ error: 'Only the system owner or Admin can manage events.' });
      const event = await updateSystemEvent(request.supabase!, params.data.systemId, params.data.eventId, input.data);
      return event ? reply.send({ event }) : reply.code(404).send({ error: 'System event not found' });
    } catch { return reply.code(500).send({ error: 'Unable to update system event' }); }
  });

  app.delete('/api/v1/owner/game-systems/:systemId/events/:eventId', auth, async (request, reply) => {
    const params = eventParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid system event ID' });
    try {
      const access = await checkEventAccess(request.supabase!, reply, params.data.systemId);
      if (access.error) return access.error;
      if (!access.canManage) return reply.code(403).send({ error: 'Only the system owner or Admin can manage events.' });
      const deleted = await deleteSystemEvent(request.supabase!, params.data.systemId, params.data.eventId);
      return deleted ? reply.code(204).send() : reply.code(404).send({ error: 'System event not found' });
    } catch { return reply.code(500).send({ error: 'Unable to delete system event' }); }
  });
}
