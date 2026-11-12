import { describe, expect, it } from 'vitest';
import { profilePatchSchema } from '../src/modules/profile/profile.schema.js';

import { invalidPatches } from './fixtures/profile.js';

describe('profile patch validation', () => {
  it.each(invalidPatches.map((body) => [body]))('rejects invalid patch %j', (body) => {
    expect(profilePatchSchema.safeParse(body).success).toBe(false);
  });

  it.each([1, 80])('trims and accepts a %i character display name', (length) => {
    expect(profilePatchSchema.parse({ display_name: `  ${'x'.repeat(length)}  ` }))
      .toEqual({ display_name: 'x'.repeat(length) });
  });

  it.each([3, 20])('normalizes and accepts a %i character nick', (length) => {
    const username = 'A'.repeat(length);
    expect(profilePatchSchema.parse({ username })).toEqual({ username: username.toLowerCase() });
  });

  it('accepts nullable fields, empty bio and the maximum field lengths', () => {
    for (const body of [
      { bio: null, avatar_url: null }, { bio: '' }, { bio: 'b'.repeat(500) },
      { avatar_url: 'https://example.com/' + 'x'.repeat(2028) },
      { avatar_url: 'http://example.com/avatar.png' },
    ]) expect(profilePatchSchema.parse(body)).toEqual(body);
  });
});
