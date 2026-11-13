import type { SupabaseClient } from '@supabase/supabase-js';
import {
  characterSheetResponseSchema,
  createGameSystemResultSchema,
  createSystemCharacterResultSchema,
  gameSystemSchema,
  gameSystemsResponseSchema,
  joinGameSystemResultSchema,
  systemCharactersResponseSchema,
  updateGameSystemResultSchema,
  type CreateCharacterInput,
  type CreateSystemInput,
  type UpdateGameSystemInput,
} from './game-systems.schema.js';

const systemColumns = 'id,slug,name,description,is_public';
const characterColumns = 'id,game_system_id,character_name,attributes,status';

export async function listActiveGameSystems(client: SupabaseClient) {
  const { data, error } = await client.from('game_systems')
    .select(systemColumns).eq('is_active', true).order('name');
  if (error) throw error;
  const result = gameSystemsResponseSchema.safeParse({ systems: data ?? [] });
  if (!result.success) throw new Error('Invalid game systems response');
  return result.data;
}

export async function createGameSystem(client: SupabaseClient, input: CreateSystemInput) {
  const { data, error } = await client.rpc('create_game_system_with_sheet', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_fields: input.definition,
  });
  if (error) throw error;
  const result = createGameSystemResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid game system creation response');
  return { system: result.data.system, definition: result.data.definition };
}

export async function updateGameSystem(client: SupabaseClient, systemId: string, input: UpdateGameSystemInput) {
  const { data, error } = await client.rpc('update_game_system_access_settings', {
    p_system_id: systemId,
    p_name: input.name,
    p_description: input.description,
    p_is_public: input.is_public,
    p_password: input.password ?? null,
  });
  if (error) throw error;
  const result = updateGameSystemResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid updated game system response');
  if (result.data.status !== 'updated') return { status: result.data.status, system: null } as const;
  if (!result.data.system) throw new Error('Missing updated game system details');
  const system = gameSystemSchema.safeParse(result.data.system);
  if (!system.success) throw new Error('Invalid updated game system details');
  return { status: 'updated', system: system.data } as const;
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
