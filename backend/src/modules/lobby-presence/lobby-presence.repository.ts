import type { SupabaseClient } from '@supabase/supabase-js';
import { lobbyPresenceCountSchema } from './lobby-presence.schema.js';

export async function heartbeatGameSystemLobbyPresence(client: SupabaseClient, systemId: string) {
  const { data, error } = await client.rpc('heartbeat_game_system_lobby_presence', { p_game_system_id: systemId });
  if (error) throw error;
  const count = lobbyPresenceCountSchema.safeParse(data);
  if (!count.success) throw new Error('Invalid lobby presence response');
  return count.data;
}
