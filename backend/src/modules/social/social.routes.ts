import { errorSchema, authOptions } from '../../http/route-options.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  friendRequestBodySchema,
  friendRequestDecisionSchema,
  friendRequestParamsSchema,
  friendUserParamsSchema,
  rpgSystemParamsSchema,
  rpgChatParamsSchema,
  rpgInvitationBodySchema,
  socialInvitationParamsSchema,
  socialInvitationDecisionSchema,
  socialSearchQuerySchema,
  type SocialMutationResult,
} from './social.schema.js';
import {
  cancelFriendRequest,
  createFriendRequest,
  listMyFriendships,
  removeFriend,
  respondFriendRequest,
  searchSocialProfiles,
  createRpgInvitation,
  listMySocialInvitations,
  respondRpgInvitation,
} from './social.repository.js';

const publicProfileJsonSchema = {
  type: 'object', required: ['user_id', 'username', 'display_name', 'avatar_url', 'bio'], additionalProperties: false,
  properties: {
    user_id: { type: 'string', format: 'uuid' },
    username: { type: 'string', minLength: 3, maxLength: 20, pattern: '^[a-z0-9_]+$' },
    display_name: { type: 'string' },
    avatar_url: { type: ['string', 'null'], format: 'uri' },
    bio: { type: ['string', 'null'] },
  },
} as const;

const friendRequestItemJsonSchema = {
  type: 'object', required: ['id', 'user_id', 'username', 'display_name', 'avatar_url', 'bio', 'created_at'], additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    user_id: { type: 'string', format: 'uuid' },
    username: { type: 'string', minLength: 3, maxLength: 20, pattern: '^[a-z0-9_]+$' },
    display_name: { type: 'string' },
    avatar_url: { type: ['string', 'null'], format: 'uri' },
    bio: { type: ['string', 'null'] },
    created_at: { type: 'string', format: 'date-time' },
  },
} as const;

const friendProfileJsonSchema = {
  type: 'object', required: ['user_id', 'username', 'display_name', 'avatar_url', 'bio', 'since'], additionalProperties: false,
  properties: {
    ...publicProfileJsonSchema.properties,
    since: { type: 'string', format: 'date-time' },
  },
} as const;

const friendshipListJsonSchema = {
  type: 'object', required: ['friends', 'incoming_requests', 'outgoing_requests'], additionalProperties: false,
  properties: {
    friends: { type: 'array', items: friendProfileJsonSchema },
    incoming_requests: { type: 'array', items: friendRequestItemJsonSchema },
    outgoing_requests: { type: 'array', items: friendRequestItemJsonSchema },
  },
} as const;

const friendRequestCreatedJsonSchema = {
  type: 'object', required: ['status', 'request_id'], additionalProperties: false,
  properties: { status: { const: 'created' }, request_id: { type: 'string', format: 'uuid' } },
} as const;

const friendRequestDecisionJsonSchema = {
  type: 'object', required: ['status', 'request_id'], additionalProperties: false,
  properties: { status: { type: 'string', enum: ['accepted', 'declined', 'cancelled'] }, request_id: { type: 'string', format: 'uuid' } },
} as const;

const friendRemovedJsonSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { const: 'removed' } },
} as const;

const invitationResultJsonSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['pending_owner_approval', 'pending_recipient', 'accepted', 'declined', 'cancelled', 'already_invited', 'already_member', 'not_friends', 'invalid_recipient', 'invalid_decision', 'invalid_character', 'not_found', 'forbidden', 'conflict', 'unauthorized'] },
    invitation_id: { type: 'string', format: 'uuid' },
  },
} as const;
const invitationListItemJsonSchema = {
  type: 'object', required: ['id', 'game_system_id', 'chat_id', 'system_name', 'chat_name', 'created_at', 'status', 'username', 'display_name'], additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' }, game_system_id: { type: 'string', format: 'uuid' },
    chat_id: { type: ['string', 'null'], format: 'uuid' }, system_name: { type: 'string' }, chat_name: { type: ['string', 'null'] },
    created_at: { type: 'string', format: 'date-time' }, status: { type: 'string' }, invitee_user_id: { type: 'string', format: 'uuid' },
    inviter_user_id: { type: 'string', format: 'uuid' }, username: { type: 'string' }, display_name: { type: 'string' },
  },
} as const;

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Não foi possível acessar a rede de amigos.' });
}

