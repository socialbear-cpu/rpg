import { z } from 'zod';

export const campaignSystemParamsSchema = z.strictObject({ systemId: z.uuid() });
export const createCampaignInputSchema = z.strictObject({
  character_id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).nullable().optional().transform((value) => value?.trim() || null),
});

export const createdCampaignSchema = z.strictObject({
  id: z.uuid(),
  game_system_id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  created_at: z.iso.datetime({ offset: true }),
});

export const createCampaignRpcResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('forbidden') }),
  z.strictObject({ status: z.literal('invalid_input') }),
  z.strictObject({ status: z.literal('character_not_found') }),
  z.strictObject({ status: z.literal('created'), character_id: z.uuid(), campaign: createdCampaignSchema }),
]);

export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;
