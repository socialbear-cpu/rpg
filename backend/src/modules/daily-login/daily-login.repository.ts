import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyLoginCharacter,
  DailyLoginClaimInput,
  DailyLoginClaim,
  DailyLoginReward,
  DailyLoginScheduleInput,
  DailyLoginSystem,
  DailyLoginSystemState,
} from './daily-login.schema.js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';

export interface DailyLoginSystemView {
  system: DailyLoginSystem;
  is_owner: boolean;
  can_manage: boolean;
  characters: DailyLoginCharacter[];
  today: DailyLoginSystemState['today'] | null;
}

export interface DailyLoginOwnerCalendar {
  system: DailyLoginSystem;
  is_active: boolean;
  items: { id: string; name: string }[];
  rewards: DailyLoginReward[];
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

const systemColumns = 'id,name,is_active,daily_login_timezone,daily_login_rewards_enabled';
const characterColumns = 'id,character_name,game_system_id';

async function readActiveCharacters(client: SupabaseClient, userId: string, systemId?: string) {
  let query = client.from('characters').select(characterColumns)
    .eq('user_id', userId).eq('status', 'active').order('character_name');
  if (systemId) query = query.eq('game_system_id', systemId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DailyLoginCharacter[];
}

async function readState(client: SupabaseClient, systemId: string) {
  const { data, error } = await client.rpc('get_daily_login_reward_state', {
    p_game_system_id: systemId,
  });
  if (error) throw error;
  return data as unknown as DailyLoginSystemState['today'] | null;
}

export async function listMyDailyLoginSystems(
  client: SupabaseClient,
  userId: string,
): Promise<DailyLoginSystemView[]> {
  const access = await readMySystemMemberships(client);
  const ownerSystemIds = access.memberships
    .filter((membership) => membership.role === 'owner')
    .map((membership) => membership.game_system_id);
  const [characters, systemsResult, ownerResult] = await Promise.all([
    readActiveCharacters(client, userId),
    access.is_platform_admin
      ? client.from('game_systems').select(systemColumns).order('name')
      : client.from('game_systems').select(systemColumns).eq('is_active', true).order('name'),
    ownerSystemIds.length
      ? client.from('game_systems').select(systemColumns).in('id', ownerSystemIds).order('name')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (systemsResult.error) throw systemsResult.error;
  if (ownerResult.error) throw ownerResult.error;

  const systems = new Map<string, DailyLoginSystem>();
  for (const system of [...(systemsResult.data ?? []), ...(ownerResult.data ?? [])] as DailyLoginSystem[]) {
    systems.set(system.id, system);
  }
  const ownerIds = new Set(ownerSystemIds);
  const bySystem = new Map<string, DailyLoginCharacter[]>();
  for (const character of characters) {
    const group = bySystem.get(character.game_system_id) ?? [];
    group.push(character);
    bySystem.set(character.game_system_id, group);
  }

  const visible = [...systems.values()].filter((system) =>
    access.is_platform_admin || ownerIds.has(system.id) || (system.is_active && (bySystem.get(system.id)?.length ?? 0) > 0));
  return Promise.all(visible.map(async (system) => {
    const eligibleCharacters = bySystem.get(system.id) ?? [];
    return {
      system,
      is_owner: ownerIds.has(system.id),
      can_manage: access.is_platform_admin || ownerIds.has(system.id),
      characters: eligibleCharacters,
      today: system.is_active && eligibleCharacters.length > 0
        ? await readState(client, system.id)
        : null,
    };
  }));
}

export async function readPlayerDailyLoginSystem(
  client: SupabaseClient,
  userId: string,
  systemId: string,
): Promise<DailyLoginSystemView | null> {
  const [characters, systemResult] = await Promise.all([
    readActiveCharacters(client, userId, systemId),
    client.from('game_systems').select(systemColumns)
      .eq('id', systemId).eq('is_active', true).maybeSingle(),
  ]);
  if (systemResult.error) throw systemResult.error;
  if (!systemResult.data || characters.length === 0) return null;
  return {
    system: systemResult.data as DailyLoginSystem,
    is_owner: false,
    can_manage: false,
    characters,
    today: await readState(client, systemId),
  };
}

export async function readOwnerDailyLoginCalendar(
  client: SupabaseClient,
  systemId: string,
): Promise<DailyLoginOwnerCalendar | null> {
  const access = await readMySystemMemberships(client);
  const isOwner = access.memberships.some((membership) =>
    membership.game_system_id === systemId && membership.role === 'owner');
  if (!isOwner && !access.is_platform_admin) return null;

  const { data: system, error: systemError } = await client.from('game_systems')
    .select(systemColumns).eq('id', systemId).maybeSingle();
  if (systemError) throw systemError;
  if (!system) return null;

  const [itemsResult, rewardsResult] = await Promise.all([
    client.from('items').select('id,name').eq('game_system_id', systemId).order('name'),
    client.from('daily_login_rewards').select('weekday,item_id,quantity')
      .eq('game_system_id', systemId).order('weekday'),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (rewardsResult.error) throw rewardsResult.error;

  const items = (itemsResult.data ?? []) as { id: string; name: string }[];
  const itemNames = new Map(items.map((item) => [item.id, item.name]));
  const rewards = ((rewardsResult.data ?? []) as Omit<DailyLoginReward, 'item_name'>[])
    .map((reward) => ({ ...reward, item_name: itemNames.get(reward.item_id) ?? 'Item unavailable' }));
  return {
    system: system as DailyLoginSystem,
    is_active: system.daily_login_rewards_enabled,
    items,
    rewards,
  };
}

export async function saveOwnerDailyLoginCalendar(
  client: SupabaseClient,
  systemId: string,
  schedule: DailyLoginScheduleInput,
) {
  const { data, error } = await client.rpc('set_daily_login_reward_schedule', {
    p_game_system_id: systemId,
    p_rewards: schedule.rewards,
    p_is_active: schedule.is_active,
  });
  if (error) throw error;
  return data as unknown as { status: string };
}

export async function claimDailyLoginReward(
  client: SupabaseClient,
  systemId: string,
  input: DailyLoginClaimInput,
): Promise<DailyLoginClaimResult> {
  const { data, error } = await client.rpc('claim_daily_login_reward', {
    p_game_system_id: systemId,
    p_character_id: input.character_id,
  });
  if (error) throw error;
  return data as unknown as DailyLoginClaimResult;
}
