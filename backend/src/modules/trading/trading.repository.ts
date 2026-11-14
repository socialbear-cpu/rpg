import type { SupabaseClient } from '@supabase/supabase-js';
import {
  tradeCharactersRpcSchema,
  tradeInventoryRpcSchema,
  tradeMutationResponseSchema,
  tradeOffersRpcSchema,
  ownedCharacterInventorySchema,
  ownedInventoryCharacterSchema,
  type CounterTradeOfferInput,
  type CreateTradeOfferInput,
  type TradeOfferResponseInput,
  type TradeOffersQuery,
} from './trading.schema.js';

function parseRpc<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid trading RPC response');
  return parsed.data;
}

async function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function readTradeCharacters(client: SupabaseClient, gameSystemId: string) {
  return parseRpc(tradeCharactersRpcSchema, await callRpc(client, 'get_trade_characters', {
    p_game_system_id: gameSystemId,
  }));
}

export async function readTradeInventory(client: SupabaseClient, gameSystemId: string, characterId: string) {
  return parseRpc(tradeInventoryRpcSchema, await callRpc(client, 'get_trade_inventory', {
    p_game_system_id: gameSystemId,
    p_character_id: characterId,
  }));
}

export async function readOwnedInventoryCharacter(client: SupabaseClient, userId: string, characterId: string) {
  const { data, error } = await client.from('characters')
    .select('id,game_system_id,character_name')
    .eq('id', characterId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const result = ownedInventoryCharacterSchema.safeParse(data);
  if (!result.success) throw new Error('Invalid owned inventory character response');
  return result.data;
}

export async function readOwnedCharacterInventory(
  client: SupabaseClient,
  character: { id: string; game_system_id: string; character_name: string },
) {
  const { data: inventory, error: inventoryError } = await client.from('character_inventory')
    .select('id,item_id,quantity,metadata')
    .eq('character_id', character.id)
    .order('acquired_at');
  if (inventoryError) throw inventoryError;

  const itemIds = [...new Set((inventory ?? []).map(({ item_id }) => item_id))];
  if (itemIds.length === 0) return { character, stacks: [] };

  const { data: items, error: itemsError } = await client.from('items')
    .select('id,name,description,item_type,rules_data')
    .eq('game_system_id', character.game_system_id)
    .in('id', itemIds);
  if (itemsError) throw itemsError;

  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const stacks = (inventory ?? []).map((stack) => {
    const item = itemById.get(stack.item_id);
    if (!item) throw new Error('Character inventory references an unavailable item');
    return {
      stack_id: stack.id,
      item_id: stack.item_id,
      item_name: item.name,
      description: item.description,
      item_type: item.item_type,
      rules_data: item.rules_data,
      quantity: stack.quantity,
      metadata: stack.metadata,
    };
  });
  const result = ownedCharacterInventorySchema.safeParse({ character, stacks });
  if (!result.success) throw new Error('Invalid owned character inventory response');
  return result.data;
}

export async function readTradeOffers(client: SupabaseClient, query: TradeOffersQuery) {
  return parseRpc(tradeOffersRpcSchema, await callRpc(client, 'get_trade_offers', {
    p_box: query.box,
    p_limit: query.limit,
    p_offset: query.offset,
  }));
}

export async function createTradeOffer(client: SupabaseClient, input: CreateTradeOfferInput) {
  return parseRpc(tradeMutationResponseSchema, await callRpc(client, 'create_trade_offer', {
    p_sender_character_id: input.sender_character_id,
    p_recipient_character_id: input.recipient_character_id,
    p_sender_lines: input.sender_lines,
    p_recipient_lines: input.recipient_lines,
  }));
}

export async function counterTradeOffer(client: SupabaseClient, offerId: string, input: CounterTradeOfferInput) {
  return parseRpc(tradeMutationResponseSchema, await callRpc(client, 'counter_trade_offer', {
    p_offer_id: offerId,
    p_sender_lines: input.sender_lines,
    p_recipient_lines: input.recipient_lines,
  }));
}

export async function respondToTradeOffer(client: SupabaseClient, offerId: string, input: TradeOfferResponseInput) {
  return parseRpc(tradeMutationResponseSchema, await callRpc(client, 'respond_to_trade_offer', {
    p_offer_id: offerId,
    p_action: input.action,
  }));
}

export async function cancelTradeOffer(client: SupabaseClient, offerId: string) {
  return parseRpc(tradeMutationResponseSchema, await callRpc(client, 'cancel_trade_offer', {
    p_offer_id: offerId,
  }));
}
