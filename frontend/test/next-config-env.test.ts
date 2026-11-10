import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Next.js Supabase client environment', () => {
  it('maps existing Vercel Supabase variables to the public client names', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example');

    const { default: nextConfig } = await import('../next.config.js');

    expect(nextConfig.env).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    });
  });
});
