import type { SupabaseClient } from '@supabase/supabase-js';
import {
  tradeCharactersRpcSchema,
  tradeInventoryRpcSchema,
  tradeMutationResponseSchema,
  tradeOffersRpcSchema,
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
