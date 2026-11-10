import { config } from './config.js';
import { currentAccessToken } from './supabase-auth.js';

export async function checkHealth() {
  const response = await fetch(`${config.apiBaseUrl}/healthz`);
  if (!response.ok) throw new Error(`API respondeu ${response.status}`);
  return response.json();
}

export async function getMyProfile() {
  return profileRequest('/api/v1/me/profile');
}

export async function updateMyProfile(patch) {
  return profileRequest('/api/v1/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

async function profileRequest(path, init = {}) {
  const token = currentAccessToken();
  if (!token) throw new Error('Entre na sua conta antes de acessar o perfil.');
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API respondeu ${response.status}`);
  return data;
}
