import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';
const system = '30000000-0000-4000-8000-000000000001';
const character = '50000000-0000-4000-8000-000000000001';
const item = '40000000-0000-4000-8000-000000000001';
const listing = '60000000-0000-4000-8000-000000000001';
const product = '70000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000002';
let owner: boolean, admin: boolean, validCharacter: boolean, status: string;
let calls: { url: URL; method: string; body: any; headers: Headers }[];
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test');
  owner = false; admin = false; validCharacter = true; status = 'purchased'; calls = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    const table = url.pathname.split('/').at(-1);
    if (table === 'join_game_system_with_password') return Response.json({ status: 'ok' });
    if (table === 'get_my_system_memberships') return Response.json({ is_platform_admin: admin, memberships: [{ game_system_id: system, game_system_name: 'A', role: owner ? 'owner' : 'user' }] });
    if (table === 'purchase_store_product') return Response.json(status === 'purchased' ? { status, balance: 12, purchase_id: listing, item_id: item, item_name: 'Potion', quantity: 2, amount_charged: 3, currency_name: 'Coins' } : { status });
    if (method !== 'GET') return Response.json(table === 'products' ? { id: product } : null);
    if (table === 'characters') return Response.json(validCharacter ? { id: character, game_system_id: system } : null);
    if (table === 'game_systems') return Response.json({ id: system, currency_name: 'Coins', is_active: true });
    if (table === 'character_wallets') return Response.json({ balance: 15 });
    if (table === 'items') return Response.json([{ id: item, name: 'Potion' }]);
    if (table === 'products') return Response.json([{ id: product, item_id: item, ability_id: null }, { id: character, item_id: null, ability_id: character }]);
    if (table === 'store_products') return Response.json([{ id: listing, product_id: product, price: 1.5, is_available: true }, { id: character, product_id: character, price: 2, is_available: true }]);
    throw new Error(`Unexpected ${url}`);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function request(method: 'GET'|'POST'|'PUT', path: string, payload?: unknown, auth = true) {
 const app = buildApp({ nodeEnv: 'test' });
 try { return await app.inject({ method, url: path, headers: auth ? { authorization: 'Bearer test' } : {}, ...(payload === undefined ? {} : { payload: JSON.stringify(payload), headers: { ...(auth ? { authorization: 'Bearer test' } : {}), 'content-type': 'application/json' } }) }); } finally { await app.close(); }
}
const playerPath = `/api/v1/game-systems/${system}/store`;
const ownerPath = `/api/v1/owner/game-systems/${system}/store`;
const purchase = { character_id: character, store_product_id: listing, quantity: 2 };
describe('store routes', () => {
 it('requires authentication', async () => { expect((await request('GET', `${playerPath}?character_id=${character}`, undefined, false)).statusCode).toBe(401); });
 it('requires selected owned character in the route system', async () => {
   expect((await request('GET', playerPath)).statusCode).toBe(400);
   validCharacter = false;
   expect((await request('GET', `${playerPath}?character_id=${character}`)).statusCode).toBe(400);
   expect((await request('POST', `${playerPath}/purchases`, purchase)).statusCode).toBe(400);
   expect(calls.some((c) => c.url.pathname.endsWith('/purchase_store_product'))).toBe(false);
 });
 it('returns wallet and item offers with authenticated, scoped queries', async () => {
   const res = await request('GET', `${playerPath}?character_id=${character}`);
   expect(res.statusCode).toBe(200); expect(res.json()).toEqual({ currency_name: 'Coins', character_id: character, balance: 15, offers: [{ store_product_id: listing, item_id: item, item_name: 'Potion', price: 1.5, is_available: true }] });
   const query = calls.find((c) => c.url.pathname.endsWith('/characters'))!;
   expect(query.url.searchParams.get('game_system_id')).toBe(`eq.${system}`);
   expect(query.url.searchParams.get('user_id')).toBe(`eq.${user}`);
   expect(query.headers.get('authorization')).toBe('Bearer test');
 });
 it('blocks non-owner writes before any mutation', async () => {
   expect((await request('PUT', ownerPath, { currency_name: 'Coins', offers: [] })).statusCode).toBe(403);
   expect(calls.some((c) => ['PATCH','POST','DELETE'].includes(c.method) && !c.url.pathname.includes('/rpc/'))).toBe(false);
 });
 it.each(['owner','admin'])('allows %s and deactivates removed offers without deleting history', async (role) => {
   owner = role === 'owner'; admin = role === 'admin';
   expect((await request('PUT', ownerPath, { currency_name: 'Gold', offers: [] })).statusCode).toBe(200);
   expect(calls.some((c) => c.method === 'PATCH' && c.url.pathname.endsWith('/store_products') && c.body.is_available === false)).toBe(true);
   expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
 });
 it('rejects unknown item or listing IDs before mutations', async () => {
   owner = true;
   const res = await request('PUT', ownerPath, { currency_name: 'Coins', offers: [{ item_id: character, price: 1, is_available: true }] });
   expect(res.statusCode).toBe(400);
   expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
 });
 it('purchases through the fixed RPC and exposes balance and snapshots', async () => {
   const res = await request('POST', `${playerPath}/purchases`, purchase);
   expect(res.statusCode).toBe(201); expect(res.json()).toMatchObject({ balance: 12, currency_name: 'Coins', amount_charged: 3 });
   expect(calls.find((c) => c.url.pathname.endsWith('/purchase_store_product'))?.body).toEqual({ p_character_id: character, p_store_product_id: listing, p_quantity: 2 });
 });
 it.each([['unauthorized',401],['invalid_quantity',400],['invalid_character',400],['system_mismatch',400],['offer_unavailable',404],['system_unavailable',404],['insufficient_funds',409],['unexpected',500]])('maps %s to %s', async (value, code) => {
   status = String(value); expect((await request('POST', `${playerPath}/purchases`, purchase)).statusCode).toBe(code);
 });
 it('rejects caller price overrides before database purchase', async () => {
   expect((await request('POST', `${playerPath}/purchases`, { ...purchase, price: 0 })).statusCode).toBe(400);
   expect(calls.some((c) => c.url.pathname.endsWith('/purchase_store_product'))).toBe(false);
 });
});


