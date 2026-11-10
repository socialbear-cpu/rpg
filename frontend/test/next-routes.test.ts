import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHealth } from '../app/healthz/route.js';
import { GET as getApi, PATCH as patchApi } from '../app/api/[...path]/route.js';

const backendUrl = 'https://backend.internal';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('BACKEND_URL', backendUrl);
  fetchMock = vi.fn(async () => Response.json({ status: 'ok' }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Next.js routes and backend binding', () => {
  it('returns health from the public frontend service', async () => {
    expect(await getHealth()).toMatchObject({ status: 200 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the profile request path, query, and authorization through the binding', async () => {
    const request = new Request('https://rpg.example/api/v1/me/profile?view=full', {
      headers: { authorization: 'Bearer access-token' },
    });

    const response = await getApi(request);

    expect(await response.json()).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/v1/me/profile?view=full', backendUrl),
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token');
  });

  it('forwards PATCH JSON and preserves the backend status and response body', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Invalid profile patch' }, { status: 400 }));
    const request = new Request('https://rpg.example/api/v1/me/profile', {
      method: 'PATCH',
      headers: { authorization: 'Bearer access-token', 'content-type': 'application/json' },
      body: JSON.stringify({ unknown: true }),
    });

    const response = await patchApi(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid profile patch' });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/me/profile');
    expect(init.method).toBe('PATCH');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(JSON.stringify({ unknown: true }));
  });

  it('returns 503 if the binding is unavailable', async () => {
    vi.stubEnv('BACKEND_URL', '');
    const response = await getApi(new Request('https://rpg.example/api/v1/me/profile'));
    expect(response.status).toBe(503);
  });
});
