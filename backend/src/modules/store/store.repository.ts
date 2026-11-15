import type { SupabaseClient } from '@supabase/supabase-js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import { storeItemSchema, storePurchaseResultSchema, type StoreItemCreate, type StoreSchedule, type StorePurchase } from './store.schema.js';

async function result<T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export async function canManageStore(client: SupabaseClient, systemId: string) {
  const access = await readMySystemMemberships(client);
  return access.is_platform_admin || access.memberships.some((m) => m.game_system_id === systemId && m.role === 'owner');
}
export async function createStoreItem(client: SupabaseClient, systemId: string, input: StoreItemCreate) {
  const normalized = input.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52) || 'item';
  const slug = `${normalized}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const data = await result(client.from('items').insert({
    game_system_id: systemId,
    slug,
    name: input.name,
    description: input.description || null,
    item_type: input.item_type,
    image_url: input.image_url || null,
    rules_data: {},
  }).select('id,name,description,item_type,image_url').single());
  return storeItemSchema.parse(data);
}
export async function readStoreCharacter(client: SupabaseClient, userId: string, systemId: string, characterId: string) {
  return result(client.from('characters').select('id,game_system_id').eq('id', characterId)
    .eq('user_id', userId).eq('game_system_id', systemId).eq('status', 'active').maybeSingle());
}
async function readCatalog(client: SupabaseClient, systemId: string) {
  const [products, listings, items] = await Promise.all([
    result(client.from('products').select('id,item_id,ability_id').eq('game_system_id', systemId).not('item_id', 'is', null)),
    result(client.from('store_products').select('id,product_id,price,is_available').eq('game_system_id', systemId).order('created_at')),
    result(client.from('items').select('id,name,description,item_type,image_url').eq('game_system_id', systemId).order('name')),
  ]);
  const itemMap = new Map((items ?? []).map((item) => [item.id, item.name]));
  const itemProducts = (products ?? []).filter((p) => p.item_id && !p.ability_id && itemMap.has(p.item_id));
  const productMap = new Map(itemProducts.map((p) => [p.id, p.item_id]));
  const offers = (listings ?? []).flatMap((listing) => {
    const itemId = productMap.get(listing.product_id);
    return itemId ? [{ store_product_id: listing.id, item_id: itemId as string, item_name: itemMap.get(itemId) as string, price: Number(listing.price), is_available: listing.is_available as boolean }] : [];
  });
  return { items: items ?? [], offers, itemProducts };
}
export async function readStore(client: SupabaseClient, systemId: string, characterId?: string) {
  let query = client.from('game_systems').select('id,currency_name,is_active').eq('id', systemId);
  if (characterId) query = query.eq('is_active', true);
  const system = await result(query.maybeSingle());
  if (!system) return null;
  const catalog = await readCatalog(client, systemId);
  if (!characterId) return { currency_name: system.currency_name, items: catalog.items, offers: catalog.offers };
  const wallet = await result(client.from('character_wallets').select('balance').eq('character_id', characterId).eq('game_system_id', systemId).maybeSingle());
  if (!wallet) throw new Error('Character wallet missing');
  return { currency_name: system.currency_name, character_id: characterId, balance: Number(wallet.balance), offers: catalog.offers.filter((offer) => offer.is_available) };
}
export async function replaceStore(client: SupabaseClient, systemId: string, input: StoreSchedule) {
  const response = await result(client.rpc('replace_game_system_store', {
    p_game_system_id: systemId,
    p_currency_name: input.currency_name,
    p_offers: input.offers,
  }));
  const data = response as { status?: string } | null;
  if (data?.status === 'updated') return true;
  if (data?.status === 'invalid_store' || data?.status === 'invalid_offers') return false;
  throw new Error(`Store replacement failed: ${data?.status ?? 'unexpected response'}`);
}
export async function purchaseStoreOffer(client: SupabaseClient, input: StorePurchase) {
  const data = await result(client.rpc('purchase_store_product', { p_character_id: input.character_id, p_store_product_id: input.store_product_id, p_quantity: input.quantity }));
  return storePurchaseResultSchema.parse(data);
}
