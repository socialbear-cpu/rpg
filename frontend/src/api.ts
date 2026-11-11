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

export interface DailyLoginSystem {
  id: string;
  name: string;
  is_active: boolean;
  daily_login_timezone: string;
  daily_login_rewards_enabled: boolean;
}

export interface DailyLoginCharacter {
  id: string;
  character_name: string;
  game_system_id: string;
}

export interface DailyLoginReward {
  weekday: number;
  item_id: string;
  item_name: string;
  quantity: number;
}

export interface DailyLoginClaim {
  id: string;
  character_id: string;
  item_id: string;
  item_name_snapshot: string;
  quantity: number;
  weekday: number;
  local_claim_date: string;
  claimed_at: string;
}

export interface DailyLoginTodayState {
  status: 'available' | 'already_claimed' | 'calendar_unavailable' | 'system_unavailable' | 'unauthorized';
  weekday?: number;
  local_date?: string;
  timezone?: string;
  reward?: DailyLoginReward | null;
  claim?: DailyLoginClaim | null;
}

export interface DailyLoginSystemView {
  system: DailyLoginSystem;
  is_owner: boolean;
  can_manage: boolean;
  characters: DailyLoginCharacter[];
  today: DailyLoginTodayState | null;
}

export function takeDailyLoginPopup(systemId: string) {
  return authenticatedRequest<{ show: boolean; systems: DailyLoginSystemView[] }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/daily-login/popup`, { method: 'POST' },
  );
}

export interface DailyLoginOwnerCalendar {
  system: DailyLoginSystem;
  is_active: boolean;
  items: { id: string; name: string }[];
  rewards: DailyLoginReward[];
}

export interface DailyLoginScheduleInput {
  rewards: { weekday: number; item_id: string; quantity: number }[];
  is_active: boolean;
}

export interface DailyLoginClaimResult {
  status: 'claimed' | 'already_claimed' | 'invalid_character' | 'calendar_unavailable' | 'system_unavailable' | 'unauthorized';
  claim_id?: string;
  game_system_id?: string;
  character_id?: string;
  item_id?: string;
  item_name?: string;
  quantity?: number;
  weekday?: number;
  local_claim_date?: string;
  timezone?: string;
}

export type SystemRole = 'owner' | 'mod' | 'user';

export interface SystemMembership {
  game_system_id: string;
  game_system_name: string;
  role: SystemRole;
}

export interface SystemMemberships {
  is_platform_admin: boolean;
  memberships: SystemMembership[];
}

export type NotificationType = 'system_role_changed' | 'system_announcement' | (string & {});

export interface NotificationItem {
  id: string;
  game_system_id: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface MyNotificationsResponse {
  notifications: NotificationItem[];
  unread_count: number;
  limit: number;
  offset: number;
}

export interface SystemAnnouncementInput {
  title: string;
  body: string;
}

export async function getMySystemMemberships() {
  return authenticatedRequest<SystemMemberships>('/api/v1/me/system-memberships');
}

export async function setSystemModerator(gameSystemId: string, userId: string, isModerator: boolean) {
  return authenticatedRequest<{ status: 'updated' }>(
    `/api/v1/owner/game-systems/${encodeURIComponent(gameSystemId)}/members/${encodeURIComponent(userId)}/moderator`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_moderator: isModerator }) },
  );
}

export function getMyNotifications(limit = 20, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return authenticatedRequest<MyNotificationsResponse>(`/api/v1/me/notifications?${params.toString()}`);
}

export function markNotificationRead(notificationId: string) {
  return authenticatedRequest<{ status: 'updated' }>(
    `/api/v1/me/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'PATCH' },
  );
}

export function publishSystemAnnouncement(systemId: string, input: SystemAnnouncementInput) {
  return authenticatedRequest<{ status: 'created' }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/announcements`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  );
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

export function getMyDailyLoginSystems() {
  return authenticatedRequest<DailyLoginSystemView[]>('/api/v1/me/daily-login/systems');
}

export function getDailyLoginSystem(systemId: string) {
  return authenticatedRequest<DailyLoginSystemView>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/daily-login/rewards`,
  );
}

export function claimDailyLoginReward(systemId: string, characterId: string) {
  return authenticatedRequest<DailyLoginClaimResult>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/daily-login/claims`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_id: characterId }) },
  );
}

export function getOwnerDailyLoginCalendar(systemId: string) {
  return authenticatedRequest<DailyLoginOwnerCalendar>(
    `/api/v1/owner/game-systems/${encodeURIComponent(systemId)}/daily-login/rewards`,
  );
}

export function saveOwnerDailyLoginCalendar(systemId: string, schedule: DailyLoginScheduleInput) {
  return authenticatedRequest<{ status: string }>(
    `/api/v1/owner/game-systems/${encodeURIComponent(systemId)}/daily-login/rewards`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedule) },
  );
}

async function profileRequest(path: string, init: RequestInit = {}) {
  return authenticatedRequest<Profile>(path, init);
}

async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = currentAccessToken();
  if (!token) throw new Error('Entre na sua conta antes de continuar.');
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
  return data as T;
}
