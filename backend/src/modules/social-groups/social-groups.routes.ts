import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOptions as auth } from '../../http/route-options.js';

const name = z.string().trim().min(1).max(80);
const group = z.object({ id: z.uuid(), name: z.string(), owner_user_id: z.uuid(), created_at: z.iso.datetime({ offset: true }) });
const message = z.object({ id: z.uuid(), group_id: z.uuid(), sender_user_id: z.uuid(), content: z.string(), created_at: z.iso.datetime({ offset: true }) });
const schemas = {
  list: z.strictObject({}), read: z.strictObject({}), leave: z.strictObject({}),
  create: z.strictObject({ name, user_ids: z.array(z.uuid()).default([]) }),
  rename: z.strictObject({ name }),
  send: z.strictObject({ content: z.string().trim().min(1).max(2000) }),
  add: z.strictObject({ user_id: z.uuid() }), remove: z.strictObject({ user_id: z.uuid() }), transfer: z.strictObject({ user_id: z.uuid() }),
};
export async function socialGroupsRoutes(app: FastifyInstance) {
  const routes = [
    ['GET', '', 'list'], ['POST', '', 'create'], ['GET', '/:groupId', 'read'], ['PATCH', '/:groupId', 'rename'],
    ['POST', '/:groupId/messages', 'send'], ['PUT', '/:groupId/members/:userId', 'add'], ['DELETE', '/:groupId/members/:userId', 'remove'],
    ['POST', '/:groupId/owner', 'transfer'], ['POST', '/:groupId/leave', 'leave'],
  ] as const;
  for (const [method, suffix, action] of routes) app.route({ method, url: `/api/v1/social-groups${suffix}`, ...auth, handler: async (request, reply) => {
    const params = z.object({ groupId: z.uuid().optional(), userId: z.uuid().optional() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Grupo inválido.' });
    const input = schemas[action].safeParse(action === 'add' || action === 'remove' ? { user_id: params.data.userId } : request.body ?? {});
    if (!input.success) return reply.code(400).send({ error: 'Dados do grupo inválidos.' });
    try {
      const { data, error } = await request.supabase!.rpc('social_groups_action', { p_action: action, p_group: params.data.groupId ?? null, p_payload: input.data });
      if (error) throw error;
      if (data?.status === 'not_found') return reply.code(404).send({ error: 'Grupo não encontrado.' });
      if (data?.status === 'forbidden') return reply.code(403).send({ error: 'Somente o criador pode administrar o grupo.' });
      if (data?.status === 'transfer_required') return reply.code(409).send({ error: 'Transfira a administração antes de sair do grupo.' });
      if (data?.status === 'invalid_input' || data?.status === 'invalid_member') return reply.code(400).send({ error: 'Dados do grupo inválidos.' });
      if (data?.status !== 'ok') throw new Error('Invalid group response');
      if (action === 'list') return reply.send({ groups: z.array(group).parse(data.groups) });
      if (action === 'create') return reply.code(201).send({ group: group.parse(data.group) });
      if (action === 'read') return reply.send({ group: group.parse(data.group), messages: z.array(message).parse(data.messages), members: z.array(z.object({ user_id: z.uuid(), display_name: z.string(), username: z.string().nullable() })).parse(data.members) });
      if (action === 'send') return reply.code(201).send({ message: message.parse(data.message) });
      return reply.send({ status: 'ok' });
    } catch { return reply.code(500).send({ error: 'Não foi possível acessar o grupo.' }); }
  } });
}
