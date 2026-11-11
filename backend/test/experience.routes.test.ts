import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '91000000-0000-4000-8000-000000000002';
const systemId = '92000000-0000-4000-8000-000000000001';
const characterId = '93000000-0000-4000-8000-000000000001';
const authorization = 'Bearer accepted-token';
const settings = {
  game_system_id: systemId,
  xp_per_level: 100,
  sources: [
    { id: 'a1000000-0000-4000-8000-000000000001', name: 'Login diário', source_type: 'daily_login', award_amount: 0, is_enabled: false },
    { id: 'a1000000-0000-4000-8000-000000000002', name: 'Missão', source_type: 'mission', award_amount: 0, is_enabled: false },
    { id: 'a1000000-0000-4000-8000-000000000003', name: 'Luta', source_type: 'fight', award_amount: 0, is_enabled: false },
    { id: 'a1000000-0000-4000-8000-000000000004', name: 'Treino', source_type: 'custom', award_amount: 25, is_enabled: true },
  ],
};
const settingsInput = { xp_per_level: settings.xp_per_level, sources: settings.sources };
let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let rpcResults: Record<string, unknown>;
let databaseFails: boolean;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  databaseFails = false;
  rpcResults = {
    get_game_system_xp_settings: settings,
    set_game_system_xp_settings: { status: 'updated' },
    get_character_xp_summary: {
      character_id: characterId, game_system_id: systemId, total_xp: 125,
      level: 2, xp_in_level: 25, xp_to_next_level: 75, history: [],
    },
  };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });
    if (url.pathname === '/auth/v1/user') {
      return Response.json({
        id: userId, aud: 'authenticated', role: 'authenticated', email: 'xp@example.test',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (databaseFails) return Response.json({ message: 'private database detail', code: 'XX000' }, { status: 500 });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.slice('/rest/v1/rpc/'.length);
      return Response.json(rpcResults[name]);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function request(method: 'GET' | 'PUT', url: string, payload?: unknown, authorized = true) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({
      method, url,
      headers: { ...(authorized ? { authorization } : {}), 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  } finally { await app.close(); }
}

describe('character experience API', () => {
  it('reads owner settings through the matching RPC', async () => {
    const response = await request('GET', `/api/v1/owner/game-systems/${systemId}/xp`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(settings);
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/get_game_system_xp_settings'))!;
    expect(rpc.body).toEqual({ p_game_system_id: systemId });
    expect(rpc.headers.get('authorization')).toBe(authorization);
  });

  it('saves owner settings atomically through the matching RPC', async () => {
    const input = settingsInput;
    const response = await request('PUT', `/api/v1/owner/game-systems/${systemId}/xp`, input);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'updated' });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/set_game_system_xp_settings'))!;
    expect(rpc.body).toEqual({ p_game_system_id: systemId, p_settings: input });
  });

  it('rejects settings edits by a non-owner', async () => {
    rpcResults.set_game_system_xp_settings = { status: 'not_owner' };
    const response = await request('PUT', `/api/v1/owner/game-systems/${systemId}/xp`, settingsInput);
    expect(response.statusCode).toBe(403);
  });

  it('rejects unknown fields, duplicate built-ins, and enabled sources without positive XP', async () => {
    const unknownField = await request('PUT', `/api/v1/owner/game-systems/${systemId}/xp`, { ...settingsInput, admin: true });
    expect(unknownField.statusCode).toBe(400);
    const duplicateSource = { ...settingsInput, sources: [...settingsInput.sources, settingsInput.sources[0]] };
    expect((await request('PUT', `/api/v1/owner/game-systems/${systemId}/xp`, duplicateSource)).statusCode).toBe(400);
    const zeroEnabledSource = { ...settingsInput, sources: settingsInput.sources.map((source) => source.source_type === 'custom'
      ? { ...source, award_amount: 0 }
      : source) };
    expect((await request('PUT', `/api/v1/owner/game-systems/${systemId}/xp`, zeroEnabledSource)).statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/set_game_system_xp_settings'))).toBe(false);
  });

  it('requires authentication for owner and character routes', async () => {
    expect((await request('GET', `/api/v1/owner/game-systems/${systemId}/xp`, undefined, false)).statusCode).toBe(401);
    expect((await request('PUT', `/api/v1/owner/game-systems/${systemId}/xp`, settingsInput, false)).statusCode).toBe(401);
    expect((await request('GET', `/api/v1/me/characters/${characterId}/xp`, undefined, false)).statusCode).toBe(401);
    expect(requests.some(({ url }) => url.pathname.startsWith('/rest/v1/'))).toBe(false);
  });

  it('reads XP totals, level, and history for an owned character', async () => {
    const response = await request('GET', `/api/v1/me/characters/${characterId}/xp`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rpcResults.get_character_xp_summary);
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/get_character_xp_summary'))!;
    expect(rpc.body).toEqual({ p_character_id: characterId });
  });

  it('hides another users character summary', async () => {
    rpcResults.get_character_xp_summary = null;
    const response = await request('GET', `/api/v1/me/characters/${characterId}/xp`);
    expect(response.statusCode).toBe(404);
  });

  it('rejects malformed system and character IDs before calling RPCs', async () => {
    expect((await request('GET', '/api/v1/owner/game-systems/not-a-uuid/xp')).statusCode).toBe(400);
    expect((await request('GET', '/api/v1/me/characters/not-a-uuid/xp')).statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.startsWith('/rest/v1/rpc/'))).toBe(false);
  });

  it('withholds database error details', async () => {
    databaseFails = true;
    const response = await request('GET', `/api/v1/owner/game-systems/${systemId}/xp`);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private database detail');
  });
});
