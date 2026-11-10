import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '26000000-0000-4000-8000-000000000001';
const memberId = '26000000-0000-4000-8000-000000000002';
const systemId = '36000000-0000-4000-8000-000000000001';
const authorization = 'Bearer accepted-token';
let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let assignmentStatus: string;
let databaseFails: boolean;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  assignmentStatus = 'updated';
  databaseFails = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });
    if (url.pathname === '/auth/v1/user') {
      return Response.json({
        id: userId, aud: 'authenticated', role: 'authenticated',
        email: 'owner@example.test', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (databaseFails) return Response.json({ message: 'private database detail', code: 'XX000' }, { status: 500 });
    if (url.pathname === '/rest/v1/rpc/get_my_system_memberships') {
      return Response.json({
        is_platform_admin: false,
        memberships: [{ game_system_id: systemId, game_system_name: 'System A', role: 'owner' }],
      });
    }
    if (url.pathname === '/rest/v1/rpc/set_system_moderator') {
      return Response.json({ status: assignmentStatus });
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
      headers: { ...(authorized ? { authorization } : {}), 'content-type': 'application/json', 'x-user-id': memberId },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  } finally { await app.close(); }
}

describe('system membership API', () => {
  it('returns the authenticated user’s system roles and global admin flag', async () => {
    const response = await request('GET', '/api/v1/me/system-memberships');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      is_platform_admin: false,
      memberships: [{ game_system_id: systemId, game_system_name: 'System A', role: 'owner' }],
    });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/get_my_system_memberships'))!;
    expect(rpc.method).toBe('POST');
    expect(rpc.body).toEqual({});
    expect(rpc.headers.get('authorization')).toBe(authorization);
  });

  it('allows an Owner to assign or remove a Mod through the database RPC', async () => {
    const response = await request('PUT', `/api/v1/owner/game-systems/${systemId}/members/${memberId}/moderator`, { is_moderator: true });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'updated' });
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/set_system_moderator'))!;
    expect(rpc.body).toEqual({ p_game_system_id: systemId, p_user_id: memberId, p_is_moderator: true });
    expect(rpc.headers.get('authorization')).toBe(authorization);
  });

  it('requires a verified session before reading or changing memberships', async () => {
    expect((await request('GET', '/api/v1/me/system-memberships', undefined, false)).statusCode).toBe(401);
    expect((await request('PUT', `/api/v1/owner/game-systems/${systemId}/members/${memberId}/moderator`, { is_moderator: true }, false)).statusCode).toBe(401);
    expect(requests.filter(({ url }) => url.pathname.startsWith('/rest/'))).toHaveLength(0);
  });

  it('rejects malformed role changes before calling the database', async () => {
    expect((await request('PUT', `/api/v1/owner/game-systems/${systemId}/members/${memberId}/moderator`, { is_moderator: true, role: 'owner' })).statusCode).toBe(400);
    expect((await request('PUT', `/api/v1/owner/game-systems/not-a-uuid/members/${memberId}/moderator`, { is_moderator: true })).statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/set_system_moderator'))).toBe(false);
  });

  it.each([
    ['not_owner', 403],
    ['invalid_member', 404],
  ])('maps database status %s to HTTP %i', async (status, expectedCode) => {
    assignmentStatus = status;
    const response = await request('PUT', `/api/v1/owner/game-systems/${systemId}/members/${memberId}/moderator`, { is_moderator: false });
    expect(response.statusCode).toBe(expectedCode);
  });

  it('withholds database details from unexpected membership errors', async () => {
    databaseFails = true;
    const response = await request('GET', '/api/v1/me/system-memberships');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private database detail');
  });
});
