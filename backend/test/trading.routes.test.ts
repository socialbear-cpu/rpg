import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '23000000-0000-4000-8000-000000000001';
const systemId = '33000000-0000-4000-8000-000000000001';
const senderCharacterId = '53000000-0000-4000-8000-000000000001';
const recipientCharacterId = '53000000-0000-4000-8000-000000000002';
const stackId = '63000000-0000-4000-8000-000000000001';
const itemId = '43000000-0000-4000-8000-000000000001';
const ownInventoryCharacter = { id: senderCharacterId, game_system_id: systemId, character_name: 'Sender' };
const ownInventoryRows = [{ id: stackId, item_id: itemId, quantity: 2, metadata: { enchantment: 'ember' } }];
const ownInventoryItems = [{
  id: itemId, name: 'Ember Sword', description: 'A warm blade.', item_type: 'equipment',
  rules_data: { image_url: 'https://cdn.example/sword.png' },
}];
const offerId = '73000000-0000-4000-8000-000000000001';
const authorization = 'Bearer trade-token';
const senderLines = [{ stack_id: stackId, quantity: 1 }];
const recipientLines: typeof senderLines = [];
const senderCharacter = { id: senderCharacterId, character_name: 'Sender', owner_display_name: 'Player A' };
const recipientCharacter = { id: recipientCharacterId, character_name: 'Partner', owner_display_name: 'Player B' };
const tradeCharacter = { ...recipientCharacter, is_mine: false };
const inventoryResult = {
  status: 'ok', character: { ...tradeCharacter },
  stacks: [{ stack_id: stackId, item_id: itemId, item_name: 'Ember Sword', quantity: 2, metadata: { enchantment: 'ember' } }],
};
const offerResult = {
  id: offerId, game_system_id: systemId, status: 'pending',
  created_at: '2026-11-11T12:00:00Z', expires_at: '2026-11-25T12:00:00Z',
  responded_at: null, countered_from_offer_id: null,
  sender_character: senderCharacter, recipient_character: recipientCharacter,
  sender_lines: [{ stack_id: stackId, item_id: itemId, item_name: 'Ember Sword', quantity: 1, metadata: { enchantment: 'ember' } }],
  recipient_lines: [],
};
let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let rpcResults: Record<string, unknown>;
let databaseFails: boolean;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  databaseFails = false;
  rpcResults = {
    join_game_system_with_password: { status: 'ok' },
    get_trade_characters: { status: 'ok', characters: [{ ...tradeCharacter, is_mine: true }] },
    get_trade_inventory: inventoryResult,
    get_trade_offers: { status: 'ok', offers: [offerResult], limit: 20, offset: 5 },
    create_trade_offer: { status: 'created', offer_id: offerId },
    counter_trade_offer: { status: 'created', offer_id: offerId, countered_offer_id: '73000000-0000-4000-8000-000000000002' },
    respond_to_trade_offer: { status: 'accepted', offer_id: offerId },
    cancel_trade_offer: { status: 'cancelled', offer_id: offerId },
  };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });
    if (url.pathname === '/auth/v1/user') {
      return Response.json({
        id: userId, aud: 'authenticated', role: 'authenticated', email: 'trade@example.test',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (databaseFails) return Response.json({ message: 'private trade database detail', code: 'XX000' }, { status: 500 });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.slice('/rest/v1/rpc/'.length);
      return Response.json(rpcResults[name]);
    }
    if (url.pathname === '/rest/v1/characters') return Response.json(ownInventoryCharacter);
    if (url.pathname === '/rest/v1/character_inventory') return Response.json(ownInventoryRows);
    if (url.pathname === '/rest/v1/items') return Response.json(ownInventoryItems);
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function request(method: 'GET' | 'POST', url: string, payload?: unknown, authorized = true) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({
      method, url,
      headers: { ...(authorized ? { authorization } : {}), 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  } finally { await app.close(); }
}

describe('character trading API', () => {
  it('discovers same-system characters through the authenticated RPC', async () => {
    const response = await request('GET', `/api/v1/game-systems/${systemId}/trading/characters`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ characters: [{ ...tradeCharacter, is_mine: true }] });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/get_trade_characters'))!;
    expect(rpc.body).toEqual({ p_game_system_id: systemId });
    expect(rpc.headers.get('authorization')).toBe(authorization);
  });

  it('reads only the selected trade inventory and preserves stack characteristics', async () => {
    const response = await request('GET', `/api/v1/game-systems/${systemId}/trading/characters/${recipientCharacterId}/inventory`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ character: inventoryResult.character, stacks: inventoryResult.stacks });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/get_trade_inventory'))!;
    expect(rpc.body).toEqual({ p_game_system_id: systemId, p_character_id: recipientCharacterId });
  });

  it('reads the signed-in character inventory with item details and ownership filters', async () => {
    const response = await request('GET', `/api/v1/me/characters/${senderCharacterId}/inventory`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      character: ownInventoryCharacter,
      stacks: [{
        stack_id: stackId, item_id: itemId, item_name: 'Ember Sword',
        description: 'A warm blade.', item_type: 'equipment',
        rules_data: { image_url: 'https://cdn.example/sword.png' },
        quantity: 2, metadata: { enchantment: 'ember' },
      }],
    });
    const characterQuery = requests.find(({ url }) => url.pathname === '/rest/v1/characters')!;
    expect(characterQuery.url.searchParams.get('user_id')).toBe(`eq.${userId}`);
    expect(characterQuery.url.searchParams.get('id')).toBe(`eq.${senderCharacterId}`);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/character_inventory')).toBe(true);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/items')).toBe(true);
  });

  it('does not read inventory when the character is not owned by the signed-in user', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, headers, body });
      if (url.pathname === '/auth/v1/user') {
        return Response.json({
          id: userId, aud: 'authenticated', role: 'authenticated', email: 'trade@example.test',
          app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
        });
      }
      if (url.pathname === '/rest/v1/characters') return Response.json(null);
      throw new Error(`Unexpected request: ${url}`);
    });
    const response = await request('GET', `/api/v1/me/characters/${recipientCharacterId}/inventory`);
    expect(response.statusCode).toBe(404);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/character_inventory')).toBe(false);
  });

  it('lists incoming offers with bounded pagination', async () => {
    const response = await request('GET', '/api/v1/me/trade-offers?box=incoming&limit=20&offset=5');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ offers: [offerResult], limit: 20, offset: 5 });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/get_trade_offers'))!;
    expect(rpc.body).toEqual({ p_box: 'incoming', p_limit: 20, p_offset: 5 });
  });

  it('creates a gift or reciprocal offer using only stack IDs and quantities', async () => {
    const body = {
      sender_character_id: senderCharacterId,
      recipient_character_id: recipientCharacterId,
      sender_lines: senderLines,
      recipient_lines: recipientLines,
    };
    const response = await request('POST', '/api/v1/me/trade-offers', body);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ status: 'created', offer_id: offerId });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/create_trade_offer'))!;
    expect(rpc.body).toEqual({
      p_sender_character_id: senderCharacterId,
      p_recipient_character_id: recipientCharacterId,
      p_sender_lines: senderLines,
      p_recipient_lines: recipientLines,
    });
  });

  it('rejects empty offers, unknown fields, duplicate stacks, and invalid pagination before RPCs', async () => {
    const empty = await request('POST', '/api/v1/me/trade-offers', {
      sender_character_id: senderCharacterId, recipient_character_id: recipientCharacterId,
      sender_lines: [], recipient_lines: [],
    });
    expect(empty.statusCode).toBe(400);
    const extra = await request('POST', '/api/v1/me/trade-offers', {
      sender_character_id: senderCharacterId, recipient_character_id: recipientCharacterId,
      sender_lines: senderLines, recipient_lines: [], admin: true,
    });
    expect(extra.statusCode).toBe(400);
    const duplicate = await request('POST', '/api/v1/me/trade-offers', {
      sender_character_id: senderCharacterId, recipient_character_id: recipientCharacterId,
      sender_lines: [senderLines[0], senderLines[0]], recipient_lines: [],
    });
    expect(duplicate.statusCode).toBe(400);
    expect((await request('GET', '/api/v1/me/trade-offers?box=all')).statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/create_trade_offer') || url.pathname.endsWith('/get_trade_offers'))).toBe(false);
  });

  it('accepts or declines incoming offers through the transactional RPC', async () => {
    const accepted = await request('POST', `/api/v1/me/trade-offers/${offerId}/respond`, { action: 'accept' });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ status: 'accepted', offer_id: offerId });
    const declined = await request('POST', `/api/v1/me/trade-offers/${offerId}/respond`, { action: 'decline' });
    expect(declined.statusCode).toBe(200);
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/respond_to_trade_offer'))!;
    expect(rpc.body).toEqual({ p_offer_id: offerId, p_action: 'accept' });
  });

  it('counters an offer with the sender and recipient lines reversed by the RPC', async () => {
    const body = { sender_lines: [], recipient_lines: senderLines };
    const response = await request('POST', `/api/v1/me/trade-offers/${offerId}/counter`, body);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ status: 'created', offer_id: offerId, countered_offer_id: '73000000-0000-4000-8000-000000000002' });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/counter_trade_offer'))!;
    expect(rpc.body).toEqual({ p_offer_id: offerId, p_sender_lines: [], p_recipient_lines: senderLines });
  });

  it('cancels only pending sent offers through the RPC', async () => {
    const response = await request('POST', `/api/v1/me/trade-offers/${offerId}/cancel`, {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'cancelled', offer_id: offerId });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/cancel_trade_offer'))!;
    expect(rpc.body).toEqual({ p_offer_id: offerId });
  });

  it('maps ownership and stale-inventory conflicts to safe client statuses', async () => {
    rpcResults.respond_to_trade_offer = { status: 'not_recipient' };
    expect((await request('POST', `/api/v1/me/trade-offers/${offerId}/respond`, { action: 'accept' })).statusCode).toBe(403);
    rpcResults.respond_to_trade_offer = { status: 'invalidated', offer_id: offerId };
    expect((await request('POST', `/api/v1/me/trade-offers/${offerId}/respond`, { action: 'accept' })).statusCode).toBe(409);
    rpcResults.get_trade_inventory = { status: 'character_not_found' };
    expect((await request('GET', `/api/v1/game-systems/${systemId}/trading/characters/${recipientCharacterId}/inventory`)).statusCode).toBe(404);
  });

  it('requires authentication, rejects malformed IDs, and hides database details', async () => {
    expect((await request('GET', `/api/v1/game-systems/${systemId}/trading/characters`, undefined, false)).statusCode).toBe(401);
    expect((await request('POST', '/api/v1/me/trade-offers/not-a-uuid/cancel', {}, false)).statusCode).toBe(401);
    expect((await request('GET', '/api/v1/game-systems/not-a-uuid/trading/characters')).statusCode).toBe(400);
    expect((await request('GET', `/api/v1/game-systems/${systemId}/trading/characters/not-a-uuid/inventory`)).statusCode).toBe(400);
    expect((await request('GET', '/api/v1/me/characters/not-a-uuid/inventory')).statusCode).toBe(400);
    databaseFails = true;
    const response = await request('GET', `/api/v1/game-systems/${systemId}/trading/characters`);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private trade database detail');
  });
});
