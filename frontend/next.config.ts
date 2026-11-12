import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

const nextConfig: NextConfig = {
  env: {
    ...(supabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl } : {}),
    ...(supabasePublishableKey ? { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey } : {}),
  },
  turbopack: {
    root: workspaceRoot,
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
