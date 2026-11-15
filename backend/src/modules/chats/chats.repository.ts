import type { SupabaseClient } from '@supabase/supabase-js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import {
  chatMessageSchema,
  chatMessagesResponseSchema,
  chatSchema,
  chatsResponseSchema,
  createChatRpcResponseSchema,
  type Chat,
  type ChatMessage,
  type CreateChatInput,
} from './chats.schema.js';

const chatColumns = 'id,game_system_id,name,description,status,created_at';
const messageColumns = 'id,chat_id,character_id,content,created_at';

export async function createSystemChat(client: SupabaseClient, userId: string, systemId: string, input: CreateChatInput) {
  const access = await readMySystemMemberships(client);
  const canManage = access.is_platform_admin || access.memberships.some((membership) =>
    membership.game_system_id === systemId && membership.role === 'owner');
  if (!canManage) return { status: 'forbidden' } as const;

  const { data: character, error: characterError } = await client.from('characters')
    .select('id,user_id,game_system_id,status')
    .eq('id', input.character_id).eq('user_id', userId).eq('game_system_id', systemId).eq('status', 'active').maybeSingle();
  if (characterError) throw characterError;
  if (!character || character.user_id !== userId || character.game_system_id !== systemId || character.status !== 'active') {
    return { status: 'character_not_found' } as const;
  }

  const { data, error } = await client.rpc('create_system_chat', {
    p_game_system_id: systemId,
    p_character_id: input.character_id,
    p_name: input.name,
    p_description: input.description ?? null,
  });
  if (error) throw error;
  const parsed = createChatRpcResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid created chat response');
  if (parsed.data.status !== 'created') return parsed.data;
  if (parsed.data.character_id !== input.character_id || parsed.data.chat.game_system_id !== systemId) {
    throw new Error('Invalid created chat response');
  }
  return { status: 'created', chat: parsed.data.chat } as const;
}

async function readOwnedActiveCharacter(client: SupabaseClient, userId: string, characterId: string) {
  const { data, error } = await client.from('characters').select('id,user_id,status,game_system_id')
    .eq('id', characterId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  return data?.user_id === userId && data.status === 'active' ? data : null;
}

async function listCharacterChatIds(client: SupabaseClient, characterId: string) {
  const { data, error } = await client.from('chat_members').select('chat_id').eq('character_id', characterId);
  if (error) throw error;
  return [...new Set((data ?? []).map(({ chat_id }) => chat_id as string))];
}

export async function listCharacterChats(client: SupabaseClient, userId: string, characterId: string): Promise<Chat[] | null> {
  const character = await readOwnedActiveCharacter(client, userId, characterId);
  if (!character) return null;
  const chatIds = await listCharacterChatIds(client, characterId);
  if (chatIds.length === 0) return [];
  const { data, error } = await client.from('chats').select(chatColumns).eq('game_system_id', character.game_system_id)
    .in('id', chatIds).order('name', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  const parsed = chatsResponseSchema.safeParse({ chats: data ?? [] });
  if (!parsed.success) throw new Error('Invalid chats response');
  return parsed.data.chats;
}

async function canCharacterAccessChat(client: SupabaseClient, userId: string, characterId: string, chatId: string) {
  const character = await readOwnedActiveCharacter(client, userId, characterId);
  if (!character) return false;
  const { data, error } = await client.from('chat_members').select('chat_id,game_system_id')
    .eq('chat_id', chatId).eq('character_id', characterId).maybeSingle();
  if (error) throw error;
  return data?.chat_id === chatId && data.game_system_id === character.game_system_id;
}

export async function listChatMessages(client: SupabaseClient, userId: string, characterId: string, chatId: string): Promise<ChatMessage[] | null> {
  if (!await canCharacterAccessChat(client, userId, characterId, chatId)) return null;
  const { data, error } = await client.from('messages').select(messageColumns).eq('chat_id', chatId)
    .order('created_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  const parsed = chatMessagesResponseSchema.safeParse({ messages: data ?? [] });
  if (!parsed.success) throw new Error('Invalid chat messages response');
  return parsed.data.messages;
}

export async function createChatMessage(client: SupabaseClient, userId: string, characterId: string, chatId: string, content: string): Promise<ChatMessage | null> {
  if (!await canCharacterAccessChat(client, userId, characterId, chatId)) return null;
  const { data, error } = await client.from('messages').insert({ chat_id: chatId, character_id: characterId, content })
    .select(messageColumns).single();
  if (error) throw error;
  const parsed = chatMessageSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid chat message response');
  return parsed.data;
}
