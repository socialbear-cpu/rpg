import { describe, expect, it } from 'vitest';
import { dailyLoginClaimSchema, dailyLoginScheduleSchema } from '../src/modules/daily-login/daily-login.schema.js';

const systemItemId = '40000000-0000-4000-8000-000000000001';
const schedule = Array.from({ length: 7 }, (_, index) => ({
  weekday: index + 1,
  item_id: systemItemId,
  quantity: index + 1,
}));

describe('daily login claim schema', () => {
  it('accepts a character UUID and rejects account or date overrides', () => {
    expect(dailyLoginClaimSchema.parse({ character_id: '50000000-0000-4000-8000-000000000001' }))
      .toEqual({ character_id: '50000000-0000-4000-8000-000000000001' });
    expect(dailyLoginClaimSchema.safeParse({
      character_id: '50000000-0000-4000-8000-000000000001',
      user_id: '20000000-0000-4000-8000-000000000002',
      local_claim_date: '2026-11-10',
    }).success).toBe(false);
  });
});

describe('daily login schedule schema', () => {
  it('accepts exactly seven unique weekdays with existing-item IDs and positive quantities', () => {
    expect(dailyLoginScheduleSchema.parse({ rewards: schedule, is_active: true }))
      .toEqual({ rewards: schedule, is_active: true });
  });

  it('rejects duplicate weekdays, invalid item IDs, and quantities outside the supported range', () => {
    expect(dailyLoginScheduleSchema.safeParse({
      rewards: [{ ...schedule[0] }, { ...schedule[0] }, ...schedule.slice(2)],
      is_active: true,
    }).success).toBe(false);
    expect(dailyLoginScheduleSchema.safeParse({
      rewards: schedule.map((reward, index) => index === 0 ? { ...reward, item_id: 'not-a-uuid' } : reward),
      is_active: true,
    }).success).toBe(false);
    expect(dailyLoginScheduleSchema.safeParse({
      rewards: schedule.map((reward, index) => index === 0 ? { ...reward, quantity: 0 } : reward),
      is_active: true,
    }).success).toBe(false);
    expect(dailyLoginScheduleSchema.safeParse({
      rewards: schedule.map((reward, index) => index === 0 ? { ...reward, quantity: 1_000_001 } : reward),
      is_active: true,
    }).success).toBe(false);
  });

  it('rejects extra schedule fields instead of trusting client authorization data', () => {
    expect(dailyLoginScheduleSchema.safeParse({ rewards: schedule, is_active: true, owner_user_id: '20000000-0000-4000-8000-000000000001' }).success)
      .toBe(false);
  });
});
