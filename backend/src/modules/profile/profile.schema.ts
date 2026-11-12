import { z } from 'zod';

export const profilePatchSchema = z.strictObject({
  display_name: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/).optional(),
  avatar_url: z.url({ protocol: /^https?$/ }).max(2048).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
})
  .refine((patch) => Object.keys(patch).length > 0, 'At least one field is required')
  .refine((patch) => patch.username === undefined || Object.keys(patch).length === 1, 'Username must be selected independently');

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export interface Profile {
  user_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

export const profileResponseSchema = {
  type: 'object',
  required: ['user_id', 'username', 'display_name', 'avatar_url', 'bio'],
  additionalProperties: false,
  properties: {
    user_id: { type: 'string', format: 'uuid' },
    username: { type: ['string', 'null'], minLength: 3, maxLength: 20, pattern: '^[a-z0-9_]+$' },
    display_name: { type: 'string' },
    avatar_url: { type: ['string', 'null'] },
    bio: { type: ['string', 'null'] },
  },
} as const;
