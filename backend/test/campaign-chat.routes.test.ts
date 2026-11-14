import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '21000000-0000-4000-8000-000000000001';
const characterId = '51000000-0000-4000-8000-000000000001';
const otherCharacterId = '51000000-0000-4000-8000-000000000002';
const campaignId = '61000000-0000-4000-8000-000000000001';
const roomId = '71000000-0000-4000-8000-000000000001';
const startsAt = '2026-11-14T12:00:00.000Z';
let characterRows: Record<string, unknown>[];
let campaignMemberships: Record<string, unknown>[];
let rooms: Record<string, unknown>[];
let messages: Record<string, unknown>[];
let requests: { url: URL; method: string; body: unknown }[];

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  characterRows = [{ id: characterId, user_id: userId, status: 'active', game_system_id: '31000000-0000-4000-8000-000000000001', character_name: 'Liora' }];
  campaignMemberships = [{ campaign_id: campaignId, game_system_id: '31000000-0000-4000-8000-000000000001', role: 'player' }];
  rooms = [{ id: roomId, campaign_id: campaignId, name: 'Taverna', created_at: startsAt }];
  messages = [{ id: '81000000-0000-4000-8000-000000000001', room_id: roomId, campaign_id: campaignId, character_id: otherCharacterId, content: 'A missão começa!', created_at: startsAt }];
  requests = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'player@example.test', app_metadata: {}, user_metadata: {}, created_at: startsAt });
    if (url.pathname === '/rest/v1/characters') return Response.json(characterRows);
    if (url.pathname === '/rest/v1/campaign_members') return Response.json(campaignMemberships);
    if (url.pathname === '/rest/v1/campaigns') return Response.json([{ id: campaignId, name: 'A Floresta' }]);
    if (url.pathname === '/rest/v1/chat_rooms') {
      if (method === 'GET') return Response.json(rooms);
      return Response.json({ ...body as object, id: roomId, created_at: startsAt });
    }
    if (url.pathname === '/rest/v1/messages') {
      if (method === 'GET') return Response.json(messages);
      return Response.json({ ...body as object, id: '81000000-0000-4000-8000-000000000002', created_at: startsAt });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(method: 'GET' | 'POST', path: string, payload?: unknown) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({ method, url: path, headers: { authorization: 'Bearer accepted-token', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) });
  } finally { await app.close(); }
}

const roomsPath = `/api/v1/me/characters/${characterId}/chat-rooms`;

describe('campaign chat API', () => {
  it('lists only rooms from campaigns joined by the selected owned character', async () => {
    const response = await request('GET', roomsPath);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ rooms: [{ ...rooms[0], campaign_name: 'A Floresta' }] });
    const membership = requests.find(({ url }) => url.pathname === '/rest/v1/campaign_members')!;
    expect(membership.url.searchParams.get('character_id')).toBe(`eq.${characterId}`);
    const characterQuery = requests.find(({ url }) => url.pathname === '/rest/v1/characters')!;
    expect(characterQuery.url.searchParams.get('user_id')).toBe(`eq.${userId}`);
    expect(characterQuery.url.searchParams.get('status')).toBe('eq.active');
    expect(requests.find(({ url }) => url.pathname === '/rest/v1/chat_rooms')!.url.searchParams.get('campaign_id')).toBe(`in.( ${campaignId} )`.replaceAll(' ', ''));
  });

  it('reads messages only from a room joined by the selected character', async () => {
    const response = await request('GET', `${roomsPath}/${roomId}/messages`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ messages });
    const query = requests.find(({ url }) => url.pathname === '/rest/v1/messages')!;
    expect(query.url.searchParams.get('room_id')).toBe(`eq.${roomId}`);
    expect(query.url.searchParams.get('campaign_id')).toBe(`eq.${campaignId}`);
  });

  it('sends with the character identity in the URL and campaign derived from the room', async () => {
    const response = await request('POST', `${roomsPath}/${roomId}/messages`, { content: '  Olá, grupo!  ' });
    expect(response.statusCode).toBe(201);
    expect(response.json().message).toMatchObject({ room_id: roomId, campaign_id: campaignId, character_id: characterId, content: 'Olá, grupo!' });
    const insert = requests.find(({ url, method }) => url.pathname === '/rest/v1/messages' && method === 'POST')!;
    expect(insert.body).toEqual({ room_id: roomId, campaign_id: campaignId, character_id: characterId, content: 'Olá, grupo!' });
  });

  it('does not look up rooms or messages when the selected character is not owned', async () => {
    characterRows = [];
    const response = await request('GET', roomsPath);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Character not found' });
    expect(requests.some(({ url }) => ['/rest/v1/campaign_members', '/rest/v1/chat_rooms', '/rest/v1/messages'].includes(url.pathname))).toBe(false);
  });

  it.each([
    ['inactive', { id: characterId, user_id: userId, status: 'inactive', game_system_id: '31000000-0000-4000-8000-000000000001' }],
    ['owned by another user', { id: characterId, user_id: '21000000-0000-4000-8000-000000000099', status: 'active', game_system_id: '31000000-0000-4000-8000-000000000001' }],
  ])('fails closed when the database returns a character that is %s', async (_description, row) => {
    characterRows = [row];
    const response = await request('GET', roomsPath);
    expect(response.statusCode).toBe(404);
    expect(requests.some(({ url }) => ['/rest/v1/campaign_members', '/rest/v1/chat_rooms', '/rest/v1/messages'].includes(url.pathname))).toBe(false);
  });

  it('does not read or send messages in a room outside the character campaigns', async () => {
    rooms = [];
    const read = await request('GET', `${roomsPath}/${roomId}/messages`);
    expect(read.statusCode).toBe(404);
    const sent = await request('POST', `${roomsPath}/${roomId}/messages`, { content: 'Not allowed' });
    expect(sent.statusCode).toBe(404);
    expect(requests.some(({ url }) => url.pathname === '/rest/v1/messages')).toBe(false);
  });

  it('rejects blank message content before database writes', async () => {
    const response = await request('POST', `${roomsPath}/${roomId}/messages`, { content: '  ' });
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ url, method }) => url.pathname === '/rest/v1/messages' && method === 'POST')).toBe(false);
  });

  it('rejects messages over 2000 characters before database writes', async () => {
    const response = await request('POST', `${roomsPath}/${roomId}/messages`, { content: 'a'.repeat(2001) });
    expect(response.statusCode).toBe(400);
    expect(requests.some(({ url, method }) => url.pathname === '/rest/v1/messages' && method === 'POST')).toBe(false);
  });
});
