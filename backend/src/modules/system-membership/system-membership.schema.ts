import { z } from 'zod';

export const systemIdSchema = z.uuid();

export const membershipParamsSchema = z.strictObject({
  systemId: z.uuid(),
  userId: z.uuid(),
});

export const moderatorAssignmentSchema = z.strictObject({
  is_moderator: z.boolean(),
});

export const memberSearchParamsSchema = z.strictObject({ systemId: z.uuid() });
export const memberSearchQuerySchema = z.strictObject({ query: z.string().trim().min(2).max(80) });
export const systemMemberSearchResponseSchema = z.strictObject({
  status: z.enum(['ok', 'not_owner', 'unauthorized']),
  results: z.array(z.strictObject({ user_id: z.uuid(), character_name: z.string(), display_name: z.string() })),
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