it('publishes store selection and strict owner and purchase inputs in OpenAPI', async () => {
  const app = buildApp({ nodeEnv: 'development' });
  try {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    const paths = response.json().paths;
    expect(paths['/api/v1/game-systems/{systemId}/store'].get.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'character_id', in: 'query', required: true })]));
    expect(paths['/api/v1/game-systems/{systemId}/store/purchases'].post.requestBody).toBeDefined();
    expect(paths['/api/v1/owner/game-systems/{systemId}/store'].put.requestBody).toBeDefined();
  } finally { await app.close(); }
});

it('reads owner item catalog but hides it from a player', async () => {
  expect((await request('GET', ownerPath)).statusCode).toBe(404);
  owner = true;
  const response = await request('GET', ownerPath);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ items: [{ id: item, name: 'Potion' }], offers: [{ store_product_id: listing, item_id: item }] });
  expect(response.json().offers).toHaveLength(1);
});
it('updates existing offers and creates new offers from system items', async () => {
  owner = true;
  const response = await request('PUT', ownerPath, { currency_name: 'Gold', offers: [
    { store_product_id: listing, item_id: item, price: 3, is_available: false },
    { item_id: item, price: 2, is_available: true },
  ] });
  expect(response.statusCode).toBe(200);
  expect(calls.find((c) => c.method === 'PATCH' && c.url.pathname.endsWith('/store_products'))?.body).toEqual({ price: 3, is_available: false });
  expect(calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/store_products'))?.body).toEqual({ game_system_id: system, product_id: product, price: 2, is_available: true });
  expect(calls.filter((c) => c.method === 'PATCH' && c.url.pathname.endsWith('/store_products')).every((c) => c.url.searchParams.get('id') === `eq.${listing}`)).toBe(true);
});
