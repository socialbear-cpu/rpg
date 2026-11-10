import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadConfig } from '../config.js';

export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  const config = loadConfig(process.env);
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
