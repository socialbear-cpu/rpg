export const invalidPatches: unknown[] = [
  {}, null, [], 'name', { display_name: '' }, { display_name: ' \t ' },
  { display_name: 'x'.repeat(81) }, { display_name: null },
  { bio: 'x'.repeat(501) }, { bio: 12 },
  { avatar_url: 'https://example.com/' + 'x'.repeat(2048) },
  { avatar_url: 'ftp://example.com/avatar.png' }, { avatar_url: 'javascript:alert(1)' },
  { avatar_url: 'invalid' }, { avatar_url: '' },
  { user_id: 'other-user' }, { email: 'other@example.com' }, { role: 'admin' },
  { password: 'secret' }, { display_name: 'Valid', unknown: true },
];
