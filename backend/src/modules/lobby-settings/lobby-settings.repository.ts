import type { SupabaseClient } from '@supabase/supabase-js';
import { lobbySettingsDefaults, lobbySettingsSchema, type LobbySettings } from './lobby-settings.schema.js';

const settingsColumns = 'section_order,hidden_sections,welcome_title,welcome_message,accent_color';

export async function getSystemLobbySettings(client: SupabaseClient, systemId: string): Promise<LobbySettings> {
  const { data, error } = await client.from('game_system_lobby_settings')
    .select(settingsColumns).eq('game_system_id', systemId).maybeSingle();
  if (error) throw error;
  if (!data) return lobbySettingsDefaults;
  const parsed = lobbySettingsSchema.safeParse({
    section_order: data.section_order,
    hidden_sections: data.hidden_sections,
    welcome_title: data.welcome_title,
    welcome_message: data.welcome_message,
    accent_color: data.accent_color,
  });
  if (!parsed.success) throw new Error('Invalid system lobby settings response');
  return parsed.data;
}

export async function saveSystemLobbySettings(client: SupabaseClient, systemId: string, settings: LobbySettings): Promise<LobbySettings> {
  const { data, error } = await client.from('game_system_lobby_settings').upsert({
    game_system_id: systemId,
    ...settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'game_system_id' }).select(settingsColumns).single();
  if (error) throw error;
  const parsed = lobbySettingsSchema.safeParse({
    section_order: data.section_order,
    hidden_sections: data.hidden_sections,
    welcome_title: data.welcome_title,
    welcome_message: data.welcome_message,
    accent_color: data.accent_color,
  });
  if (!parsed.success) throw new Error('Invalid system lobby settings response');
  return parsed.data;
}
