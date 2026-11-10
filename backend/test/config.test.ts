import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
};

describe('loadConfig', () => {
  it('rejects missing SUPABASE_URL', () => {
    expect(() => loadConfig({ SUPABASE_PUBLISHABLE_KEY: validEnv.SUPABASE_PUBLISHABLE_KEY }))
      .toThrow(/SUPABASE_URL/);
  });

  it.each(['not-a-url', 'ftp://example.com'])('rejects malformed URL %s', (url) => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_URL: url })).toThrow(/SUPABASE_URL/);
  });

  it.each([undefined, '', '   '])('rejects missing SUPABASE_PUBLISHABLE_KEY %s', (key) => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_PUBLISHABLE_KEY: key }))
      .toThrow(/SUPABASE_PUBLISHABLE_KEY/);
  });

  it('defaults PORT to 3000', () => {
    expect(loadConfig(validEnv).port).toBe(3000);
  });

  it('loads valid settings and an explicit port', () => {
    expect(loadConfig({ ...validEnv, PORT: '8080', NODE_ENV: 'production' })).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'test-publishable-key',
      port: 8080,
      nodeEnv: 'production',
    });
  });

  it('loads public Supabase environment names for the single Next.js application', () => {
    expect(loadConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://public.example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
    })).toMatchObject({
      supabaseUrl: 'https://public.example.supabase.co',
      supabasePublishableKey: 'sb_publishable_public',
    });
  });

  it.each(['0', '65536', '3.5', 'not-a-port', ''])('rejects invalid port %s', (port) => {
    expect(() => loadConfig({ ...validEnv, PORT: port })).toThrow(/PORT/);
  });

  it('does not echo secret values in configuration errors', () => {
    const secret = 'test-secret-that-must-not-appear';
    try {
      loadConfig({ SUPABASE_URL: secret, SUPABASE_PUBLISHABLE_KEY: secret, PORT: secret });
      expect.fail('Expected invalid configuration to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('SUPABASE_URL');
      expect(String(error)).not.toContain(secret);
    }
  });
});
