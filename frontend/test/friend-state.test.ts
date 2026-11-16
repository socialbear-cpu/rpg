import { describe, expect, it } from 'vitest';
import { friendRequestState } from '../src/features/social/friend-state.js';

const otherId = '877c6931-5854-468f-88b2-a552f9e22dc1';
const graph = {
  friends: [{ user_id: otherId }],
  incoming_requests: [{ user_id: otherId, id: 'incoming-id' }],
  outgoing_requests: [{ user_id: otherId, id: 'outgoing-id' }],
};

describe('friendRequestState', () => {
  it('prioritizes an existing friendship', () => {
    expect(friendRequestState(otherId, graph)).toEqual({ state: 'friend' });
  });

  it('returns the incoming request id so the recipient can act on it', () => {
    expect(friendRequestState(otherId, { ...graph, friends: [], outgoing_requests: [] })).toEqual({ state: 'incoming', requestId: 'incoming-id' });
  });

  it('marks an outgoing request without suggesting another request', () => {
    expect(friendRequestState(otherId, { ...graph, friends: [], incoming_requests: [] })).toEqual({ state: 'outgoing' });
  });

  it('allows a new request when no relationship is active', () => {
    expect(friendRequestState('another-user', { friends: [], incoming_requests: [], outgoing_requests: [] })).toEqual({ state: 'none' });
  });
});
