import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = 'd1000000-0000-4000-8000-000000000001';
const systemId = 'd2000000-0000-4000-8000-000000000001';
let rpcError: { code: string; message: string } | null;
let onlineCount: number;
let requests: { url: URL; method: string; body: unknown }[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  rpcError = null;
  onlineCount = 4;
  requests = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'presence@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    if (url.pathname === '/rest/v1/rpc/get_my_account_status') return Response.json(true);
    if (url.pathname === '/rest/v1/rpc/heartbeat_game_system_lobby_presence') {
      if (rpcError) return Response.json({ code: rpcError.code, message: rpcError.message }, { status: 403 });
      return Response.json(onlineCount);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(token: string | null = 'presence-token') {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({ method: 'POST', url: `/api/v1/game-systems/${systemId}/lobby-presence/heartbeat`, headers: token ? { authorization: `Bearer ${token}` } : {} });
  } finally { await app.close(); }
}

describe('system lobby presence API', () => {
  it('returns only the aggregate online count and calls the system-scoped RPC', async () => {
    const response = await request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ online_count: 4 });
    const heartbeat = requests.find(({ url }) => url.pathname === '/rest/v1/rpc/heartbeat_game_system_lobby_presence');
    expect(heartbeat?.body).toEqual({ p_game_system_id: systemId });
    expect(response.body).not.toContain(userId);
  });

  it('rejects a request without an access token before calling the RPC', async () => {
    const response = await request(null);
    expect(response.statusCode).toBe(401);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/rpc/heartbeat_game_system_lobby_presence')).toBe(false);
  });

  it('maps a membership rejection from the database to a forbidden response', async () => {
    rpcError = { code: '42501', message: 'System membership required' };
    const response = await request();
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'System membership required' });
  });
});
