import { describe, expect, it, vi } from 'vitest';
import { readAuthCallback } from '../src/auth-state.js';
import { missingSupabaseConfig } from '../src/config.js';
import { consumeAuthCallback, hasSession, updatePassword } from '../src/supabase-auth.js';

describe('client auth state', () => {
  it('reads a recovery token from the URL fragment and signals history cleanup', () => {
    expect(readAuthCallback('#type=recovery&access_token=access-123&refresh_token=refresh-456')).toEqual({
      recovery: { accessToken: 'access-123', refreshToken: 'refresh-456' },
      error: null,
      shouldCleanUrl: true,
    });
  });

  it('reads an expired recovery error from the URL fragment and signals history cleanup', () => {
    expect(readAuthCallback('#error=access_denied&error_code=otp_expired&error_description=Link+expired')).toEqual({
      recovery: null,
      error: 'Link expired',
      shouldCleanUrl: true,
    });
  });

  it('ignores unrelated URL fragments', () => {
    expect(readAuthCallback('#tab=profile')).toEqual({ recovery: null, error: null, shouldCleanUrl: false });
  });

  it('reports missing public Supabase settings without throwing', () => {
    expect(missingSupabaseConfig({ supabaseUrl: '', supabasePublishableKey: '' })).toEqual([
      'URL do Supabase', 'chave publishable do Supabase',
    ]);
  });

  it('consumes a recovery callback, removes tokens from browser history, and keeps the session in memory', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#type=recovery&access_token=access-123&refresh_token=refresh-456', pathname: '/', search: '?from=email' },
      history: { replaceState },
    });
    vi.stubGlobal('fetch', async () => Response.json({ user: { id: 'player' } }));
    try {
      expect(consumeAuthCallback().recovery?.accessToken).toBe('access-123');
      expect(replaceState).toHaveBeenCalledWith(null, '', '/?from=email');
      expect(hasSession()).toBe(true);
      await updatePassword('new-password');
      expect(hasSession()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
