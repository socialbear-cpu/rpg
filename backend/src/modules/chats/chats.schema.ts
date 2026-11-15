import { z } from 'zod';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const characterIdParamsSchema = z.strictObject({ characterId: uuid });
export const chatParamsSchema = z.strictObject({ characterId: uuid, chatId: uuid });
export const chatSystemParamsSchema = z.strictObject({ systemId: uuid });
export const createChatInputSchema = z.strictObject({
  character_id: uuid,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).nullable().optional().transform((value) => value?.trim() || null),
});
export const sendMessageInputSchema = z.strictObject({ content: z.string().trim().min(1).max(2000) });

export const chatSchema = z.strictObject({
  id: uuid,
  game_system_id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  created_at: timestamp,
});
export const chatsResponseSchema = z.strictObject({ chats: z.array(chatSchema) });
export const chatMessageSchema = z.strictObject({
  id: uuid,
  chat_id: uuid,
  character_id: uuid,
  content: z.string(),
  created_at: timestamp,
});
export const chatMessagesResponseSchema = z.strictObject({ messages: z.array(chatMessageSchema) });

export const createChatRpcResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('forbidden') }),
  z.strictObject({ status: z.literal('invalid_input') }),
  z.strictObject({ status: z.literal('character_not_found') }),
  z.strictObject({ status: z.literal('created'), character_id: uuid, chat: chatSchema }),
]);
export type CreateChatInput = z.infer<typeof createChatInputSchema>;
export type Chat = z.infer<typeof chatSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
