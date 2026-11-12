import type { SupabaseClient } from '@supabase/supabase-js';
import {
  characterSheetResponseSchema,
  createGameSystemResultSchema,
  createSystemCharacterResultSchema,
  gameSystemsResponseSchema,
  systemCharactersResponseSchema,
  type CreateCharacterInput,
  type CreateSystemInput,
} from './game-systems.schema.js';

const systemColumns = 'id,slug,name,description';
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
