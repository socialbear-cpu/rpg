import { describe, expect, it } from 'vitest';
import {
  createTradeOfferSchema,
  counterTradeOfferSchema,
  tradeInventorySchema,
  tradeOfferSchema,
} from '../src/modules/trading/trading.schema.js';

const senderCharacterId = '53000000-0000-4000-8000-000000000001';
const recipientCharacterId = '53000000-0000-4000-8000-000000000002';
const stackId = '63000000-0000-4000-8000-000000000001';
const itemId = '43000000-0000-4000-8000-000000000001';
const senderLine = { stack_id: stackId, quantity: 2 };

describe('trade offer input schemas', () => {
  it('accepts gifts and reciprocal offers with bounded stack quantities', () => {
    expect(createTradeOfferSchema.parse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [senderLine],
      recipient_lines: [],
    })).toEqual({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [senderLine],
      recipient_lines: [],
    });
    expect(counterTradeOfferSchema.parse({ sender_lines: [], recipient_lines: [senderLine] }))
      .toEqual({ sender_lines: [], recipient_lines: [senderLine] });
  });

  it('rejects empty offers, extra authorization fields, invalid UUIDs, and invalid quantities', () => {
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [],
      recipient_lines: [],
    }).success).toBe(false);
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [{ ...senderLine, quantity: 0 }],
      recipient_lines: [],
    }).success).toBe(false);
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [{ ...senderLine, stack_id: 'not-a-uuid' }],
      recipient_lines: [],
    }).success).toBe(false);
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [senderLine],
      recipient_lines: [],
      sender_user_id: '23000000-0000-4000-8000-000000000001',
    }).success).toBe(false);
  });

  it('rejects duplicate stack lines and too many total lines', () => {
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [senderLine, senderLine],
      recipient_lines: [],
    }).success).toBe(false);
    const manyLines = Array.from({ length: 101 }, (_, index) => ({
      stack_id: `63000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      quantity: 1,
    }));
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: manyLines,
      recipient_lines: [],
    }).success).toBe(false);
  });
});

describe('trade response schemas', () => {
  it('parses characteristic stacks and immutable offer line snapshots', () => {
    const inventory = tradeInventorySchema.parse({
      character: { id: recipientCharacterId, character_name: 'Partner', owner_display_name: 'Player B', is_mine: false },
      stacks: [{ stack_id: stackId, item_id: itemId, item_name: 'Ember Sword', quantity: 2, metadata: { enchantment: 'ember' } }],
    });
    expect(inventory.stacks[0]?.metadata).toEqual({ enchantment: 'ember' });

    const offer = tradeOfferSchema.parse({
      id: '73000000-0000-4000-8000-000000000001',
      game_system_id: '33000000-0000-4000-8000-000000000001',
      status: 'pending',
      created_at: '2026-11-11T12:00:00Z',
      expires_at: '2026-11-25T12:00:00Z',
      responded_at: null,
      countered_from_offer_id: null,
      sender_character: { id: senderCharacterId, character_name: 'Sender', owner_display_name: 'Player A' },
      recipient_character: { id: recipientCharacterId, character_name: 'Partner', owner_display_name: 'Player B' },
      sender_lines: [{ stack_id: stackId, item_id: itemId, item_name: 'Ember Sword', quantity: 1, metadata: { enchantment: 'ember' } }],
      recipient_lines: [],
    });
    expect(offer.sender_lines[0]?.metadata).toEqual({ enchantment: 'ember' });
  });

  it('rejects unknown offer status values and client-controlled metadata on inputs', () => {
    expect(tradeOfferSchema.safeParse({
      id: '73000000-0000-4000-8000-000000000001',
      game_system_id: '33000000-0000-4000-8000-000000000001',
      status: 'pendingish',
      created_at: '2026-11-11T12:00:00Z',
      expires_at: '2026-11-25T12:00:00Z',
      responded_at: null,
      countered_from_offer_id: null,
      sender_character: { id: senderCharacterId, character_name: 'Sender', owner_display_name: 'Player A' },
      recipient_character: { id: recipientCharacterId, character_name: 'Partner', owner_display_name: 'Player B' },
      sender_lines: [],
      recipient_lines: [],
    }).success).toBe(false);
    expect(createTradeOfferSchema.safeParse({
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: [{ ...senderLine, metadata: { enchantment: 'forged' } }],
      recipient_lines: [],
    }).success).toBe(false);
  });
});
