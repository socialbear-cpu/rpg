import { z } from 'zod';

export const systemIdSchema = z.uuid();

export const membershipParamsSchema = z.strictObject({
  systemId: z.uuid(),
  userId: z.uuid(),
});

export const moderatorAssignmentSchema = z.strictObject({
  is_moderator: z.boolean(),
});

export type ModeratorAssignmentInput = z.infer<typeof moderatorAssignmentSchema>;

export const systemRoleSchema = z.enum(['owner', 'mod', 'user']);

export const systemMembershipSchema = z.strictObject({
  game_system_id: z.uuid(),
  game_system_name: z.string(),
  role: systemRoleSchema,
});

export const systemMembershipsResponseSchema = z.strictObject({
  is_platform_admin: z.boolean(),
  memberships: z.array(systemMembershipSchema),
});

export type SystemMembershipsResponse = z.infer<typeof systemMembershipsResponseSchema>;
export type SystemMembership = z.infer<typeof systemMembershipSchema>;
