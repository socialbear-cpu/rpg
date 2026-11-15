import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '22000000-0000-4000-8000-000000000001';
const systemId = '32000000-0000-4000-8000-000000000001';
const characterId = '52000000-0000-4000-8000-000000000001';
const campaignId = '62000000-0000-4000-8000-000000000001';
const createdAt = '2026-11-14T12:00:00.000Z';
let role: 'owner' | 'user';
let isAdmin: boolean;
let character: Record<string, unknown> | null;
let requests: { url: URL; method: string; body: unknown }[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  role = 'owner';
  isAdmin = false;
  character = { id: characterId, user_id: userId, game_system_id: systemId, status: 'active' };
  requests = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {}, created_at: createdAt });
    if (url.pathname === '/rest/v1/rpc/get_my_system_memberships') return Response.json({ is_platform_admin: isAdmin, memberships: [{ game_system_id: systemId, game_system_name: 'Sistema', role }] });
    if (url.pathname === '/rest/v1/characters') return Response.json(character ? [character] : []);
    if (url.pathname === '/rest/v1/rpc/create_system_campaign' && method === 'POST') return Response.json({
      status: 'created',
      campaign: { id: campaignId, game_system_id: systemId, name: 'A Floresta', description: 'Aventura inicial', status: 'active', created_at: createdAt },
      character_id: characterId,
    });
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(payload: unknown) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({ method: 'POST', url: `/api/v1/owner/game-systems/${systemId}/campaigns`, headers: { authorization: 'Bearer campaign-token', 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  } finally { await app.close(); }
}

const input = { character_id: characterId, name: ' A Floresta ', description: ' Aventura inicial ' };

describe('campaign creation API', () => {
  it.each(['owner', 'admin'])('lets a system %s create a campaign with their active character as game master', async (who) => {
    if (who === 'admin') isAdmin = true;
    const response = await request(input);
    expect(response.statusCode).toBe(201);
    expect(response.json().campaign).toMatchObject({ id: campaignId, game_system_id: systemId, name: 'A Floresta', description: 'Aventura inicial', status: 'active' });
    const createCall = requests.find(({ url, method }) => url.pathname === '/rest/v1/rpc/create_system_campaign' && method === 'POST');
    expect(createCall?.body).toEqual({ p_game_system_id: systemId, p_character_id: characterId, p_name: 'A Floresta', p_description: 'Aventura inicial' });
    expect(requests.some(({ url, method }) => method === 'POST' && ['/rest/v1/campaigns', '/rest/v1/campaign_members'].includes(url.pathname))).toBe(false);
  });

  it('blocks a regular system member before writing a campaign', async () => {
    role = 'user';
    const response = await request(input);
    expect(response.statusCode).toBe(403);
    expect(requests.some(({ url, method }) => method === 'POST' && ['/rest/v1/campaigns', '/rest/v1/campaign_members'].includes(url.pathname))).toBe(false);
  });

  it.each([
    ['inactive', { ...{ id: characterId, user_id: userId, game_system_id: systemId }, status: 'inactive' }],
    ['owned by another user', { id: characterId, user_id: '22000000-0000-4000-8000-000000000099', game_system_id: systemId, status: 'active' }],
    ['in another system', { id: characterId, user_id: userId, game_system_id: '32000000-0000-4000-8000-000000000099', status: 'active' }],
  ])('rejects a character that is %s', async (_description, row) => {
    character = row;
    const response = await request(input);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Character not found' });
    expect(requests.some(({ url, method }) => method === 'POST' && ['/rest/v1/campaigns', '/rest/v1/campaign_members'].includes(url.pathname))).toBe(false);
  });

  it('rejects blank campaign names before writing', async () => {
    const response = await request({ ...input, name: '   ' });
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ url, method }) => method === 'POST' && ['/rest/v1/campaigns', '/rest/v1/campaign_members'].includes(url.pathname))).toBe(false);
  });
});
