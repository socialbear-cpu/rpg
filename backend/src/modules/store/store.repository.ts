import type { SupabaseClient } from '@supabase/supabase-js';
import { readMySystemMemberships } from '../system-membership/system-membership.repository.js';
import { storePurchaseResultSchema, type StoreSchedule, type StorePurchase } from './store.schema.js';

async function result<T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export async function canManageStore(client: SupabaseClient, systemId: string) {
  const access = await readMySystemMemberships(client);
  return access.is_platform_admin || access.memberships.some((m) => m.game_system_id === systemId && m.role === 'owner');
}
export async function readStoreCharacter(client: SupabaseClient, userId: string, systemId: string, characterId: string) {
  return result(client.from('characters').select('id,game_system_id').eq('id', characterId)
    .eq('user_id', userId).eq('game_system_id', systemId).eq('status', 'active').maybeSingle());
}
async function readCatalog(client: SupabaseClient, systemId: string) {
  const [products, listings, items] = await Promise.all([
    result(client.from('products').select('id,item_id,ability_id').eq('game_system_id', systemId).not('item_id', 'is', null)),
    result(client.from('store_products').select('id,product_id,price,is_available').eq('game_system_id', systemId).order('created_at')),
    result(client.from('items').select('id,name').eq('game_system_id', systemId).order('name')),
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
  const catalog = await readCatalog(client, systemId);
  // Validate all references before writing. Removed listings remain for purchase history.
  if (input.offers.some((offer) => !catalog.items.some((item) => item.id === offer.item_id)
    || (offer.store_product_id && !catalog.offers.some((old) => old.store_product_id === offer.store_product_id && old.item_id === offer.item_id)))) return false;
  await result(client.from('game_systems').update({ currency_name: input.currency_name }).eq('id', systemId));
  for (const old of catalog.offers) {
    if (!input.offers.some((offer) => offer.store_product_id === old.store_product_id)) {
      await result(client.from('store_products').update({ is_available: false }).eq('id', old.store_product_id).eq('game_system_id', systemId));
    }
  }
  for (const offer of input.offers) {
    if (offer.store_product_id) {
      await result(client.from('store_products').update({ price: offer.price, is_available: offer.is_available }).eq('id', offer.store_product_id).eq('game_system_id', systemId));
    } else {
      let productId = catalog.itemProducts.find((p) => p.item_id === offer.item_id)?.id;
      if (!productId) {
        const product = await result(client.from('products').insert({ game_system_id: systemId, item_id: offer.item_id }).select('id').single());
        if (!product) throw new Error('Product insert failed');
        productId = product.id;
        catalog.itemProducts.push({ id: productId, item_id: offer.item_id, ability_id: null });
      }
      await result(client.from('store_products').insert({ game_system_id: systemId, product_id: productId, price: offer.price, is_available: offer.is_available }));
    }
  }
  return true;
}
export async function purchaseStoreOffer(client: SupabaseClient, input: StorePurchase) {
  const data = await result(client.rpc('purchase_store_product', { p_character_id: input.character_id, p_store_product_id: input.store_product_id, p_quantity: input.quantity }));
  return storePurchaseResultSchema.parse(data);
}
