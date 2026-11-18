import { authOptions as auth } from '../../http/route-options.js';
import { z } from 'zod';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { canManageStore, createStoreItem, readStore, readStoreCharacter, replaceStore, purchaseStoreOffer, updateStoreCurrencyField, updateStoreOfferField } from './store.repository.js';
import { storeCharacterQuerySchema, storeCurrencyFieldSchema, storeItemCreateSchema, storeOfferFieldSchema, storeOfferParamsSchema, storeParamsSchema, storePurchaseSchema, storeScheduleSchema } from './store.schema.js';
import { authorizeSystemAccess } from '../game-systems/game-systems.repository.js';
import { rejectSystemAccess } from '../game-systems/system-access.js';
// Documentation-only input schemas preserve strict Zod validation before AJV can strip keys.
function documentedInputs(body?: z.ZodType, querystring?: z.ZodType, paramsSchema: z.ZodType = storeParamsSchema) {
  return { swaggerTransform: ({ schema, url }: { schema: FastifySchema; url: string }) => ({
    url, schema: { ...schema, params: z.toJSONSchema(paramsSchema),
      ...(body ? { body: z.toJSONSchema(body) } : {}),
      ...(querystring ? { querystring: z.toJSONSchema(querystring) } : {}),
    },
  }) };
}
export async function storeRoutes(app: FastifyInstance) {
  app.get('/api/v1/game-systems/:systemId/store', { ...auth, config: documentedInputs(undefined, storeCharacterQuerySchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const query = storeCharacterQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'Choose a valid system and character.' });
    try {
      const { systemId } = params.data;
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, systemId));
      if (accessError) return accessError;
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
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, params.data.systemId));
      if (accessError) return accessError;
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
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, params.data.systemId));
      if (accessError) return accessError;
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(404).send({ error: 'Owned store not found' });
      const store = await readStore(request.supabase!, params.data.systemId);
      return store ? reply.send(store) : reply.code(404).send({ error: 'Owned store not found' });
    } catch { return reply.code(500).send({ error: 'Unable to access store' }); }
  });
  app.post('/api/v1/owner/game-systems/:systemId/items', { ...auth, config: documentedInputs(storeItemCreateSchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const input = storeItemCreateSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Informe um nome, tipo e descrição válidos para o item.' });
    try {
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, params.data.systemId));
      if (accessError) return accessError;
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(403).send({ error: 'Only the system owner or Admin can manage its store.' });
      const item = await createStoreItem(request.supabase!, params.data.systemId, input.data);
      return reply.code(201).send({ item });
    } catch { return reply.code(500).send({ error: 'Não foi possível adicionar o item à loja.' }); }
  });
  app.put('/api/v1/owner/game-systems/:systemId/store', { ...auth, config: documentedInputs(storeScheduleSchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const input = storeScheduleSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid store configuration' });
    try {
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, params.data.systemId));
      if (accessError) return accessError;
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(403).send({ error: 'Only the system owner or Admin can manage its store.' });
      if (!await readStore(request.supabase!, params.data.systemId)) return reply.code(404).send({ error: 'Owned store not found' });
      if (!await replaceStore(request.supabase!, params.data.systemId, input.data)) return reply.code(400).send({ error: 'Choose items and offers from this system.' });
      return reply.send(await readStore(request.supabase!, params.data.systemId));
    } catch { return reply.code(500).send({ error: 'Unable to update store' }); }
  });
  app.patch('/api/v1/owner/game-systems/:systemId/store/currency', { ...auth, config: documentedInputs(storeCurrencyFieldSchema) }, async (request, reply) => {
    const params = storeParamsSchema.safeParse(request.params);
    const input = storeCurrencyFieldSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Informe um nome ou endereço de imagem válido para a moeda.' });
    try {
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, params.data.systemId));
      if (accessError) return accessError;
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(403).send({ error: 'Only the system owner or Admin can manage its store.' });
      return reply.send(await updateStoreCurrencyField(request.supabase!, params.data.systemId, input.data));
    } catch { return reply.code(500).send({ error: 'Não foi possível salvar o campo da moeda.' }); }
  });
  app.patch('/api/v1/owner/game-systems/:systemId/store/items/:itemId/offer', { ...auth, config: documentedInputs(storeOfferFieldSchema, undefined, storeOfferParamsSchema) }, async (request, reply) => {
    const params = storeOfferParamsSchema.safeParse(request.params);
    const input = storeOfferFieldSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Informe um preço ou estado válido para a oferta.' });
    try {
      const accessError = rejectSystemAccess(reply, await authorizeSystemAccess(request.supabase!, params.data.systemId));
      if (accessError) return accessError;
      if (!await canManageStore(request.supabase!, params.data.systemId)) return reply.code(403).send({ error: 'Only the system owner or Admin can manage its store.' });
      const result = await updateStoreOfferField(request.supabase!, params.data.systemId, params.data.itemId, input.data);
      switch (result.status) {
        case 'updated': return reply.send({ offer: result });
        case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
        case 'not_owner': return reply.code(403).send({ error: 'Only the system owner or Admin can manage its store.' });
        case 'invalid_store': return reply.code(404).send({ error: 'Store not found' });
        case 'invalid_item': case 'offer_not_found': return reply.code(404).send({ error: 'Store item or offer not found' });
        case 'invalid_field': case 'invalid_value': return reply.code(400).send({ error: 'Informe um preço ou estado válido para a oferta.' });
      }
    } catch { return reply.code(500).send({ error: 'Não foi possível salvar o campo da oferta.' }); }
  });
}
