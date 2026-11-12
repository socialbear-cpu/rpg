import { z } from 'zod';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { authenticate } from '../../plugins/authenticate.js';
import { canManageStore, readStore, readStoreCharacter, replaceStore, purchaseStoreOffer } from './store.repository.js';
import { storeCharacterQuerySchema, storeParamsSchema, storePurchaseSchema, storeScheduleSchema } from './store.schema.js';
// Documentation-only input schemas preserve strict Zod validation before AJV can strip keys.
function documentedInputs(body?: z.ZodType, querystring?: z.ZodType) {
  return { swaggerTransform: ({ schema, url }: { schema: FastifySchema; url: string }) => ({
    url, schema: { ...schema, params: z.toJSONSchema(storeParamsSchema),
      ...(body ? { body: z.toJSONSchema(body) } : {}),
      ...(querystring ? { querystring: z.toJSONSchema(querystring) } : {}),
    },
  }) };
}
const auth = { preHandler: authenticate, schema: { security: [{ bearerAuth: [] }] } };
export async function storeRoutes(app: FastifyInstance) {
  app.get('/api/v1/game-systems/:systemId/store', { ...auth, config: documentedInputs(undefined, storeCharacterQuerySchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const query = storeCharacterQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'Choose a valid system and character.' });
    try {
      const { systemId } = params.data;
      const { character_id } = query.data;
      if (!await readStoreCharacter(request.supabase!, request.userId!, systemId, character_id)) return reply.code(400).send({ error: 'Choose an active character you own in this system.' });
      const store = await readStore(request.supabase!, systemId, character_id);
      return store ? reply.send(store) : reply.code(404).send({ error: 'Store not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access store' }); }
  });
  app.post('/api/v1/game-systems/:systemId/store/purchases', { ...auth, config: documentedInputs(storePurchaseSchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const input = storePurchaseSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid store purchase' });
    try {
      if (!await readStoreCharacter(request.supabase!, request.userId!, params.data.systemId, input.data.character_id)) return reply.code(400).send({ error: 'Choose an active character you own in this system.' });
      const result = await purchaseStoreOffer(request.supabase!, input.data);
      switch (result.status) {
        case 'purchased': return reply.code(201).send(result);
        case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
        case 'invalid_quantity': case 'invalid_character': case 'system_mismatch': return reply.code(400).send({ error: 'Invalid character, quantity, or system.' });
        case 'system_unavailable': case 'offer_unavailable': return reply.code(404).send({ error: 'Store offer unavailable' });
        case 'insufficient_funds': return reply.code(409).send({ error: 'Insufficient balance' });
      }
    } catch { return reply.code(500).send({ error: 'Unable to complete purchase' }); }
  });
  app.get('/api/v1/owner/game-systems/:systemId/store', auth, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(404).send({ error: 'Owned store not found' });
      const store = await readStore(request.supabase!, params.data.systemId);
      return store ? reply.send(store) : reply.code(404).send({ error: 'Owned store not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access store' }); }
  });
  app.put('/api/v1/owner/game-systems/:systemId/store', { ...auth, config: documentedInputs(storeScheduleSchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const input = storeScheduleSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid store configuration' });
    try {
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(403).send({ error: 'Only the system owner or Admin can manage its store.' });
      if (!await readStore(request.supabase!, params.data.systemId)) return reply.code(404).send({ error: 'Owned store not found' });
      if (!await replaceStore(request.supabase!, params.data.systemId, input.data)) return reply.code(400).send({ error: 'Choose items and offers from this system.' });
      return reply.send(await readStore(request.supabase!, params.data.systemId));
    } catch { return reply.code(500).send({ error: 'Unable to update store' }); }
  });
}
