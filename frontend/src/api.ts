import { currentAccessToken } from './supabase-auth';

export interface Profile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

export interface ProfilePatch {
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await fetch('/healthz', { cache: 'no-store' });
  if (!response.ok) throw new Error(`API respondeu ${response.status}`);
  return response.json() as Promise<{ status: string }>;
}

export function getMyProfile() {
  return profileRequest('/api/v1/me/profile') as Promise<Profile>;
}

export function updateMyProfile(patch: ProfilePatch) {
  return profileRequest('/api/v1/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }) as Promise<Profile>;
}

async function profileRequest(path: string, init: RequestInit = {}) {
  const token = currentAccessToken();
  if (!token) throw new Error('Entre na sua conta antes de acessar o perfil.');
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data as { error?: string };
    throw new Error(error.error || `API respondeu ${response.status}`);
  }
  return data;
}
