import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/authenticate.js';

const username = z.string().min(3).max(20).regex(/^[a-z0-9_]+$/);
const fail = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' } } } as const;
const options = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };

export async function publicProfileRoutes(app: FastifyInstance) {
  app.get('/api/v1/social/profiles/:username', options, async (request, reply) => {
    const parsed = username.safeParse((request.params as { username?: string }).username);
    if (!parsed.success) return reply.code(400).send({ error: 'Perfil inválido.' });
    const { data, error } = await request.supabase!.rpc('get_social_profile', { p_username: parsed.data });
    if (error) return reply.code(500).send({ error: 'Não foi possível carregar o perfil.' });
    if (data?.status === 'not_found') return reply.code(404).send({ error: 'Jogador não encontrado.' });
    if (data?.status !== 'ok') return reply.code(401).send({ error: 'Unauthorized' });
    return reply.send({ profile: data.profile, systems: data.systems });
  });

  app.get('/api/v1/social/profiles/:username/comments', options, async (request, reply) => {
    const parsed = username.safeParse((request.params as { username?: string }).username);
    if (!parsed.success) return reply.code(400).send({ error: 'Perfil inválido.' });
    const { data, error } = await request.supabase!.rpc('list_profile_comments', { p_username: parsed.data });
    if (error) return reply.code(500).send({ error: 'Não foi possível carregar o mural.' });
    if (data?.status === 'not_found') return reply.code(404).send({ error: 'Jogador não encontrado.' });
    return reply.send({ comments: data?.comments ?? [] });
  });

  app.post('/api/v1/social/profiles/:username/comments', options, async (request, reply) => {
    const parsed = username.safeParse((request.params as { username?: string }).username);
    const body = z.strictObject({ content: z.string().trim().min(1).max(500) }).safeParse(request.body);
    if (!parsed.success || !body.success) return reply.code(400).send({ error: 'Comentário inválido.' });
    const { data, error } = await request.supabase!.rpc('create_profile_comment', { p_username: parsed.data, p_content: body.data.content });
    if (error) return reply.code(500).send({ error: 'Não foi possível publicar o comentário.' });
    if (data?.status === 'self_wall') return reply.code(400).send({ error: 'Não é possível comentar no próprio mural.' });
    if (data?.status === 'not_found') return reply.code(404).send({ error: 'Jogador não encontrado.' });
    if (data?.status !== 'created') return reply.code(400).send({ error: 'Comentário inválido.' });
    return reply.code(201).send({ status: 'created', id: data.id });
  });

  app.delete('/api/v1/social/comments/:commentId', options, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { commentId?: string }).commentId);
    if (!id.success) return reply.code(400).send({ error: 'Comentário inválido.' });
    const { data, error } = await request.supabase!.rpc('delete_profile_comment', { p_comment_id: id.data });
    if (error) return reply.code(500).send({ error: 'Não foi possível remover o comentário.' });
    if (data?.status === 'forbidden') return reply.code(403).send({ error: 'Ação não permitida.' });
    if (data?.status === 'not_found') return reply.code(404).send({ error: 'Comentário não encontrado.' });
    return reply.send({ status: 'deleted' });
  });
}
