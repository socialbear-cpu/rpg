import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, authenticateAllowInactive } from '../../plugins/authenticate.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;
const accountSettingsSchema = {
  type: 'object',
  required: ['user_id', 'email', 'is_active', 'profile', 'owned_systems', 'incoming_transfers'],
  additionalProperties: false,
  properties: {
    user_id: { type: 'string', format: 'uuid' },
    email: { type: ['string', 'null'] },
    is_active: { type: 'boolean' },
    profile: {
      type: 'object', required: ['username', 'display_name', 'phone'], additionalProperties: false,
      properties: { username: { type: ['string', 'null'] }, display_name: { type: 'string' }, phone: { type: ['string', 'null'] } },
    },
    owned_systems: { type: 'array', items: {
      type: 'object', required: ['id', 'name', 'pending_transfer_id', 'pending_target_user_id', 'pending_target_display_name', 'candidates'], additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        pending_transfer_id: { type: ['string', 'null'] },
        pending_target_user_id: { type: ['string', 'null'] },
        pending_target_display_name: { type: ['string', 'null'] },
        candidates: { type: 'array', items: {
          type: 'object', required: ['user_id', 'display_name'], additionalProperties: false,
          properties: { user_id: { type: 'string', format: 'uuid' }, display_name: { type: 'string' } },
        } },
      },
    } },
    incoming_transfers: { type: 'array', items: {
      type: 'object', required: ['id', 'system_id', 'system_name', 'from_display_name'], additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' },
        system_id: { type: 'string', format: 'uuid' },
        system_name: { type: 'string' },
        from_display_name: { type: 'string' },
      },
    } },
  },
} as const;
const transferInputSchema = z.strictObject({
  system_id: z.uuid(),
  target_user_id: z.uuid(),
});
const transferIdSchema = z.strictObject({ transferId: z.uuid() });
type RpcResult = { status?: string; transfer_id?: string };

function databaseError(reply: FastifyReply) {
  return reply.code(500).send({ error: 'Unable to access account settings' });
}

function sendRpcStatus(reply: FastifyReply, result: RpcResult) {
  if (result.status === 'email_confirmation_required') return reply.code(403).send({ error: 'Confirme sua identidade pelo link enviado ao e-mail antes de continuar.' });
  if (result.status === 'unauthorized') return reply.code(401).send({ error: 'Unauthorized' });
  return null;
}

