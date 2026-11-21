import { z } from 'zod';

const publicProfileSchema = z.strictObject({
  user_id: z.uuid(),
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/),
  display_name: z.string(),
  avatar_url: z.url({ protocol: /^https?$/ }).nullable(),
  bio: z.string().nullable(),
});

const friendProfileSchema = publicProfileSchema.extend({
  since: z.iso.datetime({ offset: true }),
});

const friendRequestItemSchema = z.strictObject({
  id: z.uuid(),
  user_id: z.uuid(),
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/),
  display_name: z.string(),
  avatar_url: z.url({ protocol: /^https?$/ }).nullable(),
  bio: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export const socialSearchQuerySchema = z.strictObject({
  q: z.string().trim().toLowerCase().min(2).max(20).regex(/^[a-z0-9_]+$/),
});

export const socialSearchResponseSchema = z.strictObject({
  status: z.literal('ok'),
  results: z.array(publicProfileSchema),
});

export const friendshipListResponseSchema = z.strictObject({
  status: z.literal('ok'),
  friends: z.array(friendProfileSchema),
  incoming_requests: z.array(friendRequestItemSchema),
  outgoing_requests: z.array(friendRequestItemSchema),
});

export const friendRequestBodySchema = z.strictObject({
  recipient_user_id: z.uuid(),
});

export const friendRequestDecisionSchema = z.strictObject({
  decision: z.enum(['accept', 'decline', 'cancel']),
});

export const friendRequestParamsSchema = z.strictObject({
  requestId: z.uuid(),
});

export const friendUserParamsSchema = z.strictObject({
  friendUserId: z.uuid(),
});

export const rpgSystemParamsSchema = z.strictObject({ systemId: z.uuid() });
export const rpgChatParamsSchema = z.strictObject({ chatId: z.uuid() });
export const socialInvitationParamsSchema = z.strictObject({ invitationId: z.uuid() });
export const rpgInvitationBodySchema = z.strictObject({ friend_user_id: z.uuid() });
export const socialInvitationDecisionSchema = z.strictObject({
  decision: z.enum(['approve', 'decline', 'accept', 'cancel']),
  character_id: z.uuid().optional(),
});
const invitationItemSchema = z.union([
  z.strictObject({ id: z.uuid(), game_system_id: z.uuid(), chat_id: z.uuid().nullable(), system_name: z.string(), chat_name: z.string().nullable(), created_at: z.iso.datetime({ offset: true }), status: z.string(), invitee_user_id: z.uuid(), username: z.string(), display_name: z.string() }),
  z.strictObject({ id: z.uuid(), game_system_id: z.uuid(), chat_id: z.uuid().nullable(), system_name: z.string(), chat_name: z.string().nullable(), created_at: z.iso.datetime({ offset: true }), status: z.string(), inviter_user_id: z.uuid(), username: z.string(), display_name: z.string() }),
]);
export const socialInvitationListResponseSchema = z.strictObject({
  status: z.literal('ok'),
  owner_approvals: z.array(invitationItemSchema),
  recipient_invitations: z.array(invitationItemSchema),
});
export const socialInvitationMutationResultSchema = z.strictObject({
  status: z.enum(['pending_owner_approval', 'pending_recipient', 'accepted', 'declined', 'cancelled', 'already_invited', 'already_member', 'not_friends', 'invalid_recipient', 'invalid_decision', 'invalid_character', 'not_found', 'forbidden', 'conflict', 'unauthorized', 'room_full']),
  invitation_id: z.uuid().optional(),
});

export const socialMutationResultSchema = z.strictObject({
  status: z.enum([
    'created', 'accepted', 'declined', 'cancelled', 'removed', 'already_pending',
    'self_request', 'invalid_friend', 'not_friends', 'not_found', 'forbidden',
    'conflict', 'invalid_decision', 'unauthorized',
  ]),
  request_id: z.uuid().optional(),
});

export type FriendRequestDecision = z.infer<typeof friendRequestDecisionSchema>;
export type SocialMutationResult = z.infer<typeof socialMutationResultSchema>;
