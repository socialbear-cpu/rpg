import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { createRoomChatMessage, listCharacterChatRooms, listRoomChatMessages } from './campaign-chat.repository.js';
import { characterIdParamsSchema, roomParamsSchema, sendMessageInputSchema } from './campaign-chat.schema.js';

const auth = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
const errorSchema = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' } } } as const;

export async function campaignChatRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/characters/:characterId/chat-rooms', {
    ...auth,
    schema: { ...auth.schema, summary: 'List chat rooms for one of your active campaign characters' },
  }, async (request, reply) => {
    const params = characterIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character ID' });
    try {
      const rooms = await listCharacterChatRooms(request.supabase!, request.userId!, params.data.characterId);
      return rooms ? reply.send({ rooms }) : reply.code(404).send({ error: 'Character not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access campaign chat rooms' }); }
  });

  app.get('/api/v1/me/characters/:characterId/chat-rooms/:roomId/messages', {
    ...auth,
    schema: { ...auth.schema, summary: 'List messages in a campaign room available to one of your characters' },
  }, async (request, reply) => {
    const params = roomParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character or room ID' });
    try {
      const messages = await listRoomChatMessages(request.supabase!, request.userId!, params.data.characterId, params.data.roomId);
      return messages ? reply.send({ messages }) : reply.code(404).send({ error: 'Campaign chat room not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access campaign chat messages' }); }
  });

  app.post('/api/v1/me/characters/:characterId/chat-rooms/:roomId/messages', {
    ...auth,
    schema: {
      ...auth.schema,
      summary: 'Send a message to a campaign room as one of your characters',
      response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    config: { swaggerTransform: ({ schema, url }) => ({
      url,
      schema: { ...schema, body: { type: 'object', required: ['content'], additionalProperties: false, properties: { content: { type: 'string', minLength: 1 } } } },
    }) },
  }, async (request, reply) => {
    const params = roomParamsSchema.safeParse(request.params);
    const input = sendMessageInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character or room ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid message content' });
    try {
      const message = await createRoomChatMessage(request.supabase!, request.userId!, params.data.characterId, params.data.roomId, input.data.content);
      return message ? reply.code(201).send({ message }) : reply.code(404).send({ error: 'Campaign chat room not found' });
    } catch { return reply.code(500).send({ error: 'Unable to send campaign chat message' }); }
  });
}
