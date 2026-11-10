'use client';

import { readAuthCallback, type AuthCallbackState } from './auth-state';
import { config } from './config';

let accessToken: string | null = null;

async function authRequest(path: string, body: unknown, token?: string | null, method = 'POST') {
  const authUrl = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const response = await fetch(`${authUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabasePublishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data as Record<string, unknown>;
    throw new Error(String(error.msg || error.message || error.error_description || error.error || `Supabase Auth respondeu ${response.status}`));
  }
  return data as { access_token?: string; refresh_token?: string };
}

export async function signUp({ email, password, displayName }: { email: string; password: string; displayName: string }) {
  const redirectTo = encodeURIComponent(window.location.origin);
  const data = await authRequest(`/signup?redirect_to=${redirectTo}`, { email, password, data: { display_name: displayName } });
  setSession(data);
  return data;
}

export async function signIn({ email, password }: { email: string; password: string }) {
  const data = await authRequest('/token?grant_type=password', { email, password });
  setSession(data);
  return data;
}

export async function signOut() {
  try {
    if (accessToken) await authRequest('/logout', {}, accessToken);
  } finally {
    clearSession();
  }
}

export async function requestPasswordReset(email: string) {
  const redirectTo = encodeURIComponent(window.location.origin);
  return authRequest(`/recover?redirect_to=${redirectTo}`, { email });
}

export async function updatePassword(password: string) {
  if (!accessToken) throw new Error('A sessão de recuperação expirou. Solicite um novo link.');
  await authRequest('/user', { password }, accessToken, 'PUT');
  clearSession();
}

export function consumeAuthCallback(): AuthCallbackState {
  const callback = readAuthCallback(window.location.hash);
  if (callback.recovery) setSession({ access_token: callback.recovery.accessToken });
  if (callback.shouldCleanUrl) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return callback;
}

export function currentAccessToken() { return accessToken; }
export function hasSession() { return Boolean(accessToken); }

function setSession(data: { access_token?: string }) {
  accessToken = data.access_token ?? null;
}

function clearSession() {
  accessToken = null;
}