function sendMutationResult(reply: FastifyReply, result: SocialMutationResult, operation: 'create' | 'respond' | 'remove') {
  switch (result.status) {
    case 'created': return reply.code(201).send(result);
    case 'accepted': case 'declined': case 'cancelled': case 'removed':
      return reply.send(result);
    case 'already_pending': return reply.code(409).send({ error: 'Já existe um pedido ou amizade entre esses jogadores.' });
    case 'self_request': return reply.code(400).send({ error: 'Não é possível adicionar a si mesmo.' });
    case 'invalid_friend': case 'invalid_decision': return reply.code(400).send({ error: 'Ação de amizade inválida.' });
    case 'not_friends': return reply.code(404).send({ error: 'Amizade não encontrada.' });
    case 'not_found': return reply.code(404).send({ error: 'Pedido de amizade ou perfil não encontrado.' });
    case 'forbidden': return reply.code(403).send({ error: operation === 'respond'
      ? 'Não é permitido responder a este pedido.'
      : 'Ação de amizade não permitida.' });
    case 'conflict': return reply.code(409).send({ error: 'Este pedido de amizade já foi respondido.' });
    case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
    default: return databaseError(reply);
  }
}

function sendInvitationResult(reply: FastifyReply, result: Awaited<ReturnType<typeof createRpgInvitation>> | Awaited<ReturnType<typeof respondRpgInvitation>>, created = false) {
  switch (result.status) {
    case 'room_full': return reply.code(409).send({ error: 'Esta sala está cheia. O convite continua disponível.' });
    case 'pending_owner_approval': case 'pending_recipient': return reply.code(created ? 201 : 200).send(result);
    case 'accepted': case 'declined': case 'cancelled': return reply.send(result);
    case 'already_invited': case 'already_member': case 'conflict': return reply.code(409).send({ error: 'Este convite já foi processado ou já existe acesso ao destino.' });
    case 'invalid_decision': case 'invalid_recipient': case 'invalid_character': return reply.code(400).send({ error: 'Ação de convite inválida.' });
    case 'not_friends': return reply.code(403).send({ error: 'Só é possível convidar um amigo.' });
    case 'forbidden': return reply.code(403).send({ error: 'Você não pode gerenciar convites deste destino.' });
    case 'not_found': return reply.code(404).send({ error: 'Destino ou convite não encontrado.' });
    case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
    default: return databaseError(reply);
  }
}

