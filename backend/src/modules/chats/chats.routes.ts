import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authOptions as auth } from '../../http/route-options.js';
import { createSystemChat, listSystemChats, readOwnedActiveCharacter, roomOperation } from './chats.repository.js';
import { chatParamsSchema, chatSystemParamsSchema, characterIdParamsSchema, createChatInputSchema, sendMessageInputSchema, chatSchema, chatMessageSchema, chatMessagesResponseSchema, roomSettingsInputSchema, roomSettingsResponseSchema } from './chats.schema.js';

const roomIdParams = z.strictObject({ chatId: z.uuid() });
function failure(reply: FastifyReply, status: string) {
  const code = status === 'room_full' ? 409 : status === 'forbidden' ? 403 : status === 'invalid_input' ? 400 : 404;
  const error = status === 'room_full' ? 'Esta sala está cheia.' : status === 'forbidden' ? 'Você não tem permissão para esta ação.' : status === 'invalid_input' ? 'Configuração inválida.' : 'Sala ou personagem não encontrado.';
  return reply.code(code).send({ error });
}

export async function chatsRoutes(app: FastifyInstance) {
  app.post('/api/v1/owner/game-systems/:systemId/chats', auth, async (request, reply) => {
    const params = chatSystemParamsSchema.safeParse(request.params), input = createChatInputSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Sala inválida.' });
    try {
      const result = await createSystemChat(request.supabase!, request.userId!, params.data.systemId, input.data);
      return result.status === 'created' ? reply.code(201).send({ chat: result.chat }) : failure(reply, result.status);
    } catch { return reply.code(500).send({ error: 'Não foi possível criar a sala.' }); }
  });
  app.get('/api/v1/game-systems/:systemId/chats', auth, async (request, reply) => {
    const params = chatSystemParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Sistema inválido.' });
    try { return reply.send(await listSystemChats(request.supabase!, params.data.systemId)); }
    catch { return reply.code(500).send({ error: 'Não foi possível carregar as salas.' }); }
  });
  app.get('/api/v1/me/characters/:characterId/chats', auth, async (request, reply) => {
    const params = characterIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Personagem inválido.' });
    try {
      const character = await readOwnedActiveCharacter(request.supabase!, request.userId!, params.data.characterId);
      return character ? reply.send(await listSystemChats(request.supabase!, character.game_system_id, character.id)) : failure(reply, 'invalid_character');
    } catch { return reply.code(500).send({ error: 'Não foi possível carregar as salas.' }); }
  });
  for (const method of ['GET', 'PUT'] as const) {
    app.route({ method, url: '/api/v1/chats/:chatId/settings', ...auth, handler: async (request, reply) => {
      const params = roomIdParams.safeParse(request.params);
      const input = method === 'PUT' ? roomSettingsInputSchema.safeParse(request.body) : null;
      if (!params.success || (input && !input.success)) return reply.code(400).send({ error: 'Configuração inválida.' });
      try {
        const result = await roomOperation(request.supabase!, method === 'PUT' ? 'configure' : 'settings', params.data.chatId, null, input?.data ?? {});
        return result.status === 'ok' ? reply.send(roomSettingsResponseSchema.parse(result)) : failure(reply, result.status);
      } catch { return reply.code(500).send({ error: 'Não foi possível acessar a configuração da sala.' }); }
    } });
  }
  for (const [method, suffix, action] of [['GET', 'messages', 'messages'], ['POST', 'messages', 'send'], ['POST', 'membership', 'join'], ['DELETE', 'membership', 'leave']] as const) {
    app.route({ method, url: `/api/v1/me/characters/:characterId/chats/:chatId/${suffix}`, ...auth, handler: async (request, reply) => {
      const params = chatParamsSchema.safeParse(request.params);
      const input = action === 'send' ? sendMessageInputSchema.safeParse(request.body) : null;
      if (!params.success || (input && !input.success)) return reply.code(400).send({ error: 'Sala ou mensagem inválida.' });
      try {
        const character = await readOwnedActiveCharacter(request.supabase!, request.userId!, params.data.characterId);
        if (!character) return failure(reply, 'invalid_character');
        const result = await roomOperation(request.supabase!, action, params.data.chatId, character.id, input?.data ?? {});
        if (result.status !== 'ok') return failure(reply, result.status);
        if (action === 'messages') return reply.send(chatMessagesResponseSchema.parse({ messages: result.messages }));
        if (action === 'send') return reply.code(201).send({ message: chatMessageSchema.parse(result.message) });
        return reply.send(action === 'join' ? { chat: chatSchema.parse(result.chat) } : { status: 'ok' });
      } catch { return reply.code(500).send({ error: 'Não foi possível acessar a sala.' }); }
    } });
  }
}
