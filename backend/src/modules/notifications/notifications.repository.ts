import type { SupabaseClient } from '@supabase/supabase-js';
import {
  notificationReadResultSchema,
  notificationPayloadSchemas,
  notificationSchema,
  notificationsResponseSchema,
  systemAnnouncementResultSchema,
  type AnnouncementInput,
} from './notifications.schema.js';

const notificationColumns = 'id,game_system_id,type,payload,read_at,created_at';

function parseNotification(value: unknown) {
  const parsed = notificationSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid notification row');

  const payloadSchema = Object.hasOwn(notificationPayloadSchemas, parsed.data.type)
    ? notificationPayloadSchemas[parsed.data.type as keyof typeof notificationPayloadSchemas]
    : undefined;
  if (!payloadSchema) return parsed.data;
  const payload = payloadSchema.safeParse(parsed.data.payload);
  if (!payload.success) return { ...parsed.data, type: 'unknown', payload: {} };
  return { ...parsed.data, payload: payload.data };
}

export async function listMyNotifications(client: SupabaseClient, limit: number, offset: number) {
  const [pageResult, unreadResult] = await Promise.all([
    client.from('notifications')
      .select(notificationColumns)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1),
    client.from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ]);

  if (pageResult.error) throw pageResult.error;
  if (unreadResult.error) throw unreadResult.error;

  const result = notificationsResponseSchema.safeParse({
    notifications: (pageResult.data ?? []).map(parseNotification),
    unread_count: unreadResult.count ?? 0,
    limit,
    offset,
  });
  if (!result.success) throw new Error('Invalid notifications response');
  return result.data;
}

export async function markMyNotificationRead(client: SupabaseClient, notificationId: string) {
  const { data, error } = await client.rpc('mark_my_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  const result = notificationReadResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid notification read response');
  return result.data;
}

export async function createSystemAnnouncement(
  client: SupabaseClient,
  systemId: string,
  input: AnnouncementInput,
) {
  const { data, error } = await client.rpc('create_system_announcement', {
    p_game_system_id: systemId,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) throw error;
  const result = systemAnnouncementResultSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid system announcement response');
  return result.data;
}
