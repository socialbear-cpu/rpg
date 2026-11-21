import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import { chatsResponseSchema, createChatRpcResponseSchema, type CreateChatInput } from './chats.schema.js';

export async function createSystemChat(client: SupabaseClient, _userId: string, systemId: string, input: CreateChatInput) {
  const access = await readMySystemMemberships(client);
  if (!access.memberships.some(member => member.game_system_id === systemId && member.role === 'owner')) return { status: 'forbidden' } as const;
  const { data, error } = await client.rpc('create_system_chat', {
    p_game_system_id: systemId, p_character_id: null, p_name: input.name, p_description: input.description,
  });
  if (error) throw error;
  const result = createChatRpcResponseSchema.parse(data);
  if (result.status === 'created' && result.chat.game_system_id !== systemId) throw new Error('Invalid chat system');
  return result;
}

export async function readOwnedActiveCharacter(client: SupabaseClient, userId: string, characterId: string) {
  const { data, error } = await client.from('characters').select('id,user_id,status,game_system_id')
    .eq('id', characterId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  return data?.id === characterId && data.user_id === userId && data.status === 'active' ? data : null;
}

export async function listSystemChats(client: SupabaseClient, systemId: string, characterId: string | null = null) {
  const { data, error } = await client.rpc('list_system_chats', { p_system: systemId, p_character: characterId });
  if (error) throw error;
  if (data?.status !== 'ok') throw new Error('Unable to list rooms');
  return chatsResponseSchema.parse({ chats: data.chats });
}

const roomResult = z.object({ status: z.enum(['ok', 'forbidden', 'not_found', 'invalid_character', 'invalid_input', 'room_full']) }).passthrough();
export async function roomOperation(client: SupabaseClient, action: string, chatId: string, characterId: string | null = null, payload: unknown = {}) {
  const { data, error } = await client.rpc('room_operation', { p_action: action, p_chat: chatId, p_character: characterId, p_payload: payload });
  if (error) throw error;
  return roomResult.parse(data);
}
