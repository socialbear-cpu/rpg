import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createUserSupabaseClient } from './clients/supabase.js';

export interface AuthenticatedRequestContext {
  userId: string;
  user: User;
  supabase: SupabaseClient;
}

export function parseBearerToken(authorization: string | null): string | null {
  return /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(authorization ?? '')?.[1] ?? null;
}

export async function authenticateAccessToken(accessToken: string): Promise<AuthenticatedRequestContext | null> {
  const supabase = createUserSupabaseClient(accessToken);
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user?.id) return null;
    return { userId: data.user.id, user: data.user, supabase };
  } catch {
    return null;
  }
}
