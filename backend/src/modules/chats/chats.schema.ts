import { z } from 'zod';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const characterIdParamsSchema = z.strictObject({ characterId: uuid });
export const chatParamsSchema = z.strictObject({ characterId: uuid, chatId: uuid });
export const chatSystemParamsSchema = z.strictObject({ systemId: uuid });
export const createChatInputSchema = z.strictObject({
  character_id: uuid.optional(),
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
  max_players: z.number().int().positive().nullable(),
  player_count: z.number().int().nonnegative(),
  permissions: z.strictObject({ view: z.boolean(), enter: z.boolean(), write: z.boolean() }),
  is_member: z.boolean(),
  has_player_seat: z.boolean(),
  can_manage: z.boolean(),
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
  z.strictObject({ status: z.literal('created'), character_id: uuid.nullable(), chat: chatSchema }),
]);

export const rolePermissionSchema = z.strictObject({ role: z.enum(['owner', 'mod', 'user']), view: z.boolean(), enter: z.boolean(), write: z.boolean() });
export const userPermissionSchema = z.strictObject({ user_id: uuid, view: z.boolean().nullable(), enter: z.boolean().nullable(), write: z.boolean().nullable() });
export const roomSettingsInputSchema = z.strictObject({
  max_players: z.number().int().min(1).max(2147483647).nullable(),
  roles: z.array(rolePermissionSchema).max(3),
  users: z.array(userPermissionSchema),
}).refine(value => new Set(value.roles.map(rule => rule.role)).size === value.roles.length && new Set(value.users.map(rule => rule.user_id)).size === value.users.length, 'Duplicate permission rules');
export const roomSettingsResponseSchema = z.object({
  chat: chatSchema, roles: z.array(rolePermissionSchema), users: z.array(userPermissionSchema),
  members: z.array(z.strictObject({ user_id: uuid, role: z.enum(['owner', 'mod', 'user']), display_name: z.string() })),
});
export type CreateChatInput = z.infer<typeof createChatInputSchema>;
export type Chat = z.infer<typeof chatSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
