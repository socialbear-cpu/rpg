import { describe, expect, it } from 'vitest';
import { storeScheduleSchema, storePurchaseSchema } from '../src/modules/store/store.schema.js';
const id = '40000000-0000-4000-8000-000000000001';
describe('store inputs', () => {
  it('accepts item offers with optional existing listing IDs and zero prices', () => {
    expect(storeScheduleSchema.safeParse({ currency_name: 'Coins', offers: [{ item_id: id, price: 0, is_available: true }] }).success).toBe(true);
  });
  it.each([-1, 1.001, 10_000_000_000, Infinity])('rejects unsupported price %s', (price) => {
    expect(storeScheduleSchema.safeParse({ currency_name: 'Coins', offers: [{ item_id: id, price, is_available: true }] }).success).toBe(false);
  });
  it('rejects unknown fields, empty currency and duplicate listing IDs', () => {
    expect(storeScheduleSchema.safeParse({ currency_name: ' ', offers: [] }).success).toBe(false);
    expect(storeScheduleSchema.safeParse({ currency_name: 'Coins', offers: [{ item_id: id, price: 1, is_available: true, ability_id: id }] }).success).toBe(false);
    expect(storeScheduleSchema.safeParse({ currency_name: 'Coins', offers: Array(2).fill({ store_product_id: id, item_id: id, price: 1, is_available: true }) }).success).toBe(false);
  });
  it.each([0, -1, 1.5, 1_000_001])('rejects invalid quantity %s', (quantity) => {
    expect(storePurchaseSchema.safeParse({ character_id: id, store_product_id: id, quantity }).success).toBe(false);
  });
  it('accepts positive purchase quantities and rejects client price overrides', () => {
    expect(storePurchaseSchema.safeParse({ character_id: id, store_product_id: id, quantity: 2 }).success).toBe(true);
    expect(storePurchaseSchema.safeParse({ character_id: id, store_product_id: id, quantity: 2, price: 0 }).success).toBe(false);
  });
});
