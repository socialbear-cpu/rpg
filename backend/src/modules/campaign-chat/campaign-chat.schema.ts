import { z } from 'zod';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const characterIdParamsSchema = z.strictObject({ characterId: uuid });
export const roomParamsSchema = z.strictObject({ characterId: uuid, roomId: uuid });
export const campaignParamsSchema = z.strictObject({ characterId: uuid, campaignId: uuid });
export const sendMessageInputSchema = z.strictObject({ content: z.string().trim().min(1).max(2000) });
export const createChatRoomInputSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });

export const availableChatCampaignSchema = z.strictObject({
  id: uuid,
  game_system_id: uuid,
  name: z.string(),
  can_create_room: z.boolean(),
});
export const availableChatCampaignsResponseSchema = z.strictObject({ campaigns: z.array(availableChatCampaignSchema) });

export const campaignChatRoomRowSchema = z.strictObject({
  id: uuid,
  campaign_id: uuid,
  name: z.string(),
  created_at: timestamp,
});
export const campaignChatRoomSchema = campaignChatRoomRowSchema.extend({ campaign_name: z.string() });
export const campaignChatRoomsResponseSchema = z.strictObject({ rooms: z.array(campaignChatRoomSchema) });

export const campaignChatMessageSchema = z.strictObject({
  id: uuid,
  room_id: uuid,
  campaign_id: uuid,
  character_id: uuid,
  content: z.string(),
  created_at: timestamp,
});
export const campaignChatMessagesResponseSchema = z.strictObject({ messages: z.array(campaignChatMessageSchema) });

export type CampaignChatRoom = z.infer<typeof campaignChatRoomSchema>;
export type CampaignChatMessage = z.infer<typeof campaignChatMessageSchema>;
