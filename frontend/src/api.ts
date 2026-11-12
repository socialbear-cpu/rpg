import { currentAccessToken } from './supabase-auth';

export interface Profile {
  user_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

export interface ProfilePatch {
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
}

export type CharacterSheetFieldType = 'short_text' | 'long_text' | 'number' | 'single_select';

export interface CharacterSheetField {
  key: string;
  label: string;
  type: CharacterSheetFieldType;
  required: boolean;
  position: number;
  show_on_card: boolean;
  options?: string[];
}

export interface CharacterSheetOption {
  label: string;
  image_url?: string;
  description?: string;
}

export interface CharacterSheetVisualElementBase {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type CharacterSheetVisualElement =
  | (CharacterSheetVisualElementBase & { type: 'text'; text: string })
  | (CharacterSheetVisualElementBase & { type: 'image'; image_url: string; description?: string });

export interface CharacterSheetComponentBase {
  key: string;
  label: string;
  required: boolean;
  position: number;
  width: 'full' | 'half' | 'third';
  show_on_card: boolean;
}

export type CharacterSheetComponent =
  | (CharacterSheetComponentBase & { type: 'short_text' })
  | (CharacterSheetComponentBase & { type: 'long_text' })
  | (CharacterSheetComponentBase & { type: 'number' })
  | (CharacterSheetComponentBase & { type: 'single_select'; presentation: 'select' | 'cards'; options: CharacterSheetOption[] });

export interface CharacterSheetStep {
  key: string;
  label: string;
  position: number;
  components: CharacterSheetComponent[];
  elements?: CharacterSheetVisualElement[];
}

export interface CharacterSheetDefinition {
  version: 1;
  steps: CharacterSheetStep[];
}

export interface GameSystem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface SystemCharacter {
  id: string;
  game_system_id: string;
  character_name: string;
  attributes: Record<string, unknown>;
  status: 'active';
}

export interface CreateGameSystemInput {
  name: string;
  description?: string | null;
  definition: CharacterSheetDefinition;
}

export interface CreateCharacterInput {
  character_name: string;
  attributes: Record<string, unknown>;
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

export interface TradeCharacter {
  id: string;
  character_name: string;
  owner_display_name: string;
  is_mine: boolean;
}

export interface TradeInventoryStack {
  stack_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  metadata: Record<string, unknown>;
}

export interface TradeInventoryCharacter {
  id: string;
  character_name: string;
  owner_display_name: string;
  is_mine: boolean;
}

export interface TradeOfferCharacter {
  id: string;
  character_name: string;
  owner_display_name: string;
}

export interface TradeOfferLine extends TradeInventoryStack {}

export type TradeOfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'countered' | 'expired' | 'invalidated';
export type TradeOfferBox = 'incoming' | 'sent' | 'history';

export interface TradeOffer {
  id: string;
  game_system_id: string;
  status: TradeOfferStatus;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  countered_from_offer_id: string | null;
  sender_character: TradeOfferCharacter;
  recipient_character: TradeOfferCharacter;
  sender_lines: TradeOfferLine[];
  recipient_lines: TradeOfferLine[];
}

export interface TradeOfferLineInput {
  stack_id: string;
  quantity: number;
}

export interface TradeOfferInput {
  sender_character_id: string;
  recipient_character_id: string;
  sender_lines: TradeOfferLineInput[];
  recipient_lines: TradeOfferLineInput[];
}

export interface TradeCounterOfferInput {
  sender_lines: TradeOfferLineInput[];
  recipient_lines: TradeOfferLineInput[];
}

export interface TradeOffersResponse {
  offers: TradeOffer[];
  limit: number;
  offset: number;
}

export interface TradeMutationResult {
  status: 'created' | 'accepted' | 'declined' | 'cancelled';
  offer_id?: string;
  countered_offer_id?: string;
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
  xp_awarded: number;
}

export type ExperienceSourceType = 'daily_login' | 'mission' | 'fight' | 'custom';

export interface ExperienceSource {
  id: string;
  name: string;
  source_type: ExperienceSourceType;
  award_amount: number;
  is_enabled: boolean;
}

export interface ExperienceSourceInput {
  id?: string;
  name: string;
  source_type: ExperienceSourceType;
  award_amount: number;
  is_enabled: boolean;
}

export interface ExperienceSettings {
  game_system_id: string;
  xp_per_level: number;
  sources: ExperienceSource[];
}

export interface ExperienceSettingsInput {
  xp_per_level: number;
  sources: ExperienceSourceInput[];
}

export interface CharacterExperienceHistoryItem {
  id: string;
  source_type: ExperienceSourceType;
  source_name: string;
  amount: number;
  created_at: string;
}

export interface CharacterExperienceSummary {
  character_id: string;
  game_system_id: string;
  total_xp: number;
  level: number;
  xp_in_level: number;
  xp_to_next_level: number;
  history: CharacterExperienceHistoryItem[];
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

export function getGameSystems() {
  return authenticatedRequest<{ systems: GameSystem[] }>('/api/v1/game-systems');
}

export function createGameSystem(input: CreateGameSystemInput) {
  return authenticatedRequest<{ system: GameSystem; definition: CharacterSheetDefinition }>('/api/v1/game-systems', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

export function getCharacterSheet(systemId: string) {
  return authenticatedRequest<{ game_system_id: string; definition: CharacterSheetDefinition }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/character-sheet`,
  );
}

export function updateGameSystemCharacterSheet(systemId: string, definition: CharacterSheetDefinition) {
  return authenticatedRequest<{ definition: CharacterSheetDefinition }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/character-sheet`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition }) },
  );
}

export function getSystemCharacters(systemId: string) {
  return authenticatedRequest<{ characters: SystemCharacter[] }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/characters`,
  );
}

export function createSystemCharacter(systemId: string, input: CreateCharacterInput) {
  return authenticatedRequest<{ character: SystemCharacter }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/characters`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  );
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

export function getTradeCharacters(systemId: string) {
  return authenticatedRequest<{ characters: TradeCharacter[] }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/trading/characters`,
  );
}

export function getTradeCharacterInventory(systemId: string, characterId: string) {
  return authenticatedRequest<{ character: TradeInventoryCharacter; stacks: TradeInventoryStack[] }>(
    `/api/v1/game-systems/${encodeURIComponent(systemId)}/trading/characters/${encodeURIComponent(characterId)}/inventory`,
  );
}

export function getTradeOffers(box: TradeOfferBox, limit = 50, offset = 0) {
  const params = new URLSearchParams({ box, limit: String(limit), offset: String(offset) });
  return authenticatedRequest<TradeOffersResponse>(`/api/v1/me/trade-offers?${params.toString()}`);
}

export function createTradeOffer(input: TradeOfferInput) {
  return authenticatedRequest<TradeMutationResult>('/api/v1/me/trade-offers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

export function respondToTradeOffer(offerId: string, action: 'accept' | 'decline') {
  return authenticatedRequest<TradeMutationResult>(`/api/v1/me/trade-offers/${encodeURIComponent(offerId)}/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
}

export function counterTradeOffer(offerId: string, input: TradeCounterOfferInput) {
  return authenticatedRequest<TradeMutationResult>(`/api/v1/me/trade-offers/${encodeURIComponent(offerId)}/counter`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

export function cancelTradeOffer(offerId: string) {
  return authenticatedRequest<TradeMutationResult>(`/api/v1/me/trade-offers/${encodeURIComponent(offerId)}/cancel`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
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

export function getOwnerExperienceSettings(systemId: string) {
  return authenticatedRequest<ExperienceSettings>(
    `/api/v1/owner/game-systems/${encodeURIComponent(systemId)}/xp`,
  );
}

export function saveOwnerExperienceSettings(systemId: string, settings: ExperienceSettingsInput) {
  return authenticatedRequest<{ status: 'updated' }>(
    `/api/v1/owner/game-systems/${encodeURIComponent(systemId)}/xp`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) },
  );
}

export function getCharacterExperience(characterId: string) {
  return authenticatedRequest<CharacterExperienceSummary>(
    `/api/v1/me/characters/${encodeURIComponent(characterId)}/xp`,
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
