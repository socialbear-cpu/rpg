import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/authenticate.js';

export async function directMessagesRoutes(app: FastifyInstance) {
  const options = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
  app.get('/api/v1/direct-messages/:otherUserId', options, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { otherUserId?: string }).otherUserId);
    if (!id.success) return reply.code(400).send({ error: 'Jogador inválido.' });
    const { data, error } = await request.supabase!.rpc('get_direct_messages', { p_other_user_id: id.data });
    if (error) return reply.code(500).send({ error: 'Não foi possível carregar as mensagens.' });
    return reply.send({ messages: [...(data?.messages ?? [])].reverse() });
  });
  app.post('/api/v1/direct-messages/:recipientUserId', options, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { recipientUserId?: string }).recipientUserId);
    const body = z.strictObject({ content: z.string().trim().min(1).max(2000) }).safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'Mensagem inválida.' });
    const { data, error } = await request.supabase!.rpc('send_direct_message', { p_recipient_user_id: id.data, p_content: body.data.content });
    if (error) return reply.code(500).send({ error: 'Não foi possível enviar a mensagem.' });
    if (data?.status === 'self_message') return reply.code(400).send({ error: 'Não é possível enviar mensagem para si mesmo.' });
    if (data?.status === 'not_found') return reply.code(404).send({ error: 'Jogador não encontrado.' });
    if (data?.status !== 'sent') return reply.code(400).send({ error: 'Mensagem inválida.' });
    return reply.code(201).send({ status: 'sent', id: data.id });
  });
}
