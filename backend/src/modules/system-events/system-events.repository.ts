import type { SupabaseClient } from '@supabase/supabase-js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import { systemEventSchema, systemEventsResponseSchema, type SystemEvent, type SystemEventInput } from './system-events.schema.js';

const eventColumns = 'id,game_system_id,title,description,starts_at,ends_at,started_at,created_at,updated_at';

export async function canManageSystemEvents(client: SupabaseClient, systemId: string) {
  const access = await readMySystemMemberships(client);
  return access.is_platform_admin || access.memberships.some((membership) =>
    membership.game_system_id === systemId && membership.role === 'owner');
}

export async function listSystemEvents(client: SupabaseClient, systemId: string): Promise<SystemEvent[]> {
  const { data, error } = await client.from('game_system_events').select(eventColumns)
    .eq('game_system_id', systemId).order('starts_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  const parsed = systemEventsResponseSchema.safeParse({ events: data ?? [] });
  if (!parsed.success) throw new Error('Invalid system events response');
  return parsed.data.events;
}

export async function createSystemEvent(client: SupabaseClient, systemId: string, input: SystemEventInput): Promise<SystemEvent> {
  const { data, error } = await client.from('game_system_events').insert({
    game_system_id: systemId,
    title: input.title,
    description: input.description,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
  }).select(eventColumns).single();
  if (error) throw error;
  const parsed = systemEventSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid system event response');
  return parsed.data;
}

export async function updateSystemEvent(client: SupabaseClient, systemId: string, eventId: string, input: SystemEventInput): Promise<SystemEvent | null> {
  const { data, error } = await client.from('game_system_events').update({
    title: input.title,
    description: input.description,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    updated_at: new Date().toISOString(),
  }).eq('id', eventId).eq('game_system_id', systemId).select(eventColumns).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parsed = systemEventSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid system event response');
  return parsed.data;
}

export async function deleteSystemEvent(client: SupabaseClient, systemId: string, eventId: string): Promise<boolean> {
  const { data, error } = await client.from('game_system_events').delete()
    .eq('id', eventId).eq('game_system_id', systemId).select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function startSystemEvent(client: SupabaseClient, systemId: string, eventId: string) {
  const startedAt = new Date().toISOString();
  const { data, error } = await client.from('game_system_events').update({ started_at: startedAt, updated_at: startedAt })
    .eq('id', eventId).eq('game_system_id', systemId).is('started_at', null).select(eventColumns).maybeSingle();
  if (error) throw error;
  if (data) {
    const parsed = systemEventSchema.safeParse(data);
    if (!parsed.success) throw new Error('Invalid system event response');
    return { status: 'started', event: parsed.data } as const;
  }
  const { data: existing, error: readError } = await client.from('game_system_events')
    .select('id,started_at').eq('id', eventId).eq('game_system_id', systemId).maybeSingle();
  if (readError) throw readError;
  if (!existing) return { status: 'not_found' } as const;
  return { status: 'already_started' } as const;
}
