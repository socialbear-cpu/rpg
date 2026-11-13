BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'access-owner@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000002', 'access-player@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id, is_public)
VALUES
  ('a2000000-0000-4000-8000-000000000001', 'password-system', 'Password System', 'a1000000-0000-4000-8000-000000000001', true),
  ('a2000000-0000-4000-8000-000000000002', 'public-system', 'Public System', 'a1000000-0000-4000-8000-000000000001', true);
UPDATE public.game_systems
SET is_public = false, access_password_hash = extensions.crypt('first protected password', extensions.gen_salt('bf', 4))
WHERE id = 'a2000000-0000-4000-8000-000000000001';
INSERT INTO public.game_systems (id, slug, name, owner_user_id, is_public, access_password_hash)
VALUES ('a2000000-0000-4000-8000-000000000003', 'hashed-password-system', 'Hashed Password System', 'a1000000-0000-4000-8000-000000000001', false, extensions.crypt('correct horse battery', extensions.gen_salt('bf', 4)));
INSERT INTO public.game_system_character_sheets (game_system_id, definition)
VALUES
  ('a2000000-0000-4000-8000-000000000001', '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::jsonb),
  ('a2000000-0000-4000-8000-000000000003', '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002"}', true);

SELECT is(private.can_access_game_system('a2000000-0000-4000-8000-000000000001'), false, 'private system is unavailable before password verification');
SELECT is(private.can_access_game_system('a2000000-0000-4000-8000-000000000002'), true, 'public system remains available');
SELECT is((SELECT count(*) FROM public.game_system_character_sheets WHERE game_system_id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'private sheet is hidden before access');
SELECT throws_ok(
  $$INSERT INTO public.characters (user_id, game_system_id, character_name)
    VALUES ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Blocked Character')$$,
  '42501', NULL, 'unauthorized user cannot create a character directly'
);
SELECT throws_ok(
  $$SELECT access_password_hash FROM public.game_systems WHERE id = 'a2000000-0000-4000-8000-000000000003'$$,
  '42501', NULL, 'authenticated users cannot read password hashes'
);
SELECT is(public.join_game_system_with_password('a2000000-0000-4000-8000-000000000001', NULL)->>'status', 'password_required', 'password is required to join');
SELECT is(public.join_game_system_with_password('a2000000-0000-4000-8000-000000000003', 'incorrect password')->>'status', 'invalid_password', 'incorrect password is rejected');
SELECT is((SELECT count(*) FROM public.game_system_memberships WHERE game_system_id = 'a2000000-0000-4000-8000-000000000003' AND user_id = 'a1000000-0000-4000-8000-000000000002'), 0::bigint, 'incorrect password does not create membership');
SELECT is(public.join_game_system_with_password('a2000000-0000-4000-8000-000000000003', 'correct horse battery')->>'status', 'ok', 'correct password authorizes entry');
SELECT is((SELECT role FROM public.game_system_memberships WHERE game_system_id = 'a2000000-0000-4000-8000-000000000003' AND user_id = 'a1000000-0000-4000-8000-000000000002'), 'user', 'successful access persists as system membership');
SELECT is((SELECT count(*) FROM public.game_system_character_sheets WHERE game_system_id = 'a2000000-0000-4000-8000-000000000003'), 1::bigint, 'authorized member can read the system sheet');
SELECT lives_ok(
  $$INSERT INTO public.characters (user_id, game_system_id, character_name)
    VALUES ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 'Access Character')$$,
  'authorized member can create a character'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}', true);
SELECT is(
  public.update_game_system_access_settings('a2000000-0000-4000-8000-000000000003', 'Hashed Password System', NULL, true, NULL)->>'status',
  'updated',
  'owner can remove the password protection'
);
RESET ROLE;
SELECT is((SELECT access_password_hash FROM public.game_systems WHERE id = 'a2000000-0000-4000-8000-000000000003'), NULL, 'removing protection clears the password hash');

SELECT * FROM finish();
ROLLBACK;
