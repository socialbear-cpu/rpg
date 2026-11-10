import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHealth } from '../app/healthz/route.js';
import { GET as getProfile, PATCH as patchProfile } from '../app/api/v1/me/profile/route.js';

const ownerId = 'a72adcaf-9d23-46cc-b312-5fbe7fb6214b';
const authorization = 'Bearer accepted-token';
let profile: { user_id: string; display_name: string; avatar_url: string | null; bio: string | null } | null;
let authFails: boolean;
let authUnavailable: boolean;
let databaseFails: boolean;
let databaseRequests = 0;
let databaseUserFilters: string[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  profile = { user_id: ownerId, display_name: 'Owner', avatar_url: null, bio: null };
  authFails = false;
  authUnavailable = false;
  databaseFails = false;
  databaseRequests = 0;
  databaseUserFilters = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/auth/v1/user') {
      if (authUnavailable) throw new Error('Auth unavailable');
      return authFails
        ? Response.json({ message: 'Invalid JWT', code: 'bad_jwt' }, { status: 401 })
        : Response.json({ id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    }
    databaseRequests += 1;
    databaseUserFilters.push(url.searchParams.get('user_id') ?? '');
    if (databaseFails) return Response.json({ message: 'private database detail' }, { status: 403 });
    if (method === 'GET') return Response.json(profile ? [profile] : []);
    if (method === 'PATCH') {
      profile = { ...profile!, ...JSON.parse(String(init?.body)) };
      return Response.json([profile]);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function request(method: 'GET' | 'PATCH', body?: unknown, token = authorization, contentType = 'application/json', path = '/api/v1/me/profile') {
  return new Request(`https://rpg.example${path}`, {
    method,
    headers: { ...(token ? { authorization: token } : {}), ...(method === 'PATCH' ? { 'content-type': contentType } : {}) },
    ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}),
  });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe('Next.js same-origin routes', () => {
  it('returns the public health contract without Supabase configuration', async () => {
    vi.unstubAllEnvs();
    expect(await json(await getHealth())).toEqual({ status: 200, body: { status: 'ok' } });
  });

  it.each(['', 'Basic invalid', 'Bearer invalid token'])('rejects missing or malformed bearer auth (%s) before database access', async (token) => {
    authFails = true;
    const response = await getProfile(request('GET', undefined, token));
    expect(await json(response)).toEqual({ status: 401, body: { error: 'Unauthorized' } });
    expect(databaseRequests).toBe(0);
  });

  it('reads the authenticated profile', async () => {
    expect(await json(await getProfile(request('GET')))).toEqual({
      status: 200,
      body: { user_id: ownerId, display_name: 'Owner', avatar_url: null, bio: null },
    });
  });

  it('ignores a caller-supplied user_id and filters by verified identity', async () => {
    const otherId = 'eca3f0d5-b21d-4b7e-b5ea-ad8ed5f70c6b';
    const response = await getProfile(request('GET', undefined, authorization, 'application/json', `?user_id=${otherId}`));
    expect((await json(response)).body).toMatchObject({ user_id: ownerId, display_name: 'Owner' });
    expect(databaseUserFilters).toEqual([`eq.${ownerId}`]);
  });

  it('rejects an expired token that has valid bearer syntax before database access', async () => {
    authFails = true;
    const response = await getProfile(request('GET', undefined, 'Bearer expired-token'));
    expect(await json(response)).toEqual({ status: 401, body: { error: 'Unauthorized' } });
    expect(databaseRequests).toBe(0);
  });

  it('treats an unavailable Supabase Auth service as unauthorized', async () => {
    authUnavailable = true;
    const response = await getProfile(request('GET'));
    expect(await json(response)).toEqual({ status: 401, body: { error: 'Unauthorized' } });
    expect(databaseRequests).toBe(0);
  });

  it('updates supported fields and trims display_name', async () => {
    expect(await json(await patchProfile(request('PATCH', { display_name: ' Player ', bio: null })))).toEqual({
      status: 200,
      body: { user_id: ownerId, display_name: 'Player', avatar_url: null, bio: null },
    });
  });

  it('rejects unsupported PATCH content types', async () => {
    const response = await patchProfile(request('PATCH', { bio: 'text' }, authorization, 'text/plain'));
    expect(await json(response)).toEqual({ status: 415, body: { error: 'Unsupported Media Type' } });
    expect(databaseRequests).toBe(0);
  });

  it.each([{}, { display_name: '  ' }, { unknown: true }, { avatar_url: 'ftp://example.com/a.png' }, { bio: 'x'.repeat(501) }])(
    'rejects an invalid profile patch %j without a database request', async (body) => {
      const response = await patchProfile(request('PATCH', body));
      expect(await json(response)).toEqual({ status: 400, body: { error: 'Invalid profile patch' } });
      expect(databaseRequests).toBe(0);
    },
  );

  it('returns 404 for a missing profile without provisioning', async () => {
    profile = null;
    expect(await json(await getProfile(request('GET')))).toEqual({ status: 404, body: { error: 'Profile not found' } });
  });

  it('returns a generic 500 on database failure', async () => {
    databaseFails = true;
    expect(await json(await getProfile(request('GET')))).toEqual({ status: 500, body: { error: 'Unable to access profile' } });
  });
});
