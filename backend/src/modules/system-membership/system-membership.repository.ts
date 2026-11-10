import type { SupabaseClient } from '@supabase/supabase-js';
import {
  systemMembershipsResponseSchema,
  type ModeratorAssignmentInput,
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
