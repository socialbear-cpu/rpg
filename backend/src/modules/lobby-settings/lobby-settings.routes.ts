import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { authorizeSystemAccess } from '../game-systems/game-systems.repository.js';
import { rejectSystemAccess } from '../game-systems/system-access.js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import { getSystemLobbySettings, saveSystemLobbySettings } from './lobby-settings.repository.js';
import { lobbySettingsSchema } from './lobby-settings.schema.js';

const auth = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
const systemParamsSchema = z.strictObject({ systemId: z.uuid() });
const errorSchema = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' } } } as const;

async function checkMemberAccess(client: NonNullable<import('fastify').FastifyRequest['supabase']>, reply: FastifyReply, systemId: string) {
  const status = await authorizeSystemAccess(client, systemId);
  return rejectSystemAccess(reply, status);
}

async function canManage(client: NonNullable<import('fastify').FastifyRequest['supabase']>, systemId: string) {
  const access = await readMySystemMemberships(client);
  return access.is_platform_admin || access.memberships.some((membership) =>
    membership.game_system_id === systemId && membership.role === 'owner');
}

export async function lobbySettingsRoutes(app: FastifyInstance) {
  app.get('/api/v1/game-systems/:systemId/lobby-settings', {
    ...auth,
    schema: { ...auth.schema, summary: 'Read a system lobby presentation' },
  }, async (request, reply) => {
    const params = systemParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const accessError = await checkMemberAccess(request.supabase!, reply, params.data.systemId);
      if (accessError) return accessError;
      return reply.send({ settings: await getSystemLobbySettings(request.supabase!, params.data.systemId) });
    } catch { return reply.code(500).send({ error: 'Unable to read lobby settings' }); }
  });

  app.put('/api/v1/owner/game-systems/:systemId/lobby-settings', {
    ...auth,
    schema: { ...auth.schema, summary: 'Update a system lobby presentation', response: { 200: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 500: errorSchema } },
  }, async (request, reply) => {
    const params = systemParamsSchema.safeParse(request.params);
    const settings = lobbySettingsSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    if (!settings.success) return reply.code(400).send({ error: 'Invalid lobby settings' });
    try {
      if (!await canManage(request.supabase!, params.data.systemId)) return reply.code(403).send({ error: 'Only the system Owner or Admin can update lobby settings.' });
      return reply.send({ settings: await saveSystemLobbySettings(request.supabase!, params.data.systemId, settings.data) });
    } catch { return reply.code(500).send({ error: 'Unable to update lobby settings' }); }
  });
}
