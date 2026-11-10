import { config } from './config.js';

const authUrl = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
let accessToken = null;
async function authRequest(path, body, token, method = 'POST') {
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
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Supabase Auth respondeu ${response.status}`);
  return data;
}

export async function signUp({ email, password, displayName }) {
  const redirectTo = encodeURIComponent(window.location.origin);
  const data = await authRequest(`/signup?redirect_to=${redirectTo}`, { email, password, data: { display_name: displayName } });
  setSession(data);
  return data;
}

export async function signIn({ email, password }) {
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

export async function requestPasswordReset(email) {
  const redirectTo = encodeURIComponent(window.location.origin);
  return authRequest(`/recover?redirect_to=${redirectTo}`, { email });
}

export async function updatePassword(password) {
  if (!accessToken) throw new Error('A sessão de recuperação expirou. Solicite um novo link.');
  await authRequest('/user', { password }, accessToken, 'PUT');
  clearSession();
}

export function currentAccessToken() { return accessToken; }
export function hasSession() { return Boolean(accessToken); }

const redirectParams = new URLSearchParams(window.location.hash.slice(1));
export const isPasswordRecovery = redirectParams.get('type') === 'recovery' && Boolean(redirectParams.get('access_token'));
export const passwordRecoveryError = redirectParams.has('error') || redirectParams.has('error_code')
  ? (redirectParams.get('error_description') || 'O link de recuperação expirou ou não é válido. Solicite um novo link.')
  : null;
if (isPasswordRecovery) {
  setSession({ access_token: redirectParams.get('access_token'), refresh_token: redirectParams.get('refresh_token') });
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
} else if (passwordRecoveryError) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function setSession(data) {
  accessToken = data.access_token ?? null;
}

function clearSession() {
  accessToken = null;
}
