import { describe, expect, it } from 'vitest';
import {
  friendRequestBodySchema,
  friendRequestDecisionSchema,
  friendshipListResponseSchema,
  socialSearchQuerySchema,
  socialSearchResponseSchema,
} from '../src/modules/social/social.schema.js';

const userId = '71000000-0000-4000-8000-000000000001';
const profile = {
  user_id: userId,
  username: 'artemis',
  display_name: 'Artemis',
  avatar_url: 'https://example.test/avatar.png',
  bio: 'Exploradora',
};

describe('social request validation', () => {
  it.each(['art', ' ART '])('trims and accepts a nick query %j', (q) => {
    expect(socialSearchQuerySchema.parse({ q })).toEqual({ q: q.trim().toLowerCase() });
  });

  it.each(['a', 'a'.repeat(21), 'bad nick', '@artemis', '%'])('rejects an invalid nick query %j', (q) => {
    expect(socialSearchQuerySchema.safeParse({ q }).success).toBe(false);
  });

  it('rejects extra query and body fields instead of accepting caller identity', () => {
    expect(socialSearchQuerySchema.safeParse({ q: 'art', email: 'friend@example.test' }).success).toBe(false);
    expect(friendRequestBodySchema.safeParse({ recipient_user_id: userId, requester_user_id: userId }).success).toBe(false);
  });

  it.each(['accept', 'decline', 'cancel'] as const)('accepts the %s request decision', (decision) => {
    expect(friendRequestDecisionSchema.parse({ decision })).toEqual({ decision });
  });

  it('accepts only public profile fields and rejects email in search results', () => {
    expect(socialSearchResponseSchema.safeParse({ status: 'ok', results: [profile] }).success).toBe(true);
    expect(socialSearchResponseSchema.safeParse({ status: 'ok', results: [{ ...profile, email: 'private@example.test' }] }).success).toBe(false);
  });

  it('validates both sides of the friendship list contract', () => {
    expect(friendshipListResponseSchema.safeParse({
      status: 'ok',
      friends: [{ ...profile, since: '2026-11-16T12:00:00.000Z' }],
      incoming_requests: [{ id: userId, ...profile, created_at: '2026-11-16T12:00:00.000Z' }],
      outgoing_requests: [],
    }).success).toBe(true);
  });
});
