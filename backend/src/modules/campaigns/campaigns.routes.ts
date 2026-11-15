import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { createSystemCampaign } from './campaigns.repository.js';
import { campaignSystemParamsSchema, createCampaignInputSchema } from './campaigns.schema.js';

const auth = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
const errorSchema = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'string' } } } as const;

export async function campaignsRoutes(app: FastifyInstance) {
  app.post('/api/v1/owner/game-systems/:systemId/campaigns', {
    ...auth,
    schema: { ...auth.schema, summary: 'Create a campaign as the system Owner', response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema } },
  }, async (request, reply) => {
    const params = campaignSystemParamsSchema.safeParse(request.params);
    const input = createCampaignInputSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    if (!input.success) return reply.code(400).send({ error: 'Invalid campaign' });
    try {
      const result = await createSystemCampaign(request.supabase!, request.userId!, params.data.systemId, input.data);
      if (result.status === 'forbidden') return reply.code(403).send({ error: 'Only the system Owner or Admin can create campaigns.' });
      if (result.status === 'invalid_input') return reply.code(400).send({ error: 'Invalid campaign' });
      if (result.status === 'character_not_found') return reply.code(404).send({ error: 'Character not found' });
      return reply.code(201).send({ campaign: result.campaign, character_id: input.data.character_id });
    } catch { return reply.code(500).send({ error: 'Unable to create campaign' }); }
  });
}
