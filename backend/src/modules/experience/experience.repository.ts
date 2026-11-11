import type { SupabaseClient } from '@supabase/supabase-js';
import {
  characterExperienceSummarySchema,
  experienceSettingsResultSchema,
  experienceSettingsUpdateResultSchema,
  type CharacterExperienceSummary,
  type ExperienceSettingsInput,
} from './experience.schema.js';

export async function readOwnerExperienceSettings(client: SupabaseClient, systemId: string) {
  const { data, error } = await client.rpc('get_game_system_xp_settings', {
    p_game_system_id: systemId,
  });
  if (error) throw error;
  const result = experienceSettingsResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid XP settings response');
  return result.data;
}

export async function saveOwnerExperienceSettings(
  client: SupabaseClient,
  systemId: string,
  input: ExperienceSettingsInput,
) {
  const { data, error } = await client.rpc('set_game_system_xp_settings', {
    p_game_system_id: systemId,
    p_settings: input,
  });
  if (error) throw error;
  const result = experienceSettingsUpdateResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid XP settings update response');
  return result.data;
}

export async function readCharacterExperience(
  client: SupabaseClient,
  characterId: string,
): Promise<CharacterExperienceSummary | null> {
  const { data, error } = await client.rpc('get_character_xp_summary', {
    p_character_id: characterId,
  });
  if (error) throw error;
  if (data === null) return null;
  const result = characterExperienceSummarySchema.safeParse(data);
  if (!result.success) throw new Error('Invalid character XP summary response');
  return result.data;
}
