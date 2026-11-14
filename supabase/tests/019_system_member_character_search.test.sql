BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('29000000-0000-4000-8000-000000000001', 'member-search-owner@example.test', '{}'),
  ('29000000-0000-4000-8000-000000000002', 'member-search-player@example.test', '{"display_name":"Player Search"}'),
  ('29000000-0000-4000-8000-000000000003', 'member-search-other-owner@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES
  ('39000000-0000-4000-8000-000000000001', 'member-search-system', 'Member Search System',
   '29000000-0000-4000-8000-000000000001'),
  ('39000000-0000-4000-8000-000000000002', 'member-search-other-system', 'Other Member Search System',
   '29000000-0000-4000-8000-000000000003');

INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
VALUES
  ('29000000-0000-4000-8000-000000000002',
   '39000000-0000-4000-8000-000000000001', 'user'),
  ('29000000-0000-4000-8000-000000000002',
   '39000000-0000-4000-8000-000000000002', 'user');

INSERT INTO public.characters (id, user_id, game_system_id, character_name, status)
VALUES
  ('59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000002',
   '39000000-0000-4000-8000-000000000001', 'Liora da Floresta', 'active'),
  ('59000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000002',
   '39000000-0000-4000-8000-000000000002', 'A Liora de Outra Terra', 'active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"29000000-0000-4000-8000-000000000001"}', true);
SELECT is(
  public.search_system_members_by_character_name(
    '39000000-0000-4000-8000-000000000001', '  lIoRa  '
  ) ->> 'status',
  'ok',
  'Owner can search system members by a trimmed, case-insensitive character name'
);
SELECT is(
  public.search_system_members_by_character_name(
    '39000000-0000-4000-8000-000000000001', '  lIoRa  '
  ) -> 'results',
  '[{"user_id":"29000000-0000-4000-8000-000000000002","character_name":"Liora da Floresta","display_name":"Player Search"}]'::jsonb,
  'Owner search returns the matching member and excludes matches from other systems'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"29000000-0000-4000-8000-000000000002"}', true);
SELECT is(
  public.search_system_members_by_character_name(
    '39000000-0000-4000-8000-000000000001', 'Liora'
  ) ->> 'status',
  'not_owner',
  'A non-Owner cannot search system members'
);
SELECT is(
  public.search_system_members_by_character_name(
    '39000000-0000-4000-8000-000000000001', 'Liora'
  ) -> 'results',
  '[]'::jsonb,
  'A non-Owner receives no member search results'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
