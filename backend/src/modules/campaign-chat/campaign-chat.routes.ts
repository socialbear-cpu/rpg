import type { FastifyInstance, FastifySchema } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { createCampaignChatRoom, createRoomChatMessage, listCharacterCampaigns, listCharacterChatRooms, listRoomChatMessages } from './campaign-chat.repository.js';
import { campaignParamsSchema, characterIdParamsSchema, createChatRoomInputSchema, roomParamsSchema, sendMessageInputSchema } from './campaign-chat.schema.js';

const auth = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
const errorSchema = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' } } } as const;

function documentedRoomInput() {
  return { swaggerTransform: ({ schema, url }: { schema: FastifySchema; url: string }) => ({
    url,
    schema: { ...schema, body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } } },
  }) };
}

export async function campaignChatRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/characters/:characterId/campaigns', {
    ...auth,
    schema: { ...auth.schema, summary: 'List campaigns available to one of your active characters' },
  }, async (request, reply) => {
    const params = characterIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character ID' });
    try {
      const campaigns = await listCharacterCampaigns(request.supabase!, request.userId!, params.data.characterId);
      return campaigns ? reply.send({ campaigns }) : reply.code(404).send({ error: 'Character not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access campaign list' }); }
  });

  app.post('/api/v1/me/characters/:characterId/campaigns/:campaignId/chat-rooms', {
    ...auth,
    schema: { ...auth.schema, summary: 'Create a campaign chat room as an authorized campaign host', response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema } },
    config: documentedRoomInput(),
  }, async (request, reply) => {
    const params = campaignParamsSchema.safeParse(request.params);
    const input = createChatRoomInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character or campaign ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid room name' });
    try {
      const result = await createCampaignChatRoom(request.supabase!, request.userId!, params.data.characterId, params.data.campaignId, input.data.name);
      if (result.status === 'character_not_found' || result.status === 'campaign_not_found') return reply.code(404).send({ error: result.status === 'character_not_found' ? 'Character not found' : 'Campaign not found' });
      if (result.status === 'forbidden') return reply.code(403).send({ error: 'Only the campaign owner, a linked game master, or the system Owner can create rooms.' });
      return reply.code(201).send({ room: result.room });
    } catch { return reply.code(500).send({ error: 'Unable to create campaign chat room' }); }
  });

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
