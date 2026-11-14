import { z } from 'zod';

const metadataSchema = z.record(z.string(), z.unknown());

export const tradeCharacterSchema = z.strictObject({
  id: z.uuid(),
  character_name: z.string(),
  owner_display_name: z.string(),
  is_mine: z.boolean(),
});

export const tradeInventoryCharacterSchema = z.strictObject({
  id: z.uuid(),
  character_name: z.string(),
  owner_display_name: z.string(),
  is_mine: z.boolean(),
});

export const tradeInventoryStackSchema = z.strictObject({
  stack_id: z.uuid(),
  item_id: z.uuid(),
  item_name: z.string(),
  quantity: z.number().int().min(1).max(2_147_483_647),
  metadata: metadataSchema,
});

export const tradeInventorySchema = z.strictObject({
  character: tradeInventoryCharacterSchema,
  stacks: z.array(tradeInventoryStackSchema),
});

const tradeLineInputSchema = z.strictObject({
  stack_id: z.uuid(),
  quantity: z.number().int().min(1).max(2_147_483_647),
});

const tradeLineInputsSchema = z.array(tradeLineInputSchema).max(100)
  .refine((lines) => new Set(lines.map((line) => line.stack_id)).size === lines.length,
    'A stack can appear only once on each side of an offer');

const tradeLineSnapshotSchema = z.strictObject({
  stack_id: z.uuid(),
  item_id: z.uuid(),
  item_name: z.string(),
  quantity: z.number().int().min(1).max(2_147_483_647),
  metadata: metadataSchema,
});

const tradeOfferStatusSchema = z.enum([
  'pending', 'accepted', 'declined', 'cancelled', 'countered', 'expired', 'invalidated',
]);

const tradeOfferCharacterSchema = z.strictObject({
  id: z.uuid(),
  character_name: z.string(),
  owner_display_name: z.string(),
});

export const tradeOfferSchema = z.strictObject({
  id: z.uuid(),
  game_system_id: z.uuid(),
  status: tradeOfferStatusSchema,
  created_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
  responded_at: z.iso.datetime({ offset: true }).nullable(),
  countered_from_offer_id: z.uuid().nullable(),
  sender_character: tradeOfferCharacterSchema,
  recipient_character: tradeOfferCharacterSchema,
  sender_lines: z.array(tradeLineSnapshotSchema),
  recipient_lines: z.array(tradeLineSnapshotSchema),
});

export const tradeCharactersResponseSchema = z.strictObject({
  characters: z.array(tradeCharacterSchema),
});

export const tradeCharactersRpcSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), characters: z.array(tradeCharacterSchema) }),
  z.strictObject({ status: z.enum(['unauthorized', 'no_active_character']) }),
]);

export const tradeInventoryResponseSchema = tradeInventorySchema;

export const ownedInventoryCharacterSchema = z.strictObject({
  id: z.uuid(),
  game_system_id: z.uuid(),
  character_name: z.string(),
});

export const ownedInventoryStackSchema = z.strictObject({
  stack_id: z.uuid(),
  item_id: z.uuid(),
  item_name: z.string(),
  description: z.string().nullable(),
  item_type: z.string(),
  rules_data: metadataSchema,
  quantity: z.number().int().min(1).max(2_147_483_647),
  metadata: metadataSchema,
});

export const ownedCharacterInventorySchema = z.strictObject({
  character: ownedInventoryCharacterSchema,
  stacks: z.array(ownedInventoryStackSchema),
});

export const tradeInventoryRpcSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), character: tradeInventoryCharacterSchema, stacks: z.array(tradeInventoryStackSchema) }),
  z.strictObject({ status: z.enum(['unauthorized', 'no_active_character', 'character_not_found']) }),
]);

export const tradeOffersQuerySchema = z.strictObject({
  box: z.enum(['incoming', 'sent', 'history']),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const tradeOffersResponseSchema = z.strictObject({
  offers: z.array(tradeOfferSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
});

export const tradeOffersRpcSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), offers: z.array(tradeOfferSchema), limit: z.number().int(), offset: z.number().int() }),
  z.strictObject({ status: z.enum(['unauthorized', 'invalid_query']) }),
]);

export const createTradeOfferSchema = z.strictObject({
  sender_character_id: z.uuid(),
  recipient_character_id: z.uuid(),
  sender_lines: tradeLineInputsSchema,
  recipient_lines: tradeLineInputsSchema,
}).refine((input) => input.sender_lines.length + input.recipient_lines.length > 0,
  'An offer must include items from at least one side')
  .refine((input) => input.sender_lines.length + input.recipient_lines.length <= 100,
    'An offer can contain at most 100 item stacks');

export const counterTradeOfferSchema = z.strictObject({
  sender_lines: tradeLineInputsSchema,
  recipient_lines: tradeLineInputsSchema,
}).refine((input) => input.sender_lines.length + input.recipient_lines.length > 0,
  'An offer must include items from at least one side')
  .refine((input) => input.sender_lines.length + input.recipient_lines.length <= 100,
    'An offer can contain at most 100 item stacks');

export const tradeOfferResponseInputSchema = z.strictObject({
  action: z.enum(['accept', 'decline']),
});

export const tradeMutationResponseSchema = z.strictObject({
  status: z.enum([
    'created', 'accepted', 'declined', 'cancelled', 'expired', 'invalidated', 'not_pending',
    'not_found', 'not_sender', 'not_recipient', 'unauthorized', 'no_active_character',
    'character_not_found', 'invalid_character', 'invalid_system', 'self_trade', 'invalid_lines',
    'invalid_item', 'insufficient_items', 'invalid_action', 'invalid_query',
  ]),
  offer_id: z.uuid().optional(),
  countered_offer_id: z.uuid().optional(),
});

export type TradeCharacter = z.infer<typeof tradeCharacterSchema>;
export type TradeInventory = z.infer<typeof tradeInventorySchema>;
export type TradeOffer = z.infer<typeof tradeOfferSchema>;
export type TradeOfferLineInput = z.infer<typeof tradeLineInputSchema>;
export type CreateTradeOfferInput = z.infer<typeof createTradeOfferSchema>;
export type CounterTradeOfferInput = z.infer<typeof counterTradeOfferSchema>;
export type TradeOfferResponseInput = z.infer<typeof tradeOfferResponseInputSchema>;
export type TradeOffersQuery = z.infer<typeof tradeOffersQuerySchema>;
