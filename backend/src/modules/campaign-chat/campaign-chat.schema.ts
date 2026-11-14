import { z } from 'zod';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const characterIdParamsSchema = z.strictObject({ characterId: uuid });
export const roomParamsSchema = z.strictObject({ characterId: uuid, roomId: uuid });
export const sendMessageInputSchema = z.strictObject({ content: z.string().trim().min(1).max(2000) });

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
