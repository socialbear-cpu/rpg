import type { SupabaseClient } from '@supabase/supabase-js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import {
  availableChatCampaignsResponseSchema,
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

export async function listCharacterCampaigns(client: SupabaseClient, userId: string, characterId: string) {
  const character = await readOwnedActiveCharacter(client, userId, characterId);
  if (!character) return null;
  const { data: campaigns, error: campaignsError } = await client.from('campaigns')
    .select('id,game_system_id,owner_user_id,name').eq('game_system_id', character.game_system_id)
    .order('name', { ascending: true }).order('id', { ascending: true });
  if (campaignsError) throw campaignsError;
  if (!campaigns?.length) return [];
  const campaignIds = campaigns.map(({ id }) => id as string);
  const [{ data: memberships, error: membershipsError }, systemAccess] = await Promise.all([
    client.from('campaign_members').select('campaign_id,role').eq('character_id', characterId).in('campaign_id', campaignIds),
    readMySystemMemberships(client),
  ]);
  if (membershipsError) throw membershipsError;
  const gameMasterCampaigns = new Set((memberships ?? []).filter(({ role }) => role === 'game_master').map(({ campaign_id }) => campaign_id as string));
  const ownerSystems = new Set(systemAccess.memberships.filter(({ role }) => role === 'owner').map(({ game_system_id }) => game_system_id));
  const parsed = availableChatCampaignsResponseSchema.safeParse({ campaigns: campaigns.map((campaign) => ({
    id: campaign.id,
    game_system_id: campaign.game_system_id,
    name: campaign.name,
    can_create_room: systemAccess.is_platform_admin || campaign.owner_user_id === userId || ownerSystems.has(campaign.game_system_id) || gameMasterCampaigns.has(campaign.id),
  })) });
  if (!parsed.success) throw new Error('Invalid campaign chat campaigns response');
  return parsed.data.campaigns;
}

export async function createCampaignChatRoom(
  client: SupabaseClient,
  userId: string,
  characterId: string,
  campaignId: string,
  name: string,
) {
  const character = await readOwnedActiveCharacter(client, userId, characterId);
  if (!character) return { status: 'character_not_found' } as const;
  const { data: campaign, error: campaignError } = await client.from('campaigns')
    .select('id,game_system_id,owner_user_id').eq('id', campaignId).eq('game_system_id', character.game_system_id).maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) return { status: 'campaign_not_found' } as const;

  const [systemAccess, { data: membership, error: membershipError }] = await Promise.all([
    readMySystemMemberships(client),
    client.from('campaign_members').select('role').eq('campaign_id', campaignId).eq('character_id', characterId).maybeSingle(),
  ]);
  if (membershipError) throw membershipError;
  const isSystemOwner = systemAccess.memberships.some(({ game_system_id, role }) => game_system_id === campaign.game_system_id && role === 'owner');
  const canCreateRoom = systemAccess.is_platform_admin || campaign.owner_user_id === userId || isSystemOwner || membership?.role === 'game_master';
  if (!canCreateRoom) return { status: 'forbidden' } as const;

  const { data, error } = await client.from('chat_rooms').insert({ campaign_id: campaignId, name })
    .select(roomColumns).single();
  if (error) throw error;
  const parsed = campaignChatRoomRowSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid campaign chat room response');
  return { status: 'created', room: parsed.data } as const;
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
