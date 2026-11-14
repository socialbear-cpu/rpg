import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '27000000-0000-4000-8000-000000000001';
const systemId = '37000000-0000-4000-8000-000000000001';
const characterId = '57000000-0000-4000-8000-000000000001';
const authorization = 'Bearer accepted-token';
const system = {
  id: systemId,
  slug: 'forest-system-a1b2c3d4',
  name: 'Forest System',
  description: null,
  is_public: true,
  cover_image_path: null,
  cover_focus_x: 50,
  cover_focus_y: 50,
  tags: [],
  play_mode: 'text' as const,
};
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
let accessStatus: 'ok' | 'unauthorized' | 'not_found' | 'password_required' | 'invalid_password' | 'rate_limited';

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  databaseFails = false;
  missingSystem = false;
  updateResult = 'ok';
  accessStatus = 'ok';
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

    if (url.pathname === '/rest/v1/rpc/create_game_system_with_metadata') {
      return Response.json({ status: 'created', system, definition: (body as { p_fields?: unknown } | null)?.p_fields ?? definition });
    }
    if (url.pathname === '/rest/v1/rpc/join_game_system_with_password') {
      return Response.json({ status: missingSystem ? 'not_found' : accessStatus });
    }
    if (url.pathname === '/rest/v1/rpc/update_game_system_profile') {
      if (updateResult === 'forbidden') return Response.json({ status: 'not_owner', system: null });
      if (updateResult === 'not_found') return Response.json({ status: 'not_found', system: null });
      if (updateResult === 'invalid') return Response.json({ status: 'invalid_details', system: null });
      const payload = body as { p_name: string; p_description: string | null; p_is_public: boolean; p_play_mode: 'text' | 'voice'; p_tags: string[]; p_cover_image_path: string | null; p_cover_focus_x: number; p_cover_focus_y: number };
      return Response.json({ status: 'updated', system: {
        ...system,
        name: payload.p_name,
        description: payload.p_description,
        is_public: payload.p_is_public,
        play_mode: payload.p_play_mode,
        tags: payload.p_tags,
        cover_image_path: payload.p_cover_image_path,
        cover_focus_x: payload.p_cover_focus_x,
        cover_focus_y: payload.p_cover_focus_y,
      } });
    }
    if (url.pathname === '/rest/v1/rpc/update_game_system_character_sheet') {
      if (updateResult === 'forbidden') return Response.json({ message: 'Only system owner', code: '42501' }, { status: 403 });
      if (updateResult === 'not_found') return Response.json({ message: 'Not found', code: 'P0002' }, { status: 404 });
      if (updateResult === 'invalid') return Response.json({ message: 'Invalid definition', code: '22023' }, { status: 400 });
      return Response.json({ game_system_id: systemId, definition: body && typeof body === 'object' ? (body as { p_definition: unknown }).p_definition : definition });
    }
    if (url.pathname === '/rest/v1/game_systems' && method === 'GET') {
      return Response.json(missingSystem ? [] : [system]);
    }
    if (url.pathname === '/rest/v1/game_system_tag_catalog') {
      return Response.json(url.searchParams.has('is_active') ? [] : [{ slug: 'fantasia', label: 'Fantasia' }]);
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
  const systemSettings = {
    name: 'Updated System',
    description: 'Updated description',
    is_public: true,
    play_mode: 'voice' as const,
    tags: ['fantasia'],
    cover_image_path: null,
    cover_focus_x: 50,
    cover_focus_y: 50,
  };

  it('lists active systems visible to the caller', async () => {
    const response = await request('GET', '/api/v1/game-systems');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ systems: [system] });
    expect(requests.find(({ url }) => url.pathname === '/rest/v1/game_systems')?.url.searchParams.get('is_active')).toBe('eq.true');
  });

  it('lists the platform tag options', async () => {
    const response = await request('GET', '/api/v1/game-system-tags');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tags: [] });
  });

  it('creates a system and its sheet through one metadata RPC', async () => {
    const response = await request('POST', '/api/v1/game-systems', { name: 'Forest System', description: null, definition, play_mode: 'text', tags: [] });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ system, definition });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/create_game_system_with_metadata'))!;
    expect(rpc.body).toEqual({ p_name: 'Forest System', p_description: null, p_fields: definition, p_play_mode: 'text', p_tags: [] });
  });

  it('updates system metadata for its owner', async () => {
    const response = await request('PUT', `/api/v1/game-systems/${systemId}`, systemSettings);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ system: { ...system, ...systemSettings, tags: [{ slug: 'fantasia', label: 'Fantasia' }] } });
    const update = requests.find(({ url }) => url.pathname.endsWith('/update_game_system_profile'))!;
    expect(update.body).toEqual({
      p_system_id: systemId,
      p_name: 'Updated System',
      p_description: 'Updated description',
      p_is_public: true,
      p_password: null,
      p_play_mode: 'voice',
      p_tags: ['fantasia'],
      p_cover_image_path: null,
      p_cover_focus_x: 50,
      p_cover_focus_y: 50,
    });
  });

  it('rejects invalid, unauthorized, and missing system metadata updates', async () => {
    const url = `/api/v1/game-systems/${systemId}`;
    expect((await request('PUT', url, { name: ' ', description: null })).statusCode).toBe(400);
    updateResult = 'forbidden';
    expect((await request('PUT', url, systemSettings)).statusCode).toBe(403);
    updateResult = 'not_found';
    expect((await request('PUT', url, systemSettings)).statusCode).toBe(404);
    updateResult = 'invalid';
    expect((await request('PUT', url, systemSettings)).statusCode).toBe(400);
    expect((await request('PUT', url, systemSettings, false)).statusCode).toBe(401);
  });

  it('requires a valid play mode and caps the selected tags', async () => {
    expect((await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition, tags: [] })).statusCode).toBe(400);
    expect((await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition, play_mode: 'text', tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).statusCode).toBe(400);
    expect((await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition, play_mode: 'text', tags: ['fantasia', 'fantasia'] })).statusCode).toBe(400);
  });

  it('creates and returns sheets with positioned visual elements', async () => {
    const response = await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition: visualDefinition, play_mode: 'text', tags: [] });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ system, definition: visualDefinition });
  });

  it('creates and updates sheets with conditional image-choice configuration', async () => {
    const created = await request('POST', '/api/v1/game-systems', { name: 'Forest System', definition: interactiveDefinition, play_mode: 'text', tags: [] });
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

  it('requires system authorization before returning a protected sheet', async () => {
    accessStatus = 'password_required';
    const response = await request('GET', `/api/v1/game-systems/${systemId}/character-sheet`);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Este sistema exige uma senha de acesso.' });
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/game_system_character_sheets')).toBe(false);
  });

  it('validates a password through the backend access endpoint', async () => {
    const response = await request('POST', `/api/v1/game-systems/${systemId}/access`, { system_password: 'a-secure-password' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'authorized' });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/join_game_system_with_password'))!;
    expect(rpc.body).toEqual({ p_system_id: systemId, p_password: 'a-secure-password' });
  });

  it('rejects incorrect passwords and malformed access payloads', async () => {
    accessStatus = 'invalid_password';
    const rejected = await request('POST', `/api/v1/game-systems/${systemId}/access`, { system_password: 'wrong-password' });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toEqual({ error: 'A senha do sistema está incorreta.' });
    expect((await request('POST', `/api/v1/game-systems/${systemId}/access`, { unexpected: true })).statusCode).toBe(400);
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
