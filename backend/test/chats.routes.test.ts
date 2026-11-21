import { withActiveAccount } from './fixtures/supabase-fetch.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = 'e1000000-0000-4000-8000-000000000001';
const characterId = 'e2000000-0000-4000-8000-000000000001';
const chatId = 'e3000000-0000-4000-8000-000000000001';
const systemId = 'e4000000-0000-4000-8000-000000000001';
const otherCharacterId = 'e2000000-0000-4000-8000-000000000002';
const createdAt = '2026-11-15T12:00:00.000Z';
let memberships: Record<string, unknown>[];
let chats: Record<string, unknown>[];
let messages: Record<string, unknown>[];
let characterRows: Record<string, unknown>[];
let systemMemberships: { is_platform_admin: boolean; memberships: { game_system_id: string; game_system_name: string; role: 'owner' | 'mod' | 'user' }[] };
let requests: { url: URL; method: string; body: unknown }[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  memberships = [{ chat_id: chatId, game_system_id: systemId, role: 'game_master' }];
  chats = [{ id: chatId, game_system_id: systemId, name: 'The Old Road', description: 'Opening scene', status: 'active', created_at: createdAt }];
  messages = [{ id: 'e5000000-0000-4000-8000-000000000001', chat_id: chatId, character_id: otherCharacterId, content: 'The journey begins!', created_at: createdAt }];
  characterRows = [{ id: characterId, user_id: userId, status: 'active', game_system_id: systemId, name: 'Liora' }];
  systemMemberships = { is_platform_admin: false, memberships: [{ game_system_id: systemId, game_system_name: 'System', role: 'owner' }] };
  requests = [];
  vi.stubGlobal('fetch', withActiveAccount(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {}, created_at: createdAt });
    if (url.pathname === '/rest/v1/rpc/get_my_system_memberships') return Response.json(systemMemberships);
    if (url.pathname === '/rest/v1/characters') return Response.json(characterRows);
    if (url.pathname === '/rest/v1/rpc/create_system_chat' && method === 'POST') return Response.json({
      status: 'created',
      chat: { id: chatId, game_system_id: systemId, name: 'The Old Road', description: 'Opening scene', status: 'active', created_at: createdAt },
      character_id: characterId,
    });
    if (url.pathname === '/rest/v1/chat_members') return Response.json(memberships);
    if (url.pathname === '/rest/v1/chats') return Response.json(chats);
    if (url.pathname === '/rest/v1/messages') return method === 'GET'
      ? Response.json(messages)
      : Response.json({ ...body as object, id: 'e5000000-0000-4000-8000-000000000002', created_at: createdAt });
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(method: 'GET' | 'POST', path: string, payload?: unknown) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({ method, url: path, headers: { authorization: 'Bearer chat-token', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) });
  } finally { await app.close(); }
}

const characterChatsPath = `/api/v1/me/characters/${characterId}/chats`;
const input = { character_id: characterId, name: '  The Old Road  ', description: '  Opening scene  ' };

describe('chat API', () => {
  it('creates a chat directly and makes the supplied character its host', async () => {
    const response = await request('POST', `/api/v1/owner/game-systems/${systemId}/chats`, input);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ chat: { id: chatId, game_system_id: systemId, name: 'The Old Road', description: 'Opening scene', status: 'active', created_at: createdAt }, character_id: characterId });
    expect(requests.find(({ url, method }) => url.pathname === '/rest/v1/rpc/create_system_chat' && method === 'POST')?.body).toEqual({ p_game_system_id: systemId, p_character_id: characterId, p_name: 'The Old Road', p_description: 'Opening scene' });
  });

  it('blocks a regular system member from creating a chat', async () => {
    systemMemberships = { is_platform_admin: false, memberships: [{ game_system_id: systemId, game_system_name: 'System', role: 'user' }] };
    const response = await request('POST', `/api/v1/owner/game-systems/${systemId}/chats`, input);
    expect(response.statusCode).toBe(403);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/rpc/create_system_chat')).toBe(false);
  });

  it('rejects blank titles before writing', async () => {
    const response = await request('POST', `/api/v1/owner/game-systems/${systemId}/chats`, { ...input, name: '   ' });
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/rpc/create_system_chat')).toBe(false);
  });

  it('rejects an inactive, foreign, or cross-system host character', async () => {
    for (const row of [
      { id: characterId, user_id: userId, status: 'inactive', game_system_id: systemId },
      { id: characterId, user_id: 'e1000000-0000-4000-8000-000000000099', status: 'active', game_system_id: systemId },
      { id: characterId, user_id: userId, status: 'active', game_system_id: 'e4000000-0000-4000-8000-000000000099' },
    ]) {
      characterRows = [row];
      const response = await request('POST', `/api/v1/owner/game-systems/${systemId}/chats`, input);
      expect(response.statusCode).toBe(404);
    }
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/rpc/create_system_chat')).toBe(false);
  });

  it('lists chat entities directly for the selected owned character', async () => {
    const response = await request('GET', characterChatsPath);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ chats: [{ id: chatId, game_system_id: systemId, name: 'The Old Road', description: 'Opening scene', status: 'active', created_at: createdAt }] });
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/chat_members' && url.searchParams.get('character_id') === `eq.${characterId}`)).toBe(true);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/chats' && url.searchParams.get('id')?.includes(chatId))).toBe(true);
  });

  it('reads and sends messages directly by chat id', async () => {
    const read = await request('GET', `${characterChatsPath}/${chatId}/messages`);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ messages });
    expect(requests.find(({ url }) => url.pathname === '/rest/v1/messages' && url.searchParams.has('chat_id'))?.url.searchParams.get('chat_id')).toBe(`eq.${chatId}`);

    const sent = await request('POST', `${characterChatsPath}/${chatId}/messages`, { content: '  Follow the trail.  ' });
    expect(sent.statusCode).toBe(201);
    expect(requests.find(({ url, method }) => url.pathname === '/rest/v1/messages' && method === 'POST')?.body).toEqual({ chat_id: chatId, character_id: characterId, content: 'Follow the trail.' });
  });

  it('does not read or send messages when the selected character is not a chat member', async () => {
    memberships = [];
    const read = await request('GET', `${characterChatsPath}/${chatId}/messages`);
    const sent = await request('POST', `${characterChatsPath}/${chatId}/messages`, { content: 'Should not be sent' });
    expect(read.statusCode).toBe(404);
    expect(sent.statusCode).toBe(404);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/messages')).toBe(false);
  });

  it('rejects empty or oversized message content before a write', async () => {
    const empty = await request('POST', `${characterChatsPath}/${chatId}/messages`, { content: '   ' });
    const long = await request('POST', `${characterChatsPath}/${chatId}/messages`, { content: 'm'.repeat(2001) });
    expect(empty.statusCode).toBe(400);
    expect(long.statusCode).toBe(400);
    expect(requests.every(({ url, method }) => url.pathname !== '/rest/v1/messages' || method !== 'POST')).toBe(true);
  });
});
