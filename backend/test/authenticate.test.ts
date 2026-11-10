import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';
import { authenticate } from '../src/plugins/authenticate.js';

const userId = 'a72adcaf-9d23-46cc-b312-5fbe7fb6214b';
let verification: 'accepted' | 'rejected' | 'unavailable';
let requests: { url: string; headers: Headers }[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  verification = 'accepted';
  requests = [];
  // Keep the real Supabase client; replace only the external HTTP boundary.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, headers });
    if (url.endsWith('/auth/v1/user')) {
      if (verification === 'unavailable') throw new Error('Auth unavailable');
      if (verification === 'rejected') {
        return Response.json({ message: 'Invalid JWT', code: 'bad_jwt' }, { status: 401 });
      }
      return Response.json({
        id: userId, aud: 'authenticated', role: 'authenticated',
        email: 'player@example.com', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (url.startsWith('https://example.supabase.co/rest/v1/characters')) {
      return Response.json([{ id: 'character-1' }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function protectedApp() {
  const app = buildApp({ nodeEnv: 'test' });
  let handled = false;
  app.get('/protected', { preHandler: authenticate }, async (request) => {
    handled = true;
    const { data, error } = await request.supabase!.from('characters').select('id');
    if (error) throw error;
    return { userId: request.userId, characters: data };
  });
  return { app, wasHandled: () => handled };
}

describe('route-level authentication', () => {
  it.each([undefined, '', 'Basic credentials', 'Bearer', 'Bearer ', 'Bearer one two'])
    ('rejects missing or malformed authorization %j before the handler', async (authorization) => {
      const { app, wasHandled } = protectedApp();
      try {
        const response = await app.inject({
          method: 'GET', url: '/protected',
          headers: authorization === undefined ? {} : { authorization },
        });
        expect(response.statusCode).toBe(401);
        expect(wasHandled()).toBe(false);
        expect(requests).toHaveLength(0);
      } finally {
        await app.close();
      }
    });

  it.each(['rejected', 'unavailable'] as const)
    ('rejects a token when Auth is %s before the handler', async (outcome) => {
      verification = outcome;
      const { app, wasHandled } = protectedApp();
      try {
        const response = await app.inject({
          method: 'GET', url: '/protected', headers: { authorization: 'Bearer invalid-token' },
        });
        expect(response.statusCode).toBe(401);
        expect(wasHandled()).toBe(false);
      } finally {
        await app.close();
      }
    });

  it('uses only the verified Auth identity and forwards the bearer token with the publishable key', async () => {
    const { app, wasHandled } = protectedApp();
    try {
      const response = await app.inject({
        method: 'GET', url: '/protected?userId=attacker-id',
        headers: { authorization: 'bEaReR accepted-token', 'x-user-id': 'attacker-id' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId, characters: [{ id: 'character-1' }] });
      expect(wasHandled()).toBe(true);
      expect(requests.map(({ url }) => url)).toEqual([
        'https://example.supabase.co/auth/v1/user',
        'https://example.supabase.co/rest/v1/characters?select=id',
      ]);
      for (const request of requests) {
        expect(request.headers.get('authorization')).toBe('Bearer accepted-token');
        expect(request.headers.get('apikey')).toBe('sb_publishable_test');
      }
    } finally {
      await app.close();
    }
  });

  it('keeps health public when no token or Supabase configuration is present', async () => {
    vi.stubEnv('SUPABASE_URL', undefined);
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', undefined);
    const { app } = protectedApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
      expect(requests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
