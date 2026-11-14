import type { SupabaseClient } from '@supabase/supabase-js';
import {
  campaignChatMessageSchema,
  campaignChatMessagesResponseSchema,
  campaignChatRoomSchema,
  campaignChatRoomRowSchema,
  campaignChatRoomsResponseSchema,
  type CampaignChatMessage,
  type CampaignChatRoom,
} from './campaign-chat.schema.js';

const roomColumns = 'id,campaign_id,name,created_at';
const messageColumns = 'id,room_id,campaign_id,character_id,content,created_at';

async function readOwnedActiveCharacter(client: SupabaseClient, userId: string, characterId: string) {
  const { data, error } = await client.from('characters').select('id,user_id,status,game_system_id')
    .eq('id', characterId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  // Fail closed if a misconfigured policy or unexpected database response ignores filters.
  return data?.user_id === userId && data.status === 'active' ? data : null;
}

async function listCharacterCampaignIds(client: SupabaseClient, characterId: string) {
  const { data, error } = await client.from('campaign_members').select('campaign_id')
    .eq('character_id', characterId);
  if (error) throw error;
  return [...new Set((data ?? []).map(({ campaign_id }) => campaign_id as string))];
}

export async function listCharacterChatRooms(client: SupabaseClient, userId: string, characterId: string): Promise<CampaignChatRoom[] | null> {
  const character = await readOwnedActiveCharacter(client, userId, characterId);
  if (!character) return null;
  const campaignIds = await listCharacterCampaignIds(client, characterId);
  if (campaignIds.length === 0) return [];
  const { data: campaigns, error: campaignsError } = await client.from('campaigns').select('id,name').in('id', campaignIds);
  if (campaignsError) throw campaignsError;
  const campaignNames = new Map((campaigns ?? []).map(({ id, name }) => [id as string, name as string]));
  const { data, error } = await client.from('chat_rooms').select(roomColumns)
    .in('campaign_id', campaignIds).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  const parsed = campaignChatRoomsResponseSchema.safeParse({ rooms: (data ?? []).map((room) => ({
    ...room, campaign_name: campaignNames.get(room.campaign_id) ?? 'Campanha',
  })) });
  if (!parsed.success) throw new Error('Invalid campaign chat rooms response');
  return parsed.data.rooms;
}

async function readCharacterRoom(client: SupabaseClient, userId: string, characterId: string, roomId: string) {
  const character = await readOwnedActiveCharacter(client, userId, characterId);
  if (!character) return null;
  const campaignIds = await listCharacterCampaignIds(client, characterId);
  if (campaignIds.length === 0) return null;
  const { data, error } = await client.from('chat_rooms').select(roomColumns)
    .eq('id', roomId).in('campaign_id', campaignIds).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parsed = campaignChatRoomRowSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid campaign chat room response');
  return parsed.data;
}

export async function listRoomChatMessages(client: SupabaseClient, userId: string, characterId: string, roomId: string): Promise<CampaignChatMessage[] | null> {
  const room = await readCharacterRoom(client, userId, characterId, roomId);
  if (!room) return null;
  const { data, error } = await client.from('messages').select(messageColumns)
    .eq('room_id', room.id).eq('campaign_id', room.campaign_id)
    .order('created_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  const parsed = campaignChatMessagesResponseSchema.safeParse({ messages: data ?? [] });
  if (!parsed.success) throw new Error('Invalid campaign chat messages response');
  return parsed.data.messages;
}

export async function createRoomChatMessage(client: SupabaseClient, userId: string, characterId: string, roomId: string, content: string): Promise<CampaignChatMessage | null> {
  const room = await readCharacterRoom(client, userId, characterId, roomId);
  if (!room) return null;
  const { data, error } = await client.from('messages').insert({
    room_id: room.id,
    campaign_id: room.campaign_id,
    character_id: characterId,
    content,
  }).select(messageColumns).single();
  if (error) throw error;
  const parsed = campaignChatMessageSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid campaign chat message response');
  return parsed.data;
}
