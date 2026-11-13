import { z } from 'zod';
export const storeMoneySchema = z.number().finite().min(0).max(9_999_999_999.99).multipleOf(0.01);
export const storeOfferSchema = z.strictObject({
  store_product_id: z.uuid().optional(),
  item_id: z.uuid(),
  price: storeMoneySchema,
  is_available: z.boolean(),
});
export const storeScheduleSchema = z.strictObject({
  currency_name: z.string().trim().min(1).max(80),
  offers: z.array(storeOfferSchema).refine((offers) => {
    const ids = offers.flatMap((offer) => offer.store_product_id ? [offer.store_product_id] : []);
    return new Set(ids).size === ids.length;
  }, 'Listing IDs must be unique'),
});
export const storeItemCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  item_type: z.enum(['consumable', 'equipment', 'misc']),
});
export const storeItemSchema = z.strictObject({
  id: z.uuid(), name: z.string(), description: z.string().nullable(), item_type: z.string(),
});
export const storePurchaseSchema = z.strictObject({
  character_id: z.uuid(), store_product_id: z.uuid(), quantity: z.number().int().min(1).max(1_000_000),
});
export const storeCharacterQuerySchema = z.strictObject({ character_id: z.uuid() });
export const storeParamsSchema = z.strictObject({ systemId: z.uuid() });
export type StoreSchedule = z.infer<typeof storeScheduleSchema>;
export type StoreItemCreate = z.infer<typeof storeItemCreateSchema>;
export type StorePurchase = z.infer<typeof storePurchaseSchema>;
const failureStatus = z.enum(['unauthorized', 'invalid_quantity', 'invalid_character', 'system_unavailable', 'offer_unavailable', 'system_mismatch', 'insufficient_funds']);
export const storePurchaseResultSchema = z.union([
  z.strictObject({ status: z.literal('purchased'), balance: z.number().nonnegative(), purchase_id: z.uuid(), item_id: z.uuid(), item_name: z.string(), quantity: z.number().int().positive(), amount_charged: storeMoneySchema, currency_name: z.string() }),
  z.strictObject({ status: failureStatus, balance: z.number().nonnegative().optional() }),
]);
