import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '20000000-0000-4000-8000-000000000001';
const systemId = '30000000-0000-4000-8000-000000000001';
const eventId = '70000000-0000-4000-8000-000000000001';
const startsAt = '2026-12-12T18:00:00.000Z';
const endsAt = '2026-12-12T20:00:00.000Z';
let role: 'owner' | 'user';
let isAdmin: boolean;
let accessStatus: string;
let requests: { url: URL; method: string; body: unknown }[];
let events: Record<string, unknown>[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  role = 'user';
  isAdmin = false;
  accessStatus = 'ok';
  requests = [];
  events = [{ id: eventId, game_system_id: systemId, title: 'Sessão zero', description: null, starts_at: startsAt, ends_at: endsAt, created_at: startsAt, updated_at: startsAt }];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'event@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    if (url.pathname === '/rest/v1/rpc/join_game_system_with_password') return Response.json({ status: accessStatus });
    if (url.pathname === '/rest/v1/rpc/get_my_system_memberships') return Response.json({ is_platform_admin: isAdmin, memberships: [{ game_system_id: systemId, game_system_name: 'Sistema', role }] });
    if (url.pathname === '/rest/v1/game_system_events') {
      if (method === 'GET') return Response.json(events);
      if (method === 'POST') return Response.json({ ...(body as object), id: eventId, created_at: startsAt, updated_at: startsAt });
      if (method === 'PATCH') return Response.json({ ...(events[0] ?? {}), ...(body as object) });
      if (method === 'DELETE') return Response.json({ id: eventId });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({ method, url: path, headers: { authorization: 'Bearer event-token', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) });
  } finally { await app.close(); }
}

const memberPath = `/api/v1/game-systems/${systemId}/events`;
const ownerPath = `/api/v1/owner/game-systems/${systemId}/events`;
const input = { title: ' Sessão zero ', description: '', starts_at: startsAt, ends_at: endsAt };

describe('system events API', () => {
  it('publishes event routes and request fields in the API schema', async () => {
    const app = buildApp({ nodeEnv: 'development' });
    try {
      const response = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(response.statusCode).toBe(200);
      const body = response.json().paths['/api/v1/owner/game-systems/{systemId}/events'].post.requestBody.content['application/json'].schema;
      expect(body).toMatchObject({ required: ['title', 'starts_at', 'ends_at'], properties: { title: { minLength: 1, maxLength: 120 }, description: { maxLength: 2000 } } });
    } finally { await app.close(); }
  });

  it('lets a system member read events scoped and ordered by system start time', async () => {
    const response = await request('GET', memberPath);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ events });
    const query = requests.find(({ url }) => url.pathname === '/rest/v1/game_system_events')!;
    expect(query.url.searchParams.get('game_system_id')).toBe(`eq.${systemId}`);
    expect(query.url.searchParams.get('order')).toBe('starts_at.asc,id.asc');
  });

  it.each(['owner', 'admin'])('allows %s to create a system event', async (who) => {
    if (who === 'owner') role = 'owner';
    else isAdmin = true;
    const response = await request('POST', ownerPath, input);
    expect(response.statusCode).toBe(201);
    expect(response.json().event).toMatchObject({ game_system_id: systemId, title: 'Sessão zero', description: null, starts_at: startsAt, ends_at: endsAt });
    const write = requests.find(({ method, url }) => method === 'POST' && url.pathname === '/rest/v1/game_system_events')!;
    expect(write.url.pathname).toBe('/rest/v1/game_system_events');
    expect(write.body).toEqual({ game_system_id: systemId, title: 'Sessão zero', description: null, starts_at: startsAt, ends_at: endsAt });
  });

  it('lets a platform Admin manage events in a private system without joining it', async () => {
    isAdmin = true;
    accessStatus = 'password_required';
    const response = await request('POST', ownerPath, input);
    expect(response.statusCode).toBe(201);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/rpc/join_game_system_with_password')).toBe(false);
  });

  it('blocks a non-owner from creating events before writing', async () => {
    const response = await request('POST', ownerPath, input);
    expect(response.statusCode).toBe(403);
    expect(requests.some(({ method, url }) => method !== 'GET' && url.pathname === '/rest/v1/game_system_events')).toBe(false);
  });

  it('updates and deletes only events in the selected system', async () => {
    role = 'owner';
    const updated = await request('PUT', `${ownerPath}/${eventId}`, { ...input, title: 'Sessão inicial' });
    expect(updated.statusCode).toBe(200);
    const patch = requests.find(({ method }) => method === 'PATCH')!;
    expect(patch.url.searchParams.get('id')).toBe(`eq.${eventId}`);
    expect(patch.url.searchParams.get('game_system_id')).toBe(`eq.${systemId}`);
    expect(patch.body).toMatchObject({ title: 'Sessão inicial' });

    const removed = await request('DELETE', `${ownerPath}/${eventId}`);
    expect(removed.statusCode).toBe(204);
    const deletion = requests.find(({ method }) => method === 'DELETE')!;
    expect(deletion.url.searchParams.get('id')).toBe(`eq.${eventId}`);
    expect(deletion.url.searchParams.get('game_system_id')).toBe(`eq.${systemId}`);
  });

  it('rejects empty titles and end times that do not follow the start before database writes', async () => {
    role = 'owner';
    expect((await request('POST', ownerPath, { ...input, title: '  ' })).statusCode).toBe(400);
    expect((await request('POST', ownerPath, { ...input, ends_at: startsAt })).statusCode).toBe(400);
    expect(requests.some(({ method, url }) => method === 'POST' && url.pathname === '/rest/v1/game_system_events')).toBe(false);
  });
});
