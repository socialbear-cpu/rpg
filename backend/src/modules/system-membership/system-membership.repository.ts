import type { SupabaseClient } from '@supabase/supabase-js';
import {
  systemMembershipsResponseSchema,
  type ModeratorAssignmentInput,
  systemMemberSearchResponseSchema,
} from './system-membership.schema.js';

export async function readMySystemMemberships(client: SupabaseClient) {
  const { data, error } = await client.rpc('get_my_system_memberships');
  if (error) throw error;
  const result = systemMembershipsResponseSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid system membership response');
  return result.data;
}

export async function setSystemModerator(
  client: SupabaseClient,
  gameSystemId: string,
  userId: string,
  assignment: ModeratorAssignmentInput,
) {
  const { data, error } = await client.rpc('set_system_moderator', {
    p_game_system_id: gameSystemId,
    p_user_id: userId,
    p_is_moderator: assignment.is_moderator,
  });
  if (error) throw error;
  return data as { status: string };
}

export async function searchSystemMembersByCharacterName(client: SupabaseClient, gameSystemId: string, query: string) {
  const { data, error } = await client.rpc('search_system_members_by_character_name', {
    p_game_system_id: gameSystemId,
    p_query: query,
  });
  if (error) throw error;
  const result = systemMemberSearchResponseSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid system member search response');
  return result.data;
}
