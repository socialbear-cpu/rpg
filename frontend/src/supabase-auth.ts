'use client';

import { readAuthCallback, type AuthCallbackState } from './auth-state';
import { config } from './config';

type RpgSessionRuntime = typeof globalThis & { __rpgAccessToken?: string | null };
const sessionRuntime = globalThis as RpgSessionRuntime;
const pendingDeletionStorageKey = 'rpg.pending-system-deletion';

export interface PendingSystemDeletion {
  systemId: string;
  systemName: string;
  userId: string;
}

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  id?: string;
  email?: string | null;
  user?: AuthUser;
};
type AuthUser = { id: string; email?: string | null };

function responseUser(response: AuthResponse): AuthUser | null {
  const user = response.user ?? response;
  return typeof user.id === 'string' ? user as AuthUser : null;
}

async function authRequest(path: string, body?: unknown, token?: string | null, method = 'POST'): Promise<AuthResponse> {
  const authUrl = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const response = await fetch(`${authUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabasePublishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data as Record<string, unknown>;
    throw new Error(String(error.msg || error.message || error.error_description || error.error || `Supabase Auth respondeu ${response.status}`));
  }
  return data as AuthResponse;
}

export async function sendDeletionEmailLink(systemId: string, systemName: string) {
  const accessToken = currentAccessToken();
  if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente antes de excluir o sistema.');
  const user = responseUser(await authRequest('/user', undefined, accessToken, 'GET'));
  if (!user?.id || !user.email) throw new Error('Sua conta não tem um e-mail disponível para confirmação.');
  const pending: PendingSystemDeletion = { systemId, systemName, userId: user.id };
  localStorage.setItem(pendingDeletionStorageKey, JSON.stringify(pending));
  try {
    const redirectTo = encodeURIComponent(window.location.origin);
    await authRequest(`/otp?redirect_to=${redirectTo}`, { email: user.email, create_user: false });
  } catch (error) {
    localStorage.removeItem(pendingDeletionStorageKey);
    throw error;
  }
}

export function readPendingSystemDeletion(): PendingSystemDeletion | null {
  const pending = localStorage.getItem(pendingDeletionStorageKey);
  if (!pending) return null;
  try {
    const value = JSON.parse(pending) as Partial<PendingSystemDeletion>;
    if (typeof value.systemId !== 'string' || typeof value.systemName !== 'string' || typeof value.userId !== 'string') return null;
    return { systemId: value.systemId, systemName: value.systemName, userId: value.userId };
  } catch {
    return null;
  }
}

export function clearPendingSystemDeletion() {
  localStorage.removeItem(pendingDeletionStorageKey);
}

export async function getCurrentAuthUser() {
  const accessToken = currentAccessToken();
  if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente antes de excluir o sistema.');
  const result = responseUser(await authRequest('/user', undefined, accessToken, 'GET'));
  if (!result?.id) throw new Error('Não foi possível verificar sua conta.');
  return result;
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
    const token = currentAccessToken();
    if (token) await authRequest('/logout', {}, token);
  } finally {
    clearSession();
  }
}

export async function requestPasswordReset(email: string) {
  const redirectTo = encodeURIComponent(window.location.origin);
  return authRequest(`/recover?redirect_to=${redirectTo}`, { email });
}

export async function updatePassword(password: string) {
  const token = currentAccessToken();
  if (!token) throw new Error('A sessão de recuperação expirou. Solicite um novo link.');
  await authRequest('/user', { password }, token, 'PUT');
  clearSession();
}

export function consumeAuthCallback(): AuthCallbackState {
  const callback = readAuthCallback(window.location.hash);
  if (callback.recovery) setSession({ access_token: callback.recovery.accessToken });
  if (callback.emailSignIn) setSession({ access_token: callback.emailSignIn.accessToken });
  if (callback.shouldCleanUrl) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return callback;
}

export function currentAccessToken() { return sessionRuntime.__rpgAccessToken ?? null; }
export function hasSession() { return Boolean(sessionRuntime.__rpgAccessToken); }

function setSession(data: { access_token?: string }) {
  sessionRuntime.__rpgAccessToken = data.access_token ?? null;
}

function clearSession() {
  sessionRuntime.__rpgAccessToken = null;
}
