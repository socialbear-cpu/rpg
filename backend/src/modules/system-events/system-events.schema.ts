import { z } from 'zod';

const systemIdSchema = z.uuid();
const eventIdSchema = z.uuid();
const eventDateSchema = z.iso.datetime({ offset: true });

export const systemEventInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional().transform((value) => value?.trim() || null),
  starts_at: eventDateSchema,
  ends_at: eventDateSchema,
}).refine((event) => Date.parse(event.ends_at) > Date.parse(event.starts_at), 'End must follow start');

export const systemEventSchema = z.strictObject({
  id: eventIdSchema,
  game_system_id: systemIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  starts_at: eventDateSchema,
  ends_at: eventDateSchema,
  started_at: eventDateSchema.nullable().default(null),
  created_at: eventDateSchema,
  updated_at: eventDateSchema,
});

export const systemEventsResponseSchema = z.strictObject({ events: z.array(systemEventSchema) });
export type SystemEventInput = z.infer<typeof systemEventInputSchema>;
export type SystemEvent = z.infer<typeof systemEventSchema>;
