import { z } from 'zod';
import { authenticate } from '../plugins/authenticate.js';

export const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;

export const authOptions = {
  preHandler: authenticate,
  schema: { security: [{ bearerAuth: [] }] },
};

export const systemParamsSchema = z.strictObject({ systemId: z.uuid() });

export function systemIdFromParams(params: unknown) {
  const result = systemParamsSchema.safeParse(params);
  return result.success ? result.data.systemId : null;
}
