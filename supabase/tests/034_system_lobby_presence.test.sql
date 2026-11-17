BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'presence-owner@example.test', '{}'),
  ('d1000000-0000-4000-8000-000000000002', 'presence-player@example.test', '{}'),
  ('d1000000-0000-4000-8000-000000000003', 'presence-removed@example.test', '{}'),
  ('d1000000-0000-4000-8000-000000000004', 'presence-stale@example.test', '{}');
INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES
  ('d2000000-0000-4000-8000-000000000001', 'presence-system-a', 'Presence A', 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'presence-system-b', 'Presence B', 'd1000000-0000-4000-8000-000000000002');
INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'owner'),
  ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'user'),
  ('d1000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'user'),
  ('d1000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'user'),
  ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'owner');

SELECT has_table('public', 'game_system_lobby_presence', 'presence table exists');
SELECT has_function('public', 'heartbeat_game_system_lobby_presence', ARRAY['uuid'], 'heartbeat RPC exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_system_lobby_presence'::regclass), 'presence table enforces RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.game_system_lobby_presence', 'SELECT'), 'authenticated cannot read presence rows directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.game_system_lobby_presence', 'INSERT'), 'authenticated cannot insert presence rows directly');
SELECT ok(NOT has_table_privilege('anon', 'public.game_system_lobby_presence', 'SELECT'), 'anonymous cannot read presence rows');
SELECT ok(NOT has_function_privilege('anon', 'public.heartbeat_game_system_lobby_presence(uuid)', 'EXECUTE'), 'anonymous cannot call heartbeat');
SELECT ok(has_function_privilege('authenticated', 'public.heartbeat_game_system_lobby_presence(uuid)', 'EXECUTE'), 'authenticated can call heartbeat');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
SELECT is(public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000001'), 1, 'first heartbeat counts the current member');
SELECT is(public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000001'), 1, 'repeated heartbeat from the same user does not duplicate presence');
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
SELECT is(public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000001'), 2, 'a second current member increases the aggregate count');
SELECT is(public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000002'), 1, 'presence count is isolated by system');
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
SELECT is(public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000001'), 3, 'another member can join the aggregate');
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$INSERT INTO public.game_system_lobby_presence (game_system_id, user_id, last_seen_at) VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', now())$$, '42501', NULL, 'authenticated cannot write presence directly');
RESET ROLE;

INSERT INTO public.game_system_lobby_presence (game_system_id, user_id, last_seen_at)
VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', now() - interval '91 seconds');
DELETE FROM public.game_system_memberships
WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001'
  AND user_id = 'd1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
SELECT is(public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000001'), 2, 'removed members and presence older than 90 seconds are excluded');
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
SELECT throws_ok($$SELECT public.heartbeat_game_system_lobby_presence('d2000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'non-member cannot create or count presence');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
