import type { FastifyInstance, FastifySchema } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { createSystemChat, createChatMessage, listCharacterChats, listChatMessages } from './chats.repository.js';
import { chatParamsSchema, chatSystemParamsSchema, characterIdParamsSchema, createChatInputSchema, sendMessageInputSchema } from './chats.schema.js';

const auth = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
const errorSchema = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' } } } as const;

function documentedChatInput() {
  return { swaggerTransform: ({ schema, url }: { schema: FastifySchema; url: string }) => ({
    url,
    schema: { ...schema, body: { type: 'object', required: ['character_id', 'name'], additionalProperties: false, properties: {
      character_id: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 80 },
      description: { type: ['string', 'null'], maxLength: 2000 },
    } } },
  }) };
}

export async function chatsRoutes(app: FastifyInstance) {
  app.post('/api/v1/owner/game-systems/:systemId/chats', {
    ...auth,
    schema: { ...auth.schema, summary: 'Create a chat as the system Owner', response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema } },
    config: documentedChatInput(),
  }, async (request, reply) => {
    const params = chatSystemParamsSchema.safeParse(request.params);
    const input = createChatInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid chat' });
    try {
      const result = await createSystemChat(request.supabase!, request.userId!, params.data.systemId, input.data);
      if (result.status === 'forbidden') return reply.code(403).send({ error: 'Only the system Owner or Admin can create chats.' });
      if (result.status === 'invalid_input') return reply.code(400).send({ error: 'Invalid chat' });
      if (result.status === 'character_not_found') return reply.code(404).send({ error: 'Character not found' });
      return reply.code(201).send({ chat: result.chat, character_id: input.data.character_id });
    } catch { return reply.code(500).send({ error: 'Unable to create chat' }); }
  });

  app.get('/api/v1/me/characters/:characterId/chats', {
    ...auth,
    schema: { ...auth.schema, summary: 'List chats for one of your active characters' },
  }, async (request, reply) => {
    const params = characterIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character ID' });
    try {
      const chats = await listCharacterChats(request.supabase!, request.userId!, params.data.characterId);
      return chats ? reply.send({ chats }) : reply.code(404).send({ error: 'Character not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access chat list' }); }
  });

  app.get('/api/v1/me/characters/:characterId/chats/:chatId/messages', {
    ...auth,
    schema: { ...auth.schema, summary: 'List messages in a chat available to one of your characters' },
  }, async (request, reply) => {
    const params = chatParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character or chat ID' });
    try {
      const messages = await listChatMessages(request.supabase!, request.userId!, params.data.characterId, params.data.chatId);
      return messages ? reply.send({ messages }) : reply.code(404).send({ error: 'Chat not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access chat messages' }); }
  });

  app.post('/api/v1/me/characters/:characterId/chats/:chatId/messages', {
    ...auth,
    schema: {
      ...auth.schema,
      summary: 'Send a message to a chat as one of your characters',
      response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    config: { swaggerTransform: ({ schema, url }) => ({
      url,
      schema: { ...schema, body: { type: 'object', required: ['content'], additionalProperties: false, properties: { content: { type: 'string', minLength: 1, maxLength: 2000 } } } },
    }) },
  }, async (request, reply) => {
    const params = chatParamsSchema.safeParse(request.params);
    const input = sendMessageInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid character or chat ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid message content' });
    try {
      const message = await createChatMessage(request.supabase!, request.userId!, params.data.characterId, params.data.chatId, input.data.content);
      return message ? reply.code(201).send({ message }) : reply.code(404).send({ error: 'Chat not found' });
    } catch { return reply.code(500).send({ error: 'Unable to send chat message' }); }
  });
}
