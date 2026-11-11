import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '27000000-0000-4000-8000-000000000001';
const systemId = '37000000-0000-4000-8000-000000000001';
const characterId = '57000000-0000-4000-8000-000000000001';
const authorization = 'Bearer accepted-token';
const system = { id: systemId, slug: 'forest-system-a1b2c3d4', name: 'Forest System', description: null };
const fields = [{ key: 'origin', label: 'Origem', type: 'short_text', required: true, position: 0, show_on_card: true }];
const character = {
  id: characterId,
  game_system_id: systemId,
  character_name: 'Liora',
  attributes: { origin: 'Floresta' },
  status: 'active',
};

let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let databaseFails: boolean;
let missingSystem: boolean;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  databaseFails = false;
  missingSystem = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });

    if (url.pathname === '/auth/v1/user') {
      return Response.json({
        id: userId, aud: 'authenticated', role: 'authenticated', email: 'player@example.test',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (databaseFails) return Response.json({ message: 'private database detail', code: 'XX000' }, { status: 500 });

    if (url.pathname === '/rest/v1/rpc/create_game_system_with_sheet') {
      return Response.json({ status: 'created', system, fields });
    }
    if (url.pathname === '/rest/v1/game_systems' && method === 'GET') {
      return Response.json(missingSystem ? [] : [system]);
    }
    if (url.pathname === '/rest/v1/game_system_character_sheets') {
      if (missingSystem) {
        return Response.json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }, { status: 406 });
      }
      return Response.json({ game_system_id: systemId, fields });
    }
    if (url.pathname === '/rest/v1/characters' && method === 'GET') return Response.json([character]);
    if (url.pathname === '/rest/v1/characters' && method === 'POST') return Response.json(character);
    throw new Error(`Unexpected request: ${method} ${url}`);
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
      method,
      url,
      headers: { ...(authorized ? { authorization } : {}), 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  } finally {
    await app.close();
  }
}

describe('game system and character API', () => {
  it('lists active systems visible to the caller', async () => {
    const response = await request('GET', '/api/v1/game-systems');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ systems: [system] });
    expect(requests.find(({ url }) => url.pathname === '/rest/v1/game_systems')?.url.searchParams.get('is_active')).toBe('eq.true');
  });

  it('creates a system and its sheet through one RPC', async () => {
    const response = await request('POST', '/api/v1/game-systems', { name: 'Forest System', description: null, fields });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ system, fields });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/create_game_system_with_sheet'))!;
    expect(rpc.body).toEqual({ p_name: 'Forest System', p_description: null, p_fields: fields });
  });

  it('reads a system sheet', async () => {
    const response = await request('GET', `/api/v1/game-systems/${systemId}/character-sheet`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ game_system_id: systemId, fields });
  });

  it("lists only the caller's active characters in the requested system", async () => {
    const response = await request('GET', `/api/v1/game-systems/${systemId}/characters`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ characters: [character] });
    const query = requests.find(({ url }) => url.pathname === '/rest/v1/characters')!.url.searchParams;
    expect(query.get('user_id')).toBe(`eq.${userId}`);
    expect(query.get('game_system_id')).toBe(`eq.${systemId}`);
    expect(query.get('status')).toBe('eq.active');
  });

  it('rejects invalid characters before insert', async () => {
    const response = await request('POST', `/api/v1/game-systems/${systemId}/characters`, {
      character_name: 'Liora', attributes: {},
    });
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ url, method }) => url.pathname === '/rest/v1/characters' && method === 'POST')).toBe(false);
  });

  it('creates a character with the authenticated user ID', async () => {
    const response = await request('POST', `/api/v1/game-systems/${systemId}/characters`, {
      character_name: '  Liora  ', attributes: { origin: '  Floresta  ' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ character });
    const insert = requests.find(({ url, method }) => url.pathname === '/rest/v1/characters' && method === 'POST')!;
    expect(insert.body).toEqual({
      user_id: userId, game_system_id: systemId, character_name: 'Liora', attributes: { origin: 'Floresta' }, status: 'active',
    });
  });

  it('requires authentication before reading or writing systems and characters', async () => {
    expect((await request('GET', '/api/v1/game-systems', undefined, false)).statusCode).toBe(401);
    expect((await request('POST', '/api/v1/game-systems', { name: 'System', fields: [] }, false)).statusCode).toBe(401);
    expect(requests.filter(({ url }) => url.pathname.startsWith('/rest/'))).toHaveLength(0);
  });

  it('maps missing systems and database errors safely', async () => {
    missingSystem = true;
    expect((await request('GET', `/api/v1/game-systems/${systemId}/character-sheet`)).statusCode).toBe(404);
    missingSystem = false;
    databaseFails = true;
    const response = await request('GET', '/api/v1/game-systems');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private database detail');
  });
});
