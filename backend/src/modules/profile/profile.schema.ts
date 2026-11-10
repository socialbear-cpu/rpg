import { z } from 'zod';

export const profilePatchSchema = z.strictObject({
  display_name: z.string().trim().min(1).max(80).optional(),
  avatar_url: z.url({ protocol: /^https?$/ }).max(2048).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'At least one field is required');

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export interface Profile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

export const profileResponseSchema = {
  type: 'object',
  required: ['user_id', 'display_name', 'avatar_url', 'bio'],
  additionalProperties: false,
  properties: {
    user_id: { type: 'string', format: 'uuid' },
    display_name: { type: 'string' },
    avatar_url: { type: ['string', 'null'] },
    bio: { type: ['string', 'null'] },
  },
} as const;
