import type { SupabaseClient } from '@supabase/supabase-js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import { createCampaignRpcResponseSchema, type CreateCampaignInput } from './campaigns.schema.js';

export async function createSystemCampaign(
  client: SupabaseClient,
  userId: string,
  systemId: string,
  input: CreateCampaignInput,
) {
  const access = await readMySystemMemberships(client);
  const canManage = access.is_platform_admin || access.memberships.some((membership) =>
    membership.game_system_id === systemId && membership.role === 'owner');
  if (!canManage) return { status: 'forbidden' } as const;

  const { data: character, error: characterError } = await client.from('characters')
    .select('id,user_id,game_system_id,status')
    .eq('id', input.character_id).eq('user_id', userId).eq('game_system_id', systemId).eq('status', 'active').maybeSingle();
  if (characterError) throw characterError;
  if (!character || character.user_id !== userId || character.game_system_id !== systemId || character.status !== 'active') {
    return { status: 'character_not_found' } as const;
  }

  const { data, error } = await client.rpc('create_system_campaign', {
    p_game_system_id: systemId,
    p_character_id: input.character_id,
    p_name: input.name,
    p_description: input.description ?? null,
  });
  if (error) throw error;
  const parsed = createCampaignRpcResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid created campaign response');
  if (parsed.data.status !== 'created') return parsed.data;
  if (parsed.data.character_id !== input.character_id || parsed.data.campaign.game_system_id !== systemId) {
    throw new Error('Invalid created campaign response');
  }
  return { status: 'created', campaign: parsed.data.campaign } as const;
}
