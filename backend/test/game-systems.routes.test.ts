import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '27000000-0000-4000-8000-000000000001';
const systemId = '37000000-0000-4000-8000-000000000001';
const characterId = '57000000-0000-4000-8000-000000000001';
const authorization = 'Bearer accepted-token';
const system = { id: systemId, slug: 'forest-system-a1b2c3d4', name: 'Forest System', description: null };
const definition = {
  version: 1 as const,
  steps: [{ key: 'identity', label: 'Identidade', position: 0, components: [
    { key: 'origin', label: 'Origem', type: 'short_text' as const, required: true, position: 0, width: 'full' as const, show_on_card: true },
  ] }],
};
const visualDefinition = {
  ...definition,
  steps: [{
    ...definition.steps[0]!,
    elements: [{ key: 'portrait', type: 'image' as const, image_url: 'https://cdn.example/portrait.jpg', description: 'Retrato do personagem', x: 60, y: 5, width: 30, height: 40, rotation: 0 }],
  }],
};
const interactiveDefinition = {
  version: 1 as const,
  steps: [
    { key: 'origin', label: 'Origem', position: 0, components: [
      { key: 'origin', label: 'Origem', type: 'short_text' as const, required: true, position: 0, width: 'full' as const, show_on_card: false },
    ] },
    { key: 'choices', label: 'Escolhas', position: 1, condition: { logic: 'all' as const, rules: [{ component_key: 'origin', operator: 'is_filled' as const }] }, components: [
      {
        key: 'interests', label: 'Interesses', type: 'single_select' as const, required: true, position: 0,
        width: 'full' as const, show_on_card: true, presentation: 'canvas' as const, selection_mode: 'multiple' as const,
        options: [
          { label: 'Mapas', value: 'maps', image_url: 'https://cdn.example/maps.jpg', description: 'Explorar o mundo', x: 5, y: 5, width: 40, height: 45, rotation: -5 },
          { label: 'Guildas', value: 'guilds', x: 55, y: 5, width: 40, height: 45, rotation: 0 },
        ],
      },
    ] },
  ],
};
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
let updateResult: 'ok' | 'forbidden' | 'not_found' | 'invalid';

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  databaseFails = false;
  missingSystem = false;
  updateResult = 'ok';
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
      return Response.json({ status: 'created', system, definition: (body as { p_fields?: unknown } | null)?.p_fields ?? definition });
    }
    if (url.pathname === '/rest/v1/rpc/update_game_system_character_sheet') {
      if (updateResult === 'forbidden') return Response.json({ message: 'Only system owner', code: '42501' }, { status: 403 });
      if (updateResult === 'not_found') return Response.json({ message: 'Not found', code: 'P0002' }, { status: 404 });
      if (updateResult === 'invalid') return Response.json({ message: 'Invalid definition', code: '22023' }, { status: 400 });
      return Response.json({ game_system_id: systemId, definition: body && typeof body === 'object' ? (body as { p_definition: unknown }).p_definition : definition });
    }
    if (url.pathname === '/rest/v1/game_systems' && method === 'PATCH') {
      if (updateResult === 'forbidden') return Response.json({ message: 'Only system owner', code: '42501' }, { status: 403 });
      if (updateResult === 'not_found') return Response.json([]);
      const payload = body as { name: string; description: string | null };
      return Response.json([{ ...system, ...payload }]);
    }
    if (url.pathname === '/rest/v1/game_systems' && method === 'GET') {
      return Response.json(missingSystem ? [] : [system]);
    }
    if (url.pathname === '/rest/v1/game_system_character_sheets') {
      if (missingSystem) {
        return Response.json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }, { status: 406 });
      }
      return Response.json({ game_system_id: systemId, definition });
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

async function request(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, authorized = true) {
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
    const response = await request('POST', '/api/v1/game-systems', { name: 'Forest System', description: null, definition });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ system, definition });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/create_game_system_with_sheet'))!;
    expect(rpc.body).toEqual({ p_name: 'Forest System', p_description: null, p_fields: definition });
  });

  it('updates system name and description for its owner', async () => {
    const response = await request('PUT', `/api/v1/game-systems/${systemId}`, { name: 'Updated System', description: 'Updated description' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ system: { ...system, name: 'Updated System', description: 'Updated description' } });
    const update = requests.find(({ url, method }) => url.pathname === '/rest/v1/game_systems' && method === 'PATCH')!;
    expect(update.body).toEqual({ name: 'Updated System', description: 'Updated description' });
    expect(update.url.searchParams.get('id')).toBe(`eq.${systemId}`);
  });

  it('rejects invalid, unauthorized, and missing system metadata updates', async () => {
    const url = `/api/v1/game-systems/${systemId}`;
    expect((await request('PUT', url, { name: ' ', description: null })).statusCode).toBe(400);
    updateResult = 'forbidden';
    expect((await request('PUT', url, { name: 'Updated System', description: null })).statusCode).toBe(403);
    updateResult = 'not_found';
    expect((await request('PUT', url, { name: 'Updated System', description: null })).statusCode).toBe(404);
    expect((await request('PUT', url, { name: 'Updated System', description: null }, false)).statusCode).toBe(401);
  });

  it('creates and returns sheets with positioned visual elements', async () => {
    const response = await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition: visualDefinition });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ system, definition: visualDefinition });
  });

  it('creates and updates sheets with conditional image-choice configuration', async () => {
    const created = await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition: interactiveDefinition });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ system, definition: interactiveDefinition });

    const updated = await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition: interactiveDefinition });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ definition: interactiveDefinition });
  });

  it('reads a system sheet', async () => {
    const response = await request('GET', `/api/v1/game-systems/${systemId}/character-sheet`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ game_system_id: systemId, definition });
  });

  it('updates a system sheet through the owner-checked RPC', async () => {
    const updated = structuredClone(definition);
    updated.steps[0]!.label = 'Origem';
    const response = await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition: updated });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ definition: updated });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/update_game_system_character_sheet'))!;
    expect(rpc.body).toEqual({ p_system_id: systemId, p_definition: updated });
  });

  it('updates and returns sheets with positioned visual elements', async () => {
    const response = await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition: visualDefinition });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ definition: visualDefinition });
  });

  it('rejects invalid, unauthorized, and missing sheet updates', async () => {
    const invalid = await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition: { version: 1, steps: [] } });
    expect(invalid.statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/update_game_system_character_sheet'))).toBe(false);

    updateResult = 'forbidden';
    expect((await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition })).statusCode).toBe(403);
    updateResult = 'not_found';
    expect((await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition })).statusCode).toBe(404);
    expect((await request('PUT', `/api/v1/game-systems/${systemId}/character-sheet`, { definition }, false)).statusCode).toBe(401);
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
    expect((await request('POST', '/api/v1/game-systems', { name: 'System', definition }, false)).statusCode).toBe(401);
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
