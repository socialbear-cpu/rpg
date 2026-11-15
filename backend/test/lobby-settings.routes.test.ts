import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '23000000-0000-4000-8000-000000000001';
const systemId = '33000000-0000-4000-8000-000000000001';
const savedAt = '2026-11-14T12:00:00.000Z';
let role: 'owner' | 'user';
let isAdmin: boolean;
let savedSettings: Record<string, unknown> | null;
let requests: { url: URL; method: string; body: unknown }[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  role = 'user';
  isAdmin = false;
  savedSettings = null;
  requests = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'settings@example.test', app_metadata: {}, user_metadata: {}, created_at: savedAt });
    if (url.pathname === '/rest/v1/rpc/get_my_system_memberships') return Response.json({ is_platform_admin: isAdmin, memberships: [{ game_system_id: systemId, game_system_name: 'Sistema', role }] });
    if (url.pathname === '/rest/v1/rpc/join_game_system_with_password') return Response.json({ status: 'ok' });
    if (url.pathname === '/rest/v1/game_system_lobby_settings') {
      if (method === 'GET') return Response.json(savedSettings ? [savedSettings] : []);
      if (method === 'POST') {
        savedSettings = { game_system_id: systemId, ...(body as object), updated_at: savedAt };
        return Response.json(savedSettings);
      }
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(method: 'GET' | 'PUT', path: string, payload?: unknown) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({ method, url: path, headers: { authorization: 'Bearer settings-token', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) });
  } finally { await app.close(); }
}

const memberPath = `/api/v1/game-systems/${systemId}/lobby-settings`;
const ownerPath = `/api/v1/owner/game-systems/${systemId}/lobby-settings`;
const settings = {
  section_order: ['system-presentation', 'chat', 'store', 'events', 'matchmaking', 'character-sheet'],
  hidden_sections: ['matchmaking'],
  welcome_title: 'Bem-vindos à Floresta',
  welcome_message: 'Preparem seus personagens.',
  accent_color: '#8B5CF6',
};

describe('lobby settings API', () => {
  it('returns default presentation settings when the Owner has not customized the lobby', async () => {
    const response = await request('GET', memberPath);
    expect(response.statusCode).toBe(200);
    expect(response.json().settings).toEqual({
      section_order: ['system-presentation', 'matchmaking', 'store', 'chat', 'events', 'character-sheet'],
      hidden_sections: [],
      welcome_title: 'Bem-vindo à aventura',
      welcome_message: 'Escolha onde sua próxima história começa.',
      accent_color: '#8B5CF6',
    });
  });

  it('lets an Owner save the lobby section order, visibility, text and accent color', async () => {
    role = 'owner';
    const response = await request('PUT', ownerPath, settings);
    expect(response.statusCode).toBe(200);
    expect(response.json().settings).toMatchObject(settings);
    expect(requests.find(({ method, url }) => method === 'POST' && url.pathname === '/rest/v1/game_system_lobby_settings')?.body).toMatchObject({ game_system_id: systemId, ...settings });
  });

  it('lets a platform Admin save settings without a system membership', async () => {
    isAdmin = true;
    const response = await request('PUT', ownerPath, settings);
    expect(response.statusCode).toBe(200);
  });

  it('blocks regular members from changing the lobby settings before writing', async () => {
    const response = await request('PUT', ownerPath, settings);
    expect(response.statusCode).toBe(403);
    expect(requests.some(({ method, url }) => method === 'POST' && url.pathname === '/rest/v1/game_system_lobby_settings')).toBe(false);
  });

  it.each([
    ['unknown section', { ...settings, section_order: [...settings.section_order, 'secret-section'] }],
    ['duplicate section', { ...settings, section_order: [...settings.section_order, 'store'] }],
    ['duplicate hidden section', { ...settings, hidden_sections: ['matchmaking', 'matchmaking'] }],
    ['invalid accent color', { ...settings, accent_color: 'purple' }],
  ])('rejects %s without changing saved settings', async (_description, payload) => {
    role = 'owner';
    const response = await request('PUT', ownerPath, payload);
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ method, url }) => method === 'POST' && url.pathname === '/rest/v1/game_system_lobby_settings')).toBe(false);
  });
});
