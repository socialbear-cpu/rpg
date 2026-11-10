import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '20000000-0000-4000-8000-000000000002';
const otherUserId = '20000000-0000-4000-8000-000000000004';
const systemId = '30000000-0000-4000-8000-000000000001';
const characterId = '50000000-0000-4000-8000-000000000001';
const itemId = '40000000-0000-4000-8000-000000000001';
const ownerId = '20000000-0000-4000-8000-000000000001';
const authorization = 'Bearer accepted-token';
let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let claimStatus: string;
let scheduleStatus: string;
let authenticatedUserId: string;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  claimStatus = 'claimed';
  scheduleStatus = 'updated';
  authenticatedUserId = userId;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });
    if (url.pathname === '/auth/v1/user') {
      return Response.json({
        id: authenticatedUserId, aud: 'authenticated', role: 'authenticated',
        email: 'player@example.com', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (url.pathname === '/rest/v1/characters') {
      return Response.json(authenticatedUserId === userId ? [{
        id: characterId, character_name: 'Player A', game_system_id: systemId,
      }] : []);
    }
    if (url.pathname === '/rest/v1/game_systems') {
      const system = {
        id: systemId, name: 'System A', is_active: true,
        daily_login_timezone: 'UTC', daily_login_rewards_enabled: true,
      };
      if (url.searchParams.get('owner_user_id') === `eq.${authenticatedUserId}`) {
        return authenticatedUserId === ownerId ? Response.json(system) : Response.json(null);
      }
      return Response.json(url.searchParams.get('is_active') === 'eq.true' ? [system] : []);
    }
    if (url.pathname === '/rest/v1/items') {
      return Response.json([{ id: itemId, name: 'Daily Token' }]);
    }
    if (url.pathname === '/rest/v1/daily_login_rewards') {
      return Response.json([{ weekday: 2, item_id: itemId, quantity: 3 }]);
    }
    if (url.pathname === '/rest/v1/rpc/get_daily_login_reward_state') {
      return Response.json({
        status: 'available', game_system_id: systemId, weekday: 2,
        local_date: '2026-11-10', timezone: 'UTC',
        reward: { weekday: 2, item_id: itemId, item_name: 'Daily Token', quantity: 3 },
        claim: null,
      });
    }
    if (url.pathname === '/rest/v1/rpc/claim_daily_login_reward') {
      return Response.json({
        status: claimStatus,
        claim_id: '60000000-0000-4000-8000-000000000001',
        game_system_id: systemId,
        character_id: characterId,
        item_id: itemId,
        item_name: 'Daily Token',
        quantity: 3,
        weekday: 2,
        local_claim_date: '2026-11-10',
        timezone: 'America/Sao_Paulo',
      });
    }
    if (url.pathname === '/rest/v1/rpc/set_daily_login_reward_schedule') {
      return Response.json({ status: scheduleStatus });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function request(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, authorized = true) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({
      method,
      url,
      headers: {
        ...(authorized ? { authorization } : {}),
        'content-type': 'application/json',
        'x-user-id': otherUserId,
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  } finally { await app.close(); }
}

describe('daily login API writes', () => {
  it('lists only the player’s own active characters and returns today’s database calendar state', async () => {
    const response = await request('GET', '/api/v1/me/daily-login/systems');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([expect.objectContaining({
      system: expect.objectContaining({ id: systemId, name: 'System A' }),
      is_owner: false,
      characters: [{ id: characterId, character_name: 'Player A', game_system_id: systemId }],
      today: expect.objectContaining({ status: 'available', local_date: '2026-11-10' }),
    })]);
    const characterQuery = requests.find(({ url }) => url.pathname === '/rest/v1/characters')!;
    expect(characterQuery.url.searchParams.get('user_id')).toBe(`eq.${userId}`);
    expect(characterQuery.headers.get('authorization')).toBe(authorization);
  });

  it('loads owner calendar and catalog only for the verified system owner', async () => {
    authenticatedUserId = ownerId;
    const response = await request('GET', `/api/v1/owner/game-systems/${systemId}/daily-login/rewards`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      is_active: true,
      items: [{ id: itemId, name: 'Daily Token' }],
      rewards: [{ weekday: 2, item_id: itemId, quantity: 3, item_name: 'Daily Token' }],
    });
    const ownerQuery = requests.find(({ url }) => url.pathname === '/rest/v1/game_systems')!;
    expect(ownerQuery.url.searchParams.get('owner_user_id')).toBe(`eq.${ownerId}`);
  });

  it('does not reveal owner catalog to a non-owner', async () => {
    const response = await request('GET', `/api/v1/owner/game-systems/${systemId}/daily-login/rewards`);
    expect(response.statusCode).toBe(404);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/items')).toBe(false);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/daily_login_rewards')).toBe(false);
  });

  it('requires an authenticated session before calling the claim operation', async () => {
    const response = await request('POST', `/api/v1/game-systems/${systemId}/daily-login/claims`, { character_id: characterId }, false);
    expect(response.statusCode).toBe(401);
    expect(requests.filter(({ url }) => url.pathname.startsWith('/rest/'))).toHaveLength(0);
  });

  it('claims only for the route system and verified token, never caller-supplied identity or date', async () => {
    const response = await request('POST', `/api/v1/game-systems/${systemId}/daily-login/claims`, { character_id: characterId });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'claimed', quantity: 3, character_id: characterId });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/claim_daily_login_reward'))!;
    expect(rpc.body).toEqual({ p_game_system_id: systemId, p_character_id: characterId });
    expect(rpc.body).not.toHaveProperty('user_id');
    expect(rpc.body).not.toHaveProperty('local_claim_date');
    expect(rpc.headers.get('authorization')).toBe(authorization);
  });

  it('rejects malformed claim payloads before calling the database operation', async () => {
    const response = await request('POST', `/api/v1/game-systems/${systemId}/daily-login/claims`, {
      character_id: characterId,
      user_id: otherUserId,
    });
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/claim_daily_login_reward'))).toBe(false);
  });

  it('maps a duplicate daily claim to a conflict response', async () => {
    claimStatus = 'already_claimed';
    const response = await request('POST', `/api/v1/game-systems/${systemId}/daily-login/claims`, { character_id: characterId });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'You have already claimed this system reward today.' });
  });

  it('maps database owner enforcement to forbidden and sends no caller-supplied owner ID', async () => {
    scheduleStatus = 'not_owner';
    const rewards = Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, item_id: itemId, quantity: 1 }));
    const response = await request('PUT', `/api/v1/owner/game-systems/${systemId}/daily-login/rewards`, {
      rewards,
      is_active: true,
    });
    expect(response.statusCode).toBe(403);
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/set_daily_login_reward_schedule'))!;
    expect(rpc.body).toEqual({
      p_game_system_id: systemId,
      p_rewards: rewards,
      p_is_active: true,
    });
    expect(rpc.body).not.toHaveProperty('owner_user_id');
  });
});