export async function accountRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/account', {
    preHandler: authenticateAllowInactive,
    schema: { security: [{ bearerAuth: [] }], response: {
      200: accountSettingsSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    try {
      const { data, error } = await request.supabase!.rpc('get_my_account_settings');
      if (error) return databaseError(reply);
      if (!data) return reply.code(404).send({ error: 'Account not found' });
      return reply.send(data);
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/account/deactivate', {
    preHandler: authenticate,
    schema: { security: [{ bearerAuth: [] }], response: {
      200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'deactivated' } } },
      401: errorSchema, 403: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    try {
      const { data, error } = await request.supabase!.rpc('set_my_account_active', { p_is_active: false });
      if (error) return databaseError(reply);
      const result = data as RpcResult;
      const rejected = sendRpcStatus(reply, result);
      if (rejected) return rejected;
      if (result.status !== 'deactivated') return databaseError(reply);
      return reply.send({ status: result.status });
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/account/reactivate', {
    preHandler: authenticateAllowInactive,
    schema: { security: [{ bearerAuth: [] }], response: {
      200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'activated' } } },
      401: errorSchema, 403: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    try {
      const { data, error } = await request.supabase!.rpc('set_my_account_active', { p_is_active: true });
      if (error) return databaseError(reply);
      const result = data as RpcResult;
      const rejected = sendRpcStatus(reply, result);
      if (rejected) return rejected;
      if (result.status !== 'activated') return databaseError(reply);
      return reply.send({ status: result.status });
    } catch {
      return databaseError(reply);
    }
  });

  app.delete('/api/v1/me/account', {
    preHandler: authenticateAllowInactive,
    schema: { security: [{ bearerAuth: [] }], response: {
      200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'deleted' } } },
      401: errorSchema, 403: errorSchema, 409: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    try {
      const { data, error } = await request.supabase!.rpc('delete_my_account');
      if (error) return databaseError(reply);
      const result = data as RpcResult;
      const rejected = sendRpcStatus(reply, result);
      if (rejected) return rejected;
      if (result.status === 'owned_systems_remaining') return reply.code(409).send({ error: 'Transfira todos os sistemas de sua propriedade antes de excluir a conta.' });
      if (result.status !== 'deleted') return databaseError(reply);
      return reply.send({ status: result.status });
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/account/owner-transfers', {
    preHandler: authenticate,
    schema: { security: [{ bearerAuth: [] }], response: {
      201: { type: 'object', required: ['status', 'transfer_id'], additionalProperties: false, properties: { status: { const: 'created' }, transfer_id: { type: 'string', format: 'uuid' } } },
      400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    const input = transferInputSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid owner transfer' });
    try {
      const { data, error } = await request.supabase!.rpc('request_my_system_owner_transfer', {
        p_system_id: input.data.system_id,
        p_target_user_id: input.data.target_user_id,
      });
      if (error) return databaseError(reply);
      const result = data as RpcResult;
      const rejected = sendRpcStatus(reply, result);
      if (rejected) return rejected;
      if (result.status === 'not_owner') return reply.code(403).send({ error: 'Only the current system owner can request a transfer.' });
      if (result.status === 'invalid_member') return reply.code(404).send({ error: 'The selected user is not an eligible system member.' });
      if (result.status === 'already_pending') return reply.code(409).send({ error: 'A transfer request is already pending for this system.' });
      if (result.status !== 'created' || !result.transfer_id) return databaseError(reply);
      return reply.code(201).send({ status: result.status, transfer_id: result.transfer_id });
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/account/owner-transfers/:transferId/accept', {
    preHandler: authenticate,
    schema: { security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['transferId'], additionalProperties: false, properties: { transferId: { type: 'string', format: 'uuid' } },
    }, response: {
      200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'accepted' } } },
      400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    const params = transferIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid transfer ID' });
    try {
      const { data, error } = await request.supabase!.rpc('accept_system_owner_transfer', { p_transfer_id: params.data.transferId });
      if (error) return databaseError(reply);
      const result = data as RpcResult;
      const rejected = sendRpcStatus(reply, result);
      if (rejected) return rejected;
      if (result.status === 'not_found') return reply.code(404).send({ error: 'Transfer request not found or no longer active.' });
      if (result.status !== 'accepted') return databaseError(reply);
      return reply.send({ status: result.status });
    } catch {
      return databaseError(reply);
    }
  });

  app.post('/api/v1/me/account/owner-transfers/:transferId/cancel', {
    preHandler: authenticate,
    schema: { security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['transferId'], additionalProperties: false, properties: { transferId: { type: 'string', format: 'uuid' } },
    }, response: {
      200: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { const: 'cancelled' } } },
      400: errorSchema, 401: errorSchema, 404: errorSchema, 500: errorSchema,
    } },
  }, async (request, reply) => {
    const params = transferIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid transfer ID' });
    try {
      const { data, error } = await request.supabase!.rpc('cancel_system_owner_transfer', { p_transfer_id: params.data.transferId });
      if (error) return databaseError(reply);
      const result = data as RpcResult;
      const rejected = sendRpcStatus(reply, result);
      if (rejected) return rejected;
      if (result.status === 'not_found') return reply.code(404).send({ error: 'Transfer request not found or no longer active.' });
      if (result.status !== 'cancelled') return databaseError(reply);
      return reply.send({ status: result.status });
    } catch {
      return databaseError(reply);
    }
  });
}
