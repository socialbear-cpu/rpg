import { authOptions as auth, errorSchema } from '../../http/route-options.js';
import type { FastifyInstance } from 'fastify';
import { lobbyPresenceParamsSchema } from './lobby-presence.schema.js';
import { heartbeatGameSystemLobbyPresence } from './lobby-presence.repository.js';

export async function lobbyPresenceRoutes(app: FastifyInstance) {
  app.post('/api/v1/game-systems/:systemId/lobby-presence/heartbeat', {
    ...auth,
    schema: {
      ...auth.schema,
      summary: 'Record a lobby heartbeat and return the aggregate online count',
      response: {
        200: { type: 'object', required: ['online_count'], additionalProperties: false, properties: { online_count: { type: 'integer', minimum: 0 } } },
        400: errorSchema,
        403: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    const params = lobbyPresenceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const onlineCount = await heartbeatGameSystemLobbyPresence(request.supabase!, params.data.systemId);
      return reply.send({ online_count: onlineCount });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '42501') {
        return reply.code(403).send({ error: 'System membership required' });
      }
      return reply.code(500).send({ error: 'Unable to update lobby presence' });
    }
  });
}
