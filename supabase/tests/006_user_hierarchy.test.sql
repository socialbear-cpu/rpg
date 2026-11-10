BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'game_system_memberships', 'system roles are stored per user and system');
SELECT has_table('private', 'platform_admins', 'global Admin assignments are kept in the private schema');
SELECT has_function('private', 'is_platform_admin', ARRAY[]::text[], 'global role helper uses the authenticated identity');
SELECT has_function('private', 'has_system_role', ARRAY['uuid', 'text[]'], 'system role helper uses the authenticated identity');

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('26000000-0000-4000-8000-000000000001', 'hierarchy-owner@example.test', '{}'),
  ('26000000-0000-4000-8000-000000000002', 'hierarchy-mod@example.test', '{}'),
  ('26000000-0000-4000-8000-000000000003', 'hierarchy-player@example.test', '{}'),
  ('26000000-0000-4000-8000-000000000004', 'hierarchy-admin@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('36000000-0000-4000-8000-000000000001', 'hierarchy-system', 'Hierarchy System',
        '26000000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000003"}', true);
INSERT INTO public.characters (id, user_id, game_system_id, character_name)
VALUES ('56000000-0000-4000-8000-000000000001',
        '26000000-0000-4000-8000-000000000003',
        '36000000-0000-4000-8000-000000000001', 'Hierarchy Player');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000003"}', true);
INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('36000000-0000-4000-8000-000000000002', 'hierarchy-created', 'Created System',
        '26000000-0000-4000-8000-000000000004');
RESET ROLE;

SELECT is(
  (SELECT role FROM public.game_system_memberships
   WHERE user_id = '26000000-0000-4000-8000-000000000003'
     AND game_system_id = '36000000-0000-4000-8000-000000000002'),
  'owner',
  'authenticated system creator becomes Owner even if a different owner was supplied'
);

INSERT INTO private.platform_admins (user_id)
VALUES ('26000000-0000-4000-8000-000000000004');

SELECT is(
  (SELECT role FROM public.game_system_memberships
   WHERE user_id = '26000000-0000-4000-8000-000000000001'
     AND game_system_id = '36000000-0000-4000-8000-000000000001'),
  'owner',
  'legacy owner assignment is represented as an Owner membership'
);
SELECT is(
  (SELECT role FROM public.game_system_memberships
   WHERE user_id = '26000000-0000-4000-8000-000000000003'
     AND game_system_id = '36000000-0000-4000-8000-000000000001'),
  'user',
  'a character owner receives the basic User role in that system'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000001"}', true);
SELECT ok(
  private.has_system_role('36000000-0000-4000-8000-000000000001', ARRAY['owner']),
  'Owner role is scoped to the authenticated user and selected system'
);
SELECT throws_ok(
  $$INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
    VALUES ('26000000-0000-4000-8000-000000000001',
            '36000000-0000-4000-8000-000000000001', 'admin')$$,
  '42501',
  'authenticated users cannot directly assign system roles'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000004"}', true);
SELECT ok(private.is_platform_admin(), 'a trusted platform Admin is recognized globally');
SELECT ok(
  private.has_system_role('36000000-0000-4000-8000-000000000001', ARRAY['owner']),
  'global Admin passes checks for a system they do not own'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
