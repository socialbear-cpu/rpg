import { z } from 'zod';

export const notificationParamsSchema = z.strictObject({
  notificationId: z.uuid(),
});

export const systemAnnouncementParamsSchema = z.strictObject({
  systemId: z.uuid(),
});

export const announcementInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(2000),
});

export const notificationPayloadSchemas = {
  system_role_changed: z.strictObject({
    game_system_name: z.string(),
    previous_role: z.enum(['user', 'mod']),
    new_role: z.enum(['user', 'mod']),
  }),
  system_announcement: z.strictObject({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(2000),
  }),
} as const;

export const notificationSchema = z.strictObject({
  id: z.uuid(),
  game_system_id: z.uuid().nullable(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export const notificationsResponseSchema = z.strictObject({
  notifications: z.array(notificationSchema),
  unread_count: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(50),
  offset: z.number().int().nonnegative(),
});

export const notificationPaginationSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const notificationReadResultSchema = z.strictObject({
  status: z.enum(['updated', 'not_found', 'unauthorized']),
});

export const systemAnnouncementResultSchema = z.strictObject({
  status: z.enum(['created', 'invalid_content', 'not_authorized', 'unauthorized']),
  recipient_count: z.number().int().nonnegative().optional(),
});

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
export type NotificationItem = z.infer<typeof notificationSchema>;
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;
