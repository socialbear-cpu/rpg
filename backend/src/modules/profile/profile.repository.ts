import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfilePatch } from './profile.schema.js';

const columns = 'user_id,username,username_change_used,display_name,avatar_url,banner_url,bio,status,interests,phone';

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
): Promise<{ status: string; profile?: Profile }> {
  const { data, error } = await client.rpc('update_my_account_profile', { p_patch: patch });
  if (error) throw error;
  const result = data as { status: string; profile?: Profile };
  if (result.status !== 'updated') return result;
  const profile = await readProfile(client, userId);
  return profile ? { status: result.status, profile } : result;
}

export async function claimUsername(
  client: SupabaseClient, userId: string, username: string,
): Promise<Profile | null> {
  const { data, error } = await client.from('user_profiles')
    .update({ username }).eq('user_id', userId)
    .select(columns).maybeSingle<Profile>();
  if (error) throw error;
  return data;
}
