import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';

const userId = '71000000-0000-4000-8000-000000000001';
const friendId = '71000000-0000-4000-8000-000000000002';
const requestId = '71000000-0000-4000-8000-000000000003';
const authorization = 'Bearer accepted-token';
const publicProfile = {
  user_id: friendId, username: 'artemis', display_name: 'Artemis',
  avatar_url: 'https://example.test/avatar.png', bio: 'Exploradora',
};
let requests: { url: URL; method: string; headers: Headers; body: unknown }[];
let rpcResponses: Record<string, unknown>;
let databaseFails: boolean;
let authFails: boolean;

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  requests = [];
  rpcResponses = {
    get_my_account_status: true,
    search_social_profiles: { status: 'ok', results: [publicProfile] },
    list_my_friendships: { status: 'ok', friends: [], incoming_requests: [], outgoing_requests: [] },
    create_friend_request: { status: 'created', request_id: requestId },
    respond_friend_request: { status: 'accepted', request_id: requestId },
    cancel_friend_request: { status: 'cancelled', request_id: requestId },
    remove_friend: { status: 'removed' },
    create_rpg_invitation: { status: 'pending_owner_approval', invitation_id: requestId },
    list_my_social_invitations: { status: 'ok', owner_approvals: [], recipient_invitations: [] },
    respond_rpg_invitation: { status: 'pending_recipient', invitation_id: requestId },
  };
  databaseFails = false;
  authFails = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, headers, body });
    if (url.pathname === '/auth/v1/user') {
      if (authFails) return Response.json({ message: 'Invalid JWT', code: 'bad_jwt' }, { status: 401 });
      return Response.json({
        id: userId, aud: 'authenticated', role: 'authenticated', email: 'private@example.test',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      });
    }
    const rpcName = url.pathname.split('/').at(-1);
    if (!rpcName || !url.pathname.startsWith('/rest/v1/rpc/')) throw new Error(`Unexpected request: ${url}`);
    if (databaseFails) return Response.json({ code: 'XX000', message: 'private database detail' }, { status: 500 });
    return Response.json(rpcResponses[rpcName]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function request(method: string, url: string, payload?: unknown, authorized = true) {
  const app = buildApp({ nodeEnv: 'test' });
  try {
    return await app.inject({
      method, url,
      headers: {
        ...(authorized ? { authorization } : {}),
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        'x-user-id': friendId,
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  } finally { await app.close(); }
}

describe('friendship API', () => {
  it('searches public profiles by normalized nick and returns no email', async () => {
    const response = await request('GET', '/api/v1/social/search?q=%20ART%20');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [publicProfile] });
    expect(response.body).not.toContain('email');
    const rpc = requests.find(({ url }) => url.pathname.endsWith('/search_social_profiles'))!;
    expect(rpc.method).toBe('POST');
    expect(rpc.body).toEqual({ p_query: 'art' });
    expect(rpc.headers.get('authorization')).toBe(authorization);
  });

  it.each(['/api/v1/social/search?q=a', '/api/v1/social/search?q=bad%20nick', '/api/v1/social/search?q=art&email=private'])('rejects invalid search query %s before database access', async (url) => {
    expect((await request('GET', url)).statusCode).toBe(400);
    expect(requests.filter(({ url: value }) => value.pathname.startsWith('/rest/') && !value.pathname.endsWith('/get_my_account_status'))).toHaveLength(0);
  });

  it('loads the authenticated friend graph', async () => {
    rpcResponses.list_my_friendships = {
      status: 'ok', friends: [{ ...publicProfile, since: '2026-11-16T12:00:00.000Z' }], incoming_requests: [], outgoing_requests: [],
    };
    const response = await request('GET', '/api/v1/me/friends');
    expect(response.statusCode).toBe(200);
    expect(response.json().friends[0]).toEqual({ ...publicProfile, since: '2026-11-16T12:00:00.000Z' });
    expect(requests.find(({ url }) => url.pathname.endsWith('/list_my_friendships'))?.body).toEqual({});
  });

  it('creates a request for the explicitly selected recipient', async () => {
    const response = await request('POST', '/api/v1/friend-requests', { recipient_user_id: friendId });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ status: 'created', request_id: requestId });
    expect(requests.find(({ url }) => url.pathname.endsWith('/create_friend_request'))?.body)
      .toEqual({ p_recipient_id: friendId });
  });

  it('rejects malformed or caller-controlled friend requests before database access', async () => {
    expect((await request('POST', '/api/v1/friend-requests', { recipient_user_id: 'not-a-uuid' })).statusCode).toBe(400);
    expect((await request('POST', '/api/v1/friend-requests', { recipient_user_id: friendId, requester_user_id: friendId })).statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/create_friend_request'))).toBe(false);
  });

  it.each([
    ['accept', 'respond_friend_request', { status: 'accepted', request_id: requestId }],
    ['decline', 'respond_friend_request', { status: 'declined', request_id: requestId }],
    ['cancel', 'cancel_friend_request', { status: 'cancelled', request_id: requestId }],
  ] as const)('%s a request using the corresponding database operation', async (decision, rpcName, result) => {
    rpcResponses[rpcName] = result;
    const response = await request('POST', `/api/v1/friend-requests/${requestId}/respond`, { decision });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
    expect(requests.find(({ url }) => url.pathname.endsWith(`/${rpcName}`))?.body)
      .toEqual(rpcName === 'cancel_friend_request' ? { p_request_id: requestId } : { p_request_id: requestId, p_decision: decision });
  });

  it('maps a request owned by someone else to forbidden', async () => {
    rpcResponses.respond_friend_request = { status: 'forbidden' };
    const response = await request('POST', `/api/v1/friend-requests/${requestId}/respond`, { decision: 'accept' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Não é permitido responder a este pedido.' });
  });

  it('removes an accepted friend bilaterally through the database operation', async () => {
    const response = await request('DELETE', `/api/v1/me/friends/${friendId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'removed' });
    expect(requests.find(({ url }) => url.pathname.endsWith('/remove_friend'))?.body)
      .toEqual({ p_friend_user_id: friendId });
  });

  it('requires a verified session and withholds unexpected database details', async () => {
    expect((await request('GET', '/api/v1/me/friends', undefined, false)).statusCode).toBe(401);
    authFails = true;
    expect((await request('GET', '/api/v1/me/friends')).statusCode).toBe(401);
    authFails = false;
    databaseFails = true;
    const response = await request('GET', '/api/v1/me/friends');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private database detail');
  });
});

describe('RPG invitation API', () => {
  it('creates invitations for systems and chats without accepting them for the recipient', async () => {
    for (const [url, body, rpcArgs] of [
      [`/api/v1/game-systems/${requestId}/invitations`, { friend_user_id: friendId }, { p_friend_user_id: friendId, p_game_system_id: requestId, p_chat_id: null }],
      [`/api/v1/chats/${requestId}/invitations`, { friend_user_id: friendId }, { p_friend_user_id: friendId, p_game_system_id: null, p_chat_id: requestId }],
    ] as const) {
      const response = await request('POST', url, body);
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ status: 'pending_owner_approval', invitation_id: requestId });
      expect(requests.find(({ url: rpcUrl }) => rpcUrl.pathname.endsWith('/create_rpg_invitation'))?.body).toEqual(rpcArgs);
      requests = [];
    }
  });

  it('lists invitation queues without exposing email', async () => {
    rpcResponses.list_my_social_invitations = { status: 'ok', owner_approvals: [], recipient_invitations: [] };
    const response = await request('GET', '/api/v1/me/social-invitations');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ owner_approvals: [], recipient_invitations: [] });
    expect(response.body).not.toContain('email');
  });

  it.each(['approve', 'decline', 'accept', 'cancel'] as const)('responds to a social invitation with %s', async (decision) => {
    rpcResponses.respond_rpg_invitation = { status: decision === 'approve' ? 'pending_recipient' : decision === 'accept' ? 'accepted' : decision === 'cancel' ? 'cancelled' : 'declined', invitation_id: requestId };
    const response = await request('POST', `/api/v1/social-invitations/${requestId}/respond`, { decision, character_id: friendId });
    expect(response.statusCode).toBe(200);
    expect(requests.find(({ url }) => url.pathname.endsWith('/respond_rpg_invitation'))?.body)
      .toEqual({ p_invitation_id: requestId, p_decision: decision, p_character_id: friendId });
  });

  it('rejects caller-controlled actor fields and malformed destinations', async () => {
    expect((await request('POST', `/api/v1/game-systems/${requestId}/invitations`, { friend_user_id: friendId, inviter_user_id: friendId })).statusCode).toBe(400);
    expect((await request('POST', `/api/v1/social-invitations/not-uuid/respond`, { decision: 'approve' })).statusCode).toBe(400);
    expect(requests.some(({ url }) => url.pathname.endsWith('/create_rpg_invitation') || url.pathname.endsWith('/respond_rpg_invitation'))).toBe(false);
  });
});
