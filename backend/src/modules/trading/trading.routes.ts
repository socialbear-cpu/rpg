import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/authenticate.js';
import {
  cancelTradeOffer,
  counterTradeOffer,
  createTradeOffer,
  readTradeCharacters,
  readTradeInventory,
  readTradeOffers,
  respondToTradeOffer,
} from './trading.repository.js';
import {
  counterTradeOfferSchema,
  createTradeOfferSchema,
  tradeOfferResponseInputSchema,
  tradeOffersQuerySchema,
} from './trading.schema.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};
const systemParamsSchema = z.strictObject({ systemId: z.uuid() });
const characterParamsSchema = z.strictObject({ systemId: z.uuid(), characterId: z.uuid() });
const offerParamsSchema = z.strictObject({ offerId: z.uuid() });

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access character trading' });
}

function mutationReply(reply: FastifyReply, result: { status: string; [key: string]: unknown }) {
  const statusCode: Record<string, number> = {
    created: 201,
    accepted: 200,
    declined: 200,
    cancelled: 200,
    unauthorized: 401,
    not_sender: 403,
    not_recipient: 403,
    not_found: 404,
    character_not_found: 404,
    no_active_character: 404,
    invalid_character: 400,
    invalid_system: 400,
    self_trade: 400,
    invalid_lines: 400,
    invalid_item: 400,
    invalid_action: 400,
    invalid_query: 400,
    insufficient_items: 409,
    not_pending: 409,
    expired: 409,
    invalidated: 409,
  };
  const code = statusCode[result.status];
  if (!code) return databaseError(reply);
  if (code >= 400) {
    const messages: Record<string, string> = {
      unauthorized: 'Entre na sua conta para continuar.',
      not_sender: 'Somente quem enviou a oferta pode cancelá-la.',
      not_recipient: 'Somente quem recebeu a oferta pode responder.',
      not_found: 'Oferta de troca não encontrada.',
      character_not_found: 'Personagem indisponível para troca.',
      no_active_character: 'Você precisa ter um personagem ativo neste sistema.',
      invalid_character: 'Escolha personagens ativos das contas corretas.',
      invalid_system: 'Os dois personagens precisam pertencer ao mesmo sistema.',
      self_trade: 'A troca precisa envolver duas contas diferentes.',
      invalid_lines: 'Revise os itens e as quantidades da oferta.',
      invalid_item: 'Um dos itens não pertence ao personagem selecionado.',
      invalid_action: 'Ação de resposta inválida.',
      invalid_query: 'Filtro de ofertas inválido.',
      insufficient_items: 'A quantidade disponível mudou; atualize o inventário e tente novamente.',
      not_pending: 'Esta oferta já foi respondida ou não está mais ativa.',
      expired: 'Esta oferta expirou.',
      invalidated: 'Um item ou personagem mudou desde o envio; a oferta foi encerrada.',
    };
    return reply.code(code).send({ error: messages[result.status] ?? 'Não foi possível concluir a troca.' });
  }
  return reply.code(code).send(result);
}

function uuidParam<T extends { systemId?: string; characterId?: string; offerId?: string }>(schema: z.ZodType<T>, params: unknown) {
  return schema.safeParse(params);
}

export async function tradingRoutes(app: FastifyInstance) {
  app.get('/api/v1/game-systems/:systemId/trading/characters', authOptions, async (request, reply) => {
    const params = uuidParam(systemParamsSchema, request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system ID' });
    try {
      const result = await readTradeCharacters(request.supabase!, params.data.systemId!);
      if (result.status !== 'ok') return mutationReply(reply, result);
      return reply.send({ characters: result.characters });
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/game-systems/:systemId/trading/characters/:characterId/inventory', authOptions, async (request, reply) => {
    const params = uuidParam(characterParamsSchema, request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid game system or character ID' });
    try {
      const result = await readTradeInventory(request.supabase!, params.data.systemId!, params.data.characterId!);
      if (result.status !== 'ok') return mutationReply(reply, result);
      return reply.send({ character: result.character, stacks: result.stacks });
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/me/trade-offers', authOptions, async (request, reply) => {
    const parsed = tradeOffersQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid trade offer query' });
    try {
      const result = await readTradeOffers(request.supabase!, parsed.data);
      if (result.status !== 'ok') return mutationReply(reply, result);
      return reply.send({ offers: result.offers, limit: result.limit, offset: result.offset });
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/trade-offers', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Create a character item trade offer',
      response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema, 500: errorSchema },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', required: ['sender_character_id', 'recipient_character_id', 'sender_lines', 'recipient_lines'], additionalProperties: false,
          properties: {
            sender_character_id: { type: 'string', format: 'uuid' },
            recipient_character_id: { type: 'string', format: 'uuid' },
            sender_lines: { type: 'array', maxItems: 100, items: { type: 'object', required: ['stack_id', 'quantity'], additionalProperties: false, properties: { stack_id: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 2147483647 } } } },
            recipient_lines: { type: 'array', maxItems: 100, items: { type: 'object', required: ['stack_id', 'quantity'], additionalProperties: false, properties: { stack_id: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 2147483647 } } } },
          },
        },
      } }),
    },
  }, async (request, reply) => {
    const parsed = createTradeOfferSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid trade offer' });
    try {
      return mutationReply(reply, await createTradeOffer(request.supabase!, parsed.data));
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/trade-offers/:offerId/respond', {
    ...authOptions,
    schema: { ...authOptions.schema, summary: 'Accept or decline an incoming trade offer' },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: { type: 'object', required: ['action'], additionalProperties: false, properties: { action: { type: 'string', enum: ['accept', 'decline'] } } },
      } }),
    },
  }, async (request, reply) => {
    const params = uuidParam(offerParamsSchema, request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid trade offer ID' });
    const parsed = tradeOfferResponseInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid trade offer response' });
    try {
      return mutationReply(reply, await respondToTradeOffer(request.supabase!, params.data.offerId!, parsed.data));
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/trade-offers/:offerId/counter', {
    ...authOptions,
    schema: { ...authOptions.schema, summary: 'Send a counteroffer for an incoming trade offer' },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: {
          type: 'object', required: ['sender_lines', 'recipient_lines'], additionalProperties: false,
          properties: {
            sender_lines: { type: 'array', maxItems: 100, items: { type: 'object', required: ['stack_id', 'quantity'], additionalProperties: false, properties: { stack_id: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 2147483647 } } } },
            recipient_lines: { type: 'array', maxItems: 100, items: { type: 'object', required: ['stack_id', 'quantity'], additionalProperties: false, properties: { stack_id: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 2147483647 } } } },
          },
        },
      } }),
    },
  }, async (request, reply) => {
    const params = uuidParam(offerParamsSchema, request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid trade offer ID' });
    const parsed = counterTradeOfferSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid trade counteroffer' });
    try {
      return mutationReply(reply, await counterTradeOffer(request.supabase!, params.data.offerId!, parsed.data));
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/trade-offers/:offerId/cancel', {
    ...authOptions,
    schema: { ...authOptions.schema, summary: 'Cancel a sent pending trade offer' },
  }, async (request, reply) => {
    const params = uuidParam(offerParamsSchema, request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid trade offer ID' });
    try {
      return mutationReply(reply, await cancelTradeOffer(request.supabase!, params.data.offerId!));
    } catch {
      return databaseError(reply);
    }
  });
}
