import type { SupabaseClient } from '@supabase/supabase-js';
import {
  characterSheetResponseSchema,
  createGameSystemResultSchema,
  createSystemCharacterResultSchema,
  gameSystemSchema,
  gameSystemLifecycleResultSchema,
  gameSystemsResponseSchema,
  joinGameSystemResultSchema,
  storedGameSystemSchema,
  systemTagOptionsResponseSchema,
  systemCharactersResponseSchema,
  updateGameSystemResultSchema,
  type CreateCharacterInput,
  type CreateSystemInput,
  type UpdateGameSystemInput,
} from './game-systems.schema.js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';

const systemColumns = 'id,slug,name,description,is_active,is_public,cover_image_path,cover_focus_x,cover_focus_y,tags,play_mode';
const characterColumns = 'id,game_system_id,character_name,attributes,status';

async function getTagOptions(client: SupabaseClient, activeOnly = false) {
  let query = client.from('game_system_tag_catalog').select('slug,label');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.order('sort_order');
  if (error) throw error;
  const result = systemTagOptionsResponseSchema.safeParse({ tags: data ?? [] });
  if (!result.success) throw new Error('Invalid system tag options response');
  return result.data.tags;
}

async function parseGameSystem(client: SupabaseClient, value: unknown) {
  const stored = storedGameSystemSchema.safeParse(value);
  if (!stored.success) throw new Error('Invalid game system response');
  const options = await getTagOptions(client);
  const labels = new Map(options.map(({ slug, label }) => [slug, label]));
  const mapped = {
    ...stored.data,
    tags: stored.data.tags.map((slug) => {
      const label = labels.get(slug);
      if (!label) throw new Error('Unknown system tag in database');
      return { slug, label };
    }),
  };
  const result = gameSystemSchema.safeParse(mapped);
  if (!result.success) throw new Error('Invalid game system response');
  return result.data;
}

export async function manageGameSystemLifecycle(
  client: SupabaseClient,
  systemId: string,
  action: 'archive' | 'activate' | 'delete',
) {
  const { data, error } = await client.rpc('manage_game_system_lifecycle', {
    p_system_id: systemId,
    p_action: action,
  });
  if (error) throw error;
  const result = gameSystemLifecycleResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid game system lifecycle response');
  return result.data;
}

export async function listAccessibleGameSystems(client: SupabaseClient, includeArchived = false) {
  const { data: activeSystems, error } = await client.from('game_systems')
    .select(systemColumns).eq('is_active', true).order('name');
  if (error) throw error;
  let archivedSystems: typeof activeSystems = [];
  if (includeArchived) {
    const access = await readMySystemMemberships(client);
    const ownerSystemIds = access.memberships
      .filter((membership) => membership.role === 'owner')
      .map((membership) => membership.game_system_id);
    if (access.is_platform_admin || ownerSystemIds.length > 0) {
      let archivedQuery = client.from('game_systems')
        .select(systemColumns).eq('is_active', false);
      if (!access.is_platform_admin) archivedQuery = archivedQuery.in('id', ownerSystemIds);
      const result = await archivedQuery.order('name');
      if (result.error) throw result.error;
      archivedSystems = result.data ?? [];
    }
  }
  const options = await getTagOptions(client);
  const labels = new Map(options.map(({ slug, label }) => [slug, label]));
  const systems = [...(activeSystems ?? []), ...archivedSystems].map((value) => {
    const stored = storedGameSystemSchema.safeParse(value);
    if (!stored.success) throw new Error('Invalid game system response');
    return {
      ...stored.data,
      tags: stored.data.tags.map((slug) => {
        const label = labels.get(slug);
        if (!label) throw new Error('Unknown system tag in database');
        return { slug, label };
      }),
    };
  });
  const result = gameSystemsResponseSchema.safeParse({ systems });
  if (!result.success) throw new Error('Invalid game systems response');
  return result.data;
}

export async function listSystemTagOptions(client: SupabaseClient) {
  return { tags: await getTagOptions(client, true) };
}

export async function createGameSystem(client: SupabaseClient, input: CreateSystemInput) {
  const { data, error } = await client.rpc('create_game_system_with_metadata', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_fields: input.definition,
    p_play_mode: input.play_mode,
    p_tags: input.tags,
  });
  if (error) throw error;
  const result = createGameSystemResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid game system creation response');
  return { system: await parseGameSystem(client, result.data.system), definition: result.data.definition };
}

export async function updateGameSystem(client: SupabaseClient, systemId: string, input: UpdateGameSystemInput) {
  const { data, error } = await client.rpc('update_game_system_profile', {
    p_system_id: systemId,
    p_name: input.name,
    p_description: input.description,
    p_is_public: input.is_public,
    p_password: input.password ?? null,
    p_play_mode: input.play_mode,
    p_tags: input.tags,
    p_cover_image_path: input.cover_image_path,
    p_cover_focus_x: input.cover_focus_x,
    p_cover_focus_y: input.cover_focus_y,
  });
  if (error) throw error;
  const result = updateGameSystemResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid updated game system response');
  if (result.data.status !== 'updated') return { status: result.data.status, system: null } as const;
  if (!result.data.system) throw new Error('Missing updated game system details');
  return { status: 'updated', system: await parseGameSystem(client, result.data.system) } as const;
}

export async function authorizeSystemAccess(client: SupabaseClient, systemId: string, password?: string) {
  const { data, error } = await client.rpc('join_game_system_with_password', {
    p_system_id: systemId,
    p_password: password ?? null,
  });
  if (error) throw error;
  const result = joinGameSystemResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid system access response');
  return result.data.status;
}

export async function readActiveGameSystem(client: SupabaseClient, systemId: string) {
  const { data, error } = await client.from('game_systems')
    .select('id').eq('id', systemId).eq('is_active', true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function readGameSystemCharacterSheet(client: SupabaseClient, systemId: string) {
  const { data, error } = await client.from('game_system_character_sheets')
    .select('game_system_id,definition').eq('game_system_id', systemId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const result = characterSheetResponseSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid character sheet response');
  return result.data;
}

export async function listSystemCharacters(client: SupabaseClient, userId: string, systemId: string) {
  const { data, error } = await client.from('characters')
    .select(characterColumns)
    .eq('user_id', userId)
    .eq('game_system_id', systemId)
    .eq('status', 'active')
    .order('character_name');
  if (error) throw error;
  const result = systemCharactersResponseSchema.safeParse({ characters: data ?? [] });
  if (!result.success) throw new Error('Invalid system characters response');
  return result.data;
}

export async function createSystemCharacter(
  client: SupabaseClient,
  userId: string,
  systemId: string,
  input: CreateCharacterInput,
) {
  const { data, error } = await client.from('characters')
    .insert({
      user_id: userId,
      game_system_id: systemId,
      character_name: input.character_name,
      attributes: input.attributes,
      status: 'active',
    })
    .select(characterColumns)
    .single();
  if (error) throw error;
  const result = createSystemCharacterResultSchema.safeParse({ character: data });
  if (!result.success) throw new Error('Invalid character creation response');
  return result.data;
}
