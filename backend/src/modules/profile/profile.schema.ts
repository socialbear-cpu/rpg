import { z } from 'zod';

export const profilePatchSchema = z.strictObject({
  display_name: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/).optional(),
  avatar_url: z.url({ protocol: /^https?$/ }).max(2048).nullable().optional(),
  banner_url: z.url({ protocol: /^https?$/ }).max(2048).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  status: z.string().trim().max(120).nullable().optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  phone: z.string().trim().max(32).regex(/^[+0-9().\-\s]*$/).nullable().optional(),
})
  .refine((patch) => Object.keys(patch).length > 0, 'At least one field is required')
  .refine((patch) => patch.username === undefined || Object.keys(patch).length === 1, 'Username must be selected independently');

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export interface Profile {
  user_id: string;
  username: string | null;
  username_change_used: boolean;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: string | null;
  interests: string[];
  phone: string | null;
}

export const profileResponseSchema = {
  type: 'object',
  required: ['user_id', 'username', 'username_change_used', 'display_name', 'avatar_url', 'banner_url', 'bio', 'status', 'interests', 'phone'],
  additionalProperties: false,
  properties: {
    user_id: { type: 'string', format: 'uuid' },
    username: { type: ['string', 'null'], minLength: 3, maxLength: 20, pattern: '^[a-z0-9_]+$' },
    username_change_used: { type: 'boolean' },
    display_name: { type: 'string' },
    avatar_url: { type: ['string', 'null'] },
    banner_url: { type: ['string', 'null'] },
    bio: { type: ['string', 'null'] },
    status: { type: ['string', 'null'], maxLength: 120 },
    interests: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 40 } },
    phone: { type: ['string', 'null'], maxLength: 32 },
  },
} as const;