export async function socialRoutes(app: FastifyInstance) {
  app.post('/api/v1/game-systems/:systemId/invitations', {
    ...authOptions,
    schema: { ...authOptions.schema, response: { 201: invitationResultJsonSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema } },
    config: { swaggerTransform: ({ schema, url }) => ({ url, schema: {
      ...schema, params: { type: 'object', required: ['systemId'], additionalProperties: false, properties: { systemId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['friend_user_id'], additionalProperties: false, properties: { friend_user_id: { type: 'string', format: 'uuid' } } },
    } }) },
  }, async (request, reply) => {
    const params = rpgSystemParamsSchema.safeParse(request.params);
    const body = rpgInvitationBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Convite inválido.' });
    try { return sendInvitationResult(reply, await createRpgInvitation(request.supabase!, body.data.friend_user_id, params.data.systemId, null), true); }
    catch { return databaseError(reply); }
  });

  app.post('/api/v1/chats/:chatId/invitations', {
    ...authOptions,
    schema: { ...authOptions.schema, response: { 201: invitationResultJsonSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema } },
    config: { swaggerTransform: ({ schema, url }) => ({ url, schema: {
      ...schema, params: { type: 'object', required: ['chatId'], additionalProperties: false, properties: { chatId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['friend_user_id'], additionalProperties: false, properties: { friend_user_id: { type: 'string', format: 'uuid' } } },
    } }) },
  }, async (request, reply) => {
    const params = rpgChatParamsSchema.safeParse(request.params);
    const body = rpgInvitationBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Convite inválido.' });
    try { return sendInvitationResult(reply, await createRpgInvitation(request.supabase!, body.data.friend_user_id, null, params.data.chatId), true); }
    catch { return databaseError(reply); }
  });

  app.get('/api/v1/me/social-invitations', {
    ...authOptions,
    schema: { ...authOptions.schema, response: { 200: { type: 'object', required: ['owner_approvals', 'recipient_invitations'], additionalProperties: false, properties: {
      owner_approvals: { type: 'array', items: invitationListItemJsonSchema }, recipient_invitations: { type: 'array', items: invitationListItemJsonSchema },
    } }, 401: errorSchema, 500: errorSchema } },
  }, async (request, reply) => {
    try { const result = await listMySocialInvitations(request.supabase!); return reply.send({ owner_approvals: result.owner_approvals, recipient_invitations: result.recipient_invitations }); }
    catch (error) {
      request.log.error({ err: error }, 'Unable to list social invitations');
      return databaseError(reply);
    }
  });

  app.post('/api/v1/social-invitations/:invitationId/respond', {
    ...authOptions,
    schema: { ...authOptions.schema, response: { 200: invitationResultJsonSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema } },
    config: { swaggerTransform: ({ schema, url }) => ({ url, schema: {
      ...schema, params: { type: 'object', required: ['invitationId'], additionalProperties: false, properties: { invitationId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { type: 'string', enum: ['approve', 'decline', 'accept', 'cancel'] }, character_id: { type: 'string', format: 'uuid' } } },
    } }) },
  }, async (request, reply) => {
    const params = socialInvitationParamsSchema.safeParse(request.params);
    const body = socialInvitationDecisionSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Resposta ao convite inválida.' });
    try { return sendInvitationResult(reply, await respondRpgInvitation(request.supabase!, params.data.invitationId, body.data.decision, body.data.character_id)); }
    catch { return databaseError(reply); }
  });

  app.get('/api/v1/social/search', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Search public profiles by username',
      response: {
        200: { type: 'object', required: ['results'], additionalProperties: false,
          properties: { results: { type: 'array', items: publicProfileJsonSchema } } },
        400: errorSchema, 401: errorSchema, 500: errorSchema,
      },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        querystring: {
          type: 'object', required: ['q'], additionalProperties: false,
          properties: { q: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[a-zA-Z0-9_]+$' } },
        },
      } }),
    },
  }, async (request, reply) => {
    const query = socialSearchQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Consulta de nick inválida.' });
    try {
      const result = await searchSocialProfiles(request.supabase!, query.data.q);
      return reply.send({ results: result.results });
    } catch {
      return databaseError(reply);
    }
  });

  app.get('/api/v1/me/friends', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Read friends and pending friend requests',
      response: { 200: friendshipListJsonSchema, 401: errorSchema, 500: errorSchema },
    },
  }, async (request, reply) => {
    try {
      const result = await listMyFriendships(request.supabase!);
      return reply.send({
        friends: result.friends,
        incoming_requests: result.incoming_requests,
        outgoing_requests: result.outgoing_requests,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Unable to list friendships');
      return databaseError(reply);
    }
  });

  app.post('/api/v1/friend-requests', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Send a friend request',
      response: { 201: friendRequestCreatedJsonSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        body: { type: 'object', required: ['recipient_user_id'], additionalProperties: false,
          properties: { recipient_user_id: { type: 'string', format: 'uuid' } } },
      } }),
    },
  }, async (request, reply) => {
    const input = friendRequestBodySchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Pedido de amizade inválido.' });
    try {
      return sendMutationResult(reply, await createFriendRequest(request.supabase!, input.data.recipient_user_id), 'create');
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/friend-requests/:requestId/respond', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Accept, decline, or cancel a friend request',
      response: { 200: friendRequestDecisionJsonSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        params: { type: 'object', required: ['requestId'], additionalProperties: false, properties: { requestId: { type: 'string', format: 'uuid' } } },
        body: { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { type: 'string', enum: ['accept', 'decline', 'cancel'] } } },
      } }),
    },
  }, async (request, reply) => {
    const params = friendRequestParamsSchema.safeParse(request.params);
    const input = friendRequestDecisionSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Resposta ao pedido de amizade inválida.' });
    try {
      const result = input.data.decision === 'cancel'
        ? await cancelFriendRequest(request.supabase!, params.data.requestId)
        : await respondFriendRequest(request.supabase!, params.data.requestId, input.data.decision);
      return sendMutationResult(reply, result, 'respond');
    } catch {
      return databaseError(reply);
    }
  });

  app.delete('/api/v1/me/friends/:friendUserId', {
    ...authOptions,
    schema: {
      ...authOptions.schema,
      summary: 'Remove an accepted friend relationship',
      response: { 200: friendRemovedJsonSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    config: {
      swaggerTransform: ({ schema, url }) => ({ url, schema: {
        ...schema,
        params: { type: 'object', required: ['friendUserId'], additionalProperties: false, properties: { friendUserId: { type: 'string', format: 'uuid' } } },
      } }),
    },
  }, async (request, reply) => {
    const params = friendUserParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Jogador inválido.' });
    try {
      return sendMutationResult(reply, await removeFriend(request.supabase!, params.data.friendUserId), 'remove');
    } catch {
      return databaseError(reply);
    }
  });
}
