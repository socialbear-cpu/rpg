import { describe, expect, it } from 'vitest';
import { moderatorAssignmentSchema } from '../src/modules/system-membership/system-membership.schema.js';

describe('system membership schemas', () => {
  it('accepts a strict boolean moderator assignment', () => {
    expect(moderatorAssignmentSchema.safeParse({ is_moderator: true }).success).toBe(true);
  });

  it.each([
    {},
    { is_moderator: 'true' },
    { is_moderator: true, role: 'owner' },
  ])('rejects malformed or escalated moderator assignment %j', (payload) => {
    expect(moderatorAssignmentSchema.safeParse(payload).success).toBe(false);
  });
});
