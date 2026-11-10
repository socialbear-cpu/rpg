import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';
import { invalidPatches } from './fixtures/profile.js';

const ownerId = 'a72adcaf-9d23-46cc-b312-5fbe7fb6214b';
const otherId = 'eca3f0d5-b21d-4b7e-b5ea-ad8ed5f70c6b';
const authorization = 'Bearer accepted-token';
let rows: { user_id: string; display_name: string; avatar_url: string | null; bio: string | null }[];
let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let databaseFails: boolean;
let authFails: boolean;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  rows = [
    { user_id: ownerId, display_name: 'Owner', avatar_url: null, bio: null },
    { user_id: otherId, display_name: 'Other', avatar_url: null, bio: 'Private' },
  ];
  requests = [];
  databaseFails = false;
  authFails = false;
  // Exercise real auth, repository and Supabase client; replace only external HTTP.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });
    if (url.pathname === '/auth/v1/user') {
      if (authFails) return Response.json({ message: 'Invalid JWT', code: 'bad_jwt' }, { status: 401 });
      return Response.json({
        id: ownerId, aud: 'authenticated', role: 'authenticated',
        email: 'owner@example.com', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (url.pathname !== '/rest/v1/user_profiles') throw new Error(`Unexpected request: ${url}`);
    if (databaseFails) return Response.json({ code: '42501', message: 'private database detail' }, { status: 403 });
    // Filter by the actual emitted query, without simulating RLS: this catches
    // accidental cross-user reads/writes but does not prove database policies.
    const selected = rows.filter((row) => !url.searchParams.has('user_id') ||
      url.searchParams.get('user_id') === `eq.${row.user_id}`);
    if (method === 'PATCH') for (const row of selected) Object.assign(row, body);
    if (method === 'GET') return Response.json(selected);
    if (method === 'PATCH') return Response.json(selected[0] ?? null);
    throw new Error(`Unexpected method: ${method}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function request(method: 'GET' | 'PATCH', payload?: unknown, authorized = true, suffix = '') {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({
      method, url: '/api/v1/me/profile' + suffix,
      headers: { ...(authorized ? { authorization } : {}), 'content-type': 'application/json', 'x-user-id': otherId },
      ...(method === 'PATCH' ? { payload: JSON.stringify(payload) } : {}),
    });
  } finally { await app.close(); }
}

describe('profile API', () => {
  it.each(['GET', 'PATCH'] as const)('requires authentication for %s', async (method) => {
    const response = await request(method, { bio: 'Edit' }, false);
    expect(response.statusCode).toBe(401);
    expect(requests).toHaveLength(0);
  });

  it.each(['GET', 'PATCH'] as const)('rejects an invalid token for %s before database access', async (method) => {
    authFails = true;
    expect((await request(method, { bio: 'Edit' })).statusCode).toBe(401);
    expect(requests.filter(({ url }) => url.pathname.startsWith('/rest/'))).toHaveLength(0);
  });

  it('reads only the verified owner, ignoring caller-supplied identities', async () => {
    const response = await request('GET', undefined, true, `?user_id=${otherId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user_id: ownerId, display_name: 'Owner', avatar_url: null, bio: null });
    const db = requests.filter(({ url }) => url.pathname.startsWith('/rest/'));
    expect(db).toHaveLength(1);
    expect(db[0]!.url.searchParams.get('user_id')).toBe(`eq.${ownerId}`);
    expect(db[0]!.url.searchParams.get('select')).toBe('user_id,display_name,avatar_url,bio');
    expect(db[0]!.headers.get('authorization')).toBe(authorization);
    expect(db[0]!.headers.get('apikey')).toBe('sb_publishable_test');
  });

  it.each([1, 80])('persists trimmed %i-character names, nullable fields and 500-character bio', async (length) => {
    const response = await request('PATCH', {
      display_name: ` ${'x'.repeat(length)} `, bio: 'b'.repeat(500), avatar_url: 'https://example.com/a.png',
    }, true, `?user_id=${otherId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user_id: ownerId, display_name: 'x'.repeat(length), bio: 'b'.repeat(500), avatar_url: 'https://example.com/a.png' });
    expect((await request('PATCH', { bio: null, avatar_url: null })).statusCode).toBe(200);
    expect((await request('GET')).json()).toEqual({ user_id: ownerId, display_name: 'x'.repeat(length), bio: null, avatar_url: null });
    expect(rows[1]).toEqual({ user_id: otherId, display_name: 'Other', avatar_url: null, bio: 'Private' });
    for (const entry of requests.filter(({ url }) => url.pathname.startsWith('/rest/'))) {
      expect(entry.url.searchParams.get('user_id')).toBe(`eq.${ownerId}`);
      expect(entry.headers.get('authorization')).toBe(authorization);
    }
  });

  it.each(invalidPatches.map((body) => [body]))('rejects invalid patch %j without database writes', async (body) => {
    const response = await request('PATCH', body);
    expect(response.statusCode).toBe(400);
    expect(requests.filter(({ url }) => url.pathname.startsWith('/rest/'))).toHaveLength(0);
    expect(rows[0]!.display_name).toBe('Owner');
  });

  it.each(['GET', 'PATCH'] as const)('returns a consistent 404 for missing profile on %s without provisioning', async (method) => {
    rows = rows.filter(({ user_id }) => user_id !== ownerId);
    const response = await request(method, { bio: 'Edit' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Profile not found' });
    expect(rows).toHaveLength(1);
    expect(requests.some(({ method }) => method === 'POST')).toBe(false);
  });

  it.each(['GET', 'PATCH'] as const)('handles database failures on %s without leaking details', async (method) => {
    databaseFails = true;
    const response = await request(method, { bio: 'Edit' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Unable to access profile' });
  });
});
