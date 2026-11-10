import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfilePatch } from './profile.schema.js';

const columns = 'user_id,display_name,avatar_url,bio';

// The caller supplies the verified identity and its bearer-scoped client.
// Explicit ownership filters supplement (and do not replace) database RLS.
export async function readProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from('user_profiles')
    .select(columns).eq('user_id', userId).maybeSingle<Profile>();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  client: SupabaseClient, userId: string, patch: ProfilePatch,
): Promise<Profile | null> {
  const { data, error } = await client.from('user_profiles')
    .update(patch).eq('user_id', userId).select(columns).maybeSingle<Profile>();
  if (error) throw error;
  return data;
}
