import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelTradeOffer, getMyProfile, postProfileComment,
  respondToSocialInvitation, saveOwnerExperienceSettings, updateGameSystemLifecycle, updateMyProfile,
} from '../src/api.js';

const auth = vi.hoisted(() => ({ token: 'test-token' as string | null }));
vi.mock('../src/supabase-auth', () => ({ currentAccessToken: () => auth.token }));

afterEach(() => { auth.token = 'test-token'; vi.unstubAllGlobals(); });

describe('authenticated API requests', () => {
  it('keeps JSON methods, payloads, encoded paths and authentication', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetch);
    const cases = [
      { run: () => postProfileComment('nome/espaço', 'Olá'), path: '/api/v1/social/profiles/nome%2Fespa%C3%A7o/comments', method: 'POST', body: { content: 'Olá' } },
      { run: () => updateMyProfile({ bio: null, interests: [] }), path: '/api/v1/me/profile', method: 'PATCH', body: { bio: null, interests: [] } },
      { run: () => saveOwnerExperienceSettings('system', { xp_per_level: 100, sources: [] }), path: '/api/v1/owner/game-systems/system/xp', method: 'PUT', body: { xp_per_level: 100, sources: [] } },
      { run: () => updateGameSystemLifecycle('system', 'archive'), path: '/api/v1/game-systems/system/lifecycle', method: 'PATCH', body: { action: 'archive' } },
      { run: () => respondToSocialInvitation('invite', 'accept'), path: '/api/v1/social-invitations/invite/respond', method: 'POST', body: { decision: 'accept' } },
      { run: () => respondToSocialInvitation('invite', 'accept', 'character'), path: '/api/v1/social-invitations/invite/respond', method: 'POST', body: { decision: 'accept', character_id: 'character' } },
      { run: () => cancelTradeOffer('offer'), path: '/api/v1/me/trade-offers/offer/cancel', method: 'POST', body: {} },
    ];
    for (const entry of cases) {
      await entry.run();
      const [path, init] = fetch.mock.lastCall! as [string, RequestInit];
      expect(path).toBe(entry.path);
      expect(init.method).toBe(entry.method);
      expect(init.cache).toBe('no-store');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
      expect(JSON.parse(init.body as string)).toEqual(entry.body);
    }
  });

  it('does not send requests without a session', async () => {
    auth.token = null;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(getMyProfile()).rejects.toThrow('Entre na sua conta antes de continuar.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns profile data and preserves server errors and HTTP fallback messages', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ display_name: 'Jogador' }))
      .mockResolvedValueOnce(Response.json({ error: 'Acesso negado' }, { status: 403 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(getMyProfile()).resolves.toEqual({ display_name: 'Jogador' });
    await expect(updateMyProfile({ display_name: 'Nome' })).rejects.toThrow('Acesso negado');
    await expect(getMyProfile()).rejects.toThrow('API respondeu 503');
  });
});
