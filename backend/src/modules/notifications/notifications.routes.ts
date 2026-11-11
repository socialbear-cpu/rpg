import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import {
  announcementInputSchema,
  notificationPaginationSchema,
  notificationParamsSchema,
  notificationsResponseSchema,
  systemAnnouncementParamsSchema,
} from './notifications.schema.js';
import {
  createSystemAnnouncement,
  listMyNotifications,
  markMyNotificationRead,
} from './notifications.repository.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access notifications' });
}

export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/notifications', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read your notifications and unread count',
      querystring: {
        type: 'object', additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object', required: ['notifications', 'unread_count', 'limit', 'offset'], additionalProperties: false,
          properties: {
            notifications: { type: 'array', items: {
              type: 'object', required: ['id', 'game_system_id', 'type', 'payload', 'read_at', 'created_at'], additionalProperties: false,
              properties: {
                id: { type: 'string', format: 'uuid' },
                game_system_id: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
                type: { type: 'string', minLength: 1 },
                payload: { type: 'object', additionalProperties: true },
                read_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                created_at: { type: 'string' },
              },
            } },
            unread_count: { type: 'integer', minimum: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const pagination = notificationPaginationSchema.safeParse(request.query);
    if (!pagination.success) return reply.code(400).send({ error: 'Invalid notification pagination' });

    try {
      const result = await listMyNotifications(request.supabase!, pagination.data.limit, pagination.data.offset);
      const parsed = notificationsResponseSchema.safeParse(result);
      if (!parsed.success) return databaseError(reply);
      return reply.send(parsed.data);
    } catch {
      return databaseError(reply);
    }
  });

  app.patch('/api/v1/me/notifications/:notificationId/read', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Mark one of your notifications as read',
      params: {
        type: 'object', required: ['notificationId'], additionalProperties: false,
        properties: { notificationId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'updated' } } },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const params = notificationParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid notification ID' });

    try {
      const result = await markMyNotificationRead(request.supabase!, params.data.notificationId);
      if (result.status === 'updated') return reply.send(result);
      if (result.status === 'not_found') return reply.code(404).send({ error: 'Notification not found' });
      if (result.status === 'unauthorized') return reply.code(401).send({ error: 'Unauthorized' });
      return databaseError(reply);
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/game-systems/:systemId/announcements', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Publish a system announcement to its current members',
      params: {
        type: 'object', required: ['systemId'], additionalProperties: false,
        properties: { systemId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object', required: ['title', 'body'], additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 100 },
          body: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
      response: {
        201: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'created' } } },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const params = systemAnnouncementParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid system ID' });
    const input = announcementInputSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid announcement' });

    try {
      const result = await createSystemAnnouncement(request.supabase!, params.data.systemId, input.data);
      if (result.status === 'created') return reply.code(201).send({ status: result.status });
      if (result.status === 'invalid_content') return reply.code(400).send({ error: 'Invalid announcement' });
      if (result.status === 'not_authorized') return reply.code(403).send({ error: 'Only an owner or moderator can publish to this system' });
      if (result.status === 'unauthorized') return reply.code(401).send({ error: 'Unauthorized' });
      return databaseError(reply);
    } catch {
      return databaseError(reply);
    }
  });
}
