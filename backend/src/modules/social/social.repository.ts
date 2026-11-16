import type { SupabaseClient } from '@supabase/supabase-js';
import {
  friendshipListResponseSchema,
  socialMutationResultSchema,
  socialSearchResponseSchema,
  socialInvitationListResponseSchema,
  socialInvitationMutationResultSchema,
  type FriendRequestDecision,
} from './social.schema.js';

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function searchSocialProfiles(client: SupabaseClient, query: string) {
  const result = socialSearchResponseSchema.safeParse(await rpc(client, 'search_social_profiles', { p_query: query }));
  if (!result.success) throw new Error('Invalid social search response');
  return result.data;
}

export async function listMyFriendships(client: SupabaseClient) {
  const result = friendshipListResponseSchema.safeParse(await rpc(client, 'list_my_friendships'));
  if (!result.success) throw new Error('Invalid friendship list response');
  return result.data;
}

export async function createFriendRequest(client: SupabaseClient, recipientUserId: string) {
  const result = socialMutationResultSchema.safeParse(await rpc(client, 'create_friend_request', {
    p_recipient_id: recipientUserId,
  }));
  if (!result.success) throw new Error('Invalid friend request response');
  return result.data;
}

export async function respondFriendRequest(
  client: SupabaseClient,
  requestId: string,
  decision: Exclude<FriendRequestDecision['decision'], 'cancel'>,
) {
  const result = socialMutationResultSchema.safeParse(await rpc(client, 'respond_friend_request', {
    p_request_id: requestId,
    p_decision: decision,
  }));
  if (!result.success) throw new Error('Invalid friend request response');
  return result.data;
}

export async function cancelFriendRequest(client: SupabaseClient, requestId: string) {
  const result = socialMutationResultSchema.safeParse(await rpc(client, 'cancel_friend_request', {
    p_request_id: requestId,
  }));
  if (!result.success) throw new Error('Invalid friend request response');
  return result.data;
}

export async function removeFriend(client: SupabaseClient, friendUserId: string) {
  const result = socialMutationResultSchema.safeParse(await rpc(client, 'remove_friend', {
    p_friend_user_id: friendUserId,
  }));
  if (!result.success) throw new Error('Invalid remove friend response');
  return result.data;
}

export async function createRpgInvitation(client: SupabaseClient, friendUserId: string, gameSystemId: string | null, chatId: string | null) {
  const result = socialInvitationMutationResultSchema.safeParse(await rpc(client, 'create_rpg_invitation', {
    p_friend_user_id: friendUserId, p_game_system_id: gameSystemId, p_chat_id: chatId,
  }));
  if (!result.success) throw new Error('Invalid RPG invitation response');
  return result.data;
}

export async function listMySocialInvitations(client: SupabaseClient) {
  const result = socialInvitationListResponseSchema.safeParse(await rpc(client, 'list_my_social_invitations'));
  if (!result.success) throw new Error('Invalid social invitation list response');
  return result.data;
}

export async function respondRpgInvitation(client: SupabaseClient, invitationId: string, decision: string, characterId?: string) {
  const result = socialInvitationMutationResultSchema.safeParse(await rpc(client, 'respond_rpg_invitation', {
    p_invitation_id: invitationId, p_decision: decision, p_character_id: characterId ?? null,
  }));
  if (!result.success) throw new Error('Invalid RPG invitation response');
  return result.data;
}
