'use client';

import { readAuthCallback, type AuthCallbackState } from './auth-state';
import { config } from './config';

type RpgSessionRuntime = typeof globalThis & { __rpgAccessToken?: string | null };
const sessionRuntime = globalThis as RpgSessionRuntime;
const pendingDeletionStorageKey = 'rpg.pending-system-deletion';
const pendingAccountActionStorageKey = 'rpg.pending-account-action';

function authRedirectUrl() {
  return config.appUrl || window.location.origin;
}

export interface PendingSystemDeletion {
  systemId: string;
  systemName: string;
  userId: string;
}

export type PendingAccountAction =
  | { kind: 'profile-update'; userId: string; patch: { display_name?: string; avatar_url?: string | null; banner_url?: string | null; bio?: string | null; status?: string | null; interests?: string[]; phone?: string | null } }
  | { kind: 'password-change' | 'deactivate' | 'reactivate' | 'delete'; userId: string }
  | { kind: 'request-transfer'; userId: string; systemId: string; targetUserId: string }
  | { kind: 'cancel-transfer'; userId: string; transferId: string }
  | { kind: 'accept-transfer'; userId: string; transferId: string };
export type PendingAccountActionInput = PendingAccountAction extends infer Action
  ? Action extends { userId: string } ? Omit<Action, 'userId'> : never
  : never;

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
    const redirectTo = encodeURIComponent(authRedirectUrl());
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

export async function sendAccountConfirmationEmail(
  action: PendingAccountActionInput,
) {
  const user = await getCurrentAuthUser();
  if (!user.email) throw new Error('Sua conta não tem um e-mail disponível para confirmação.');
  const pending = { ...action, userId: user.id } as PendingAccountAction;
  localStorage.setItem(pendingAccountActionStorageKey, JSON.stringify(pending));
  try {
    const redirectTo = encodeURIComponent(`${authRedirectUrl().replace(/\/$/, '')}/account-settings`);
    await authRequest(`/otp?redirect_to=${redirectTo}`, { email: user.email, create_user: false });
  } catch (error) {
    localStorage.removeItem(pendingAccountActionStorageKey);
    throw error;
  }
}

export function readPendingAccountAction(): PendingAccountAction | null {
  const raw = localStorage.getItem(pendingAccountActionStorageKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (typeof value.userId !== 'string') return null;
    if (value.kind === 'profile-update' && typeof value.patch === 'object' && value.patch !== null) {
      const patch = value.patch as Record<string, unknown>;
      const keys = Object.keys(patch);
      if (keys.length === 0 || keys.some((key) => !['display_name', 'avatar_url', 'banner_url', 'bio', 'status', 'interests', 'phone'].includes(key))) return null;
      if (('display_name' in patch && typeof patch.display_name !== 'string')
        || ('avatar_url' in patch && patch.avatar_url !== null && typeof patch.avatar_url !== 'string')
        || ('banner_url' in patch && patch.banner_url !== null && typeof patch.banner_url !== 'string')
        || ('bio' in patch && patch.bio !== null && typeof patch.bio !== 'string')
        || ('status' in patch && patch.status !== null && typeof patch.status !== 'string')
        || ('interests' in patch && (!Array.isArray(patch.interests) || patch.interests.some((interest) => typeof interest !== 'string')))
        || ('phone' in patch && patch.phone !== null && typeof patch.phone !== 'string')) return null;
      return {
        kind: value.kind,
        userId: value.userId,
        patch: {
          ...('display_name' in patch ? { display_name: patch.display_name as string } : {}),
          ...('avatar_url' in patch ? { avatar_url: patch.avatar_url as string | null } : {}),
          ...('banner_url' in patch ? { banner_url: patch.banner_url as string | null } : {}),
          ...('bio' in patch ? { bio: patch.bio as string | null } : {}),
          ...('status' in patch ? { status: patch.status as string | null } : {}),
          ...('interests' in patch ? { interests: patch.interests as string[] } : {}),
          ...('phone' in patch ? { phone: patch.phone as string | null } : {}),
        },
      };
    }
    if (['password-change', 'deactivate', 'reactivate', 'delete'].includes(String(value.kind))) {
      return { kind: value.kind as 'password-change' | 'deactivate' | 'reactivate' | 'delete', userId: value.userId };
    }
    if (value.kind === 'request-transfer' && typeof value.systemId === 'string' && typeof value.targetUserId === 'string') {
      return { kind: value.kind, userId: value.userId, systemId: value.systemId, targetUserId: value.targetUserId };
    }
    if (value.kind === 'accept-transfer' && typeof value.transferId === 'string') {
      return { kind: value.kind, userId: value.userId, transferId: value.transferId };
    }
    if (value.kind === 'cancel-transfer' && typeof value.transferId === 'string') {
      return { kind: value.kind, userId: value.userId, transferId: value.transferId };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingAccountAction() {
  localStorage.removeItem(pendingAccountActionStorageKey);
}

export async function getCurrentAuthUser() {
  const accessToken = currentAccessToken();
  if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente antes de excluir o sistema.');
  const result = responseUser(await authRequest('/user', undefined, accessToken, 'GET'));
  if (!result?.id) throw new Error('Não foi possível verificar sua conta.');
  return result;
}

export async function signUp({ email, password, displayName }: { email: string; password: string; displayName: string }) {
  const redirectTo = encodeURIComponent(authRedirectUrl());
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
  const redirectTo = encodeURIComponent(authRedirectUrl());
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
