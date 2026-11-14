BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'events-owner@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000002', 'events-member@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000003', 'events-admin@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('a2000000-0000-4000-8000-000000000001', 'events-system', 'Events System', 'a1000000-0000-4000-8000-000000000001');
INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'owner'),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'user');
INSERT INTO private.platform_admins (user_id)
VALUES ('a1000000-0000-4000-8000-000000000003');

SELECT has_table('public', 'game_system_events', 'system events table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_system_events'::regclass), 'system events has RLS enabled');
SELECT ok(has_table_privilege('authenticated', 'public.game_system_events', 'SELECT'), 'authenticated can read via RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.game_system_events', 'SELECT'), 'anonymous cannot read events');
SELECT ok(has_column_privilege('authenticated', 'public.game_system_events', 'title', 'UPDATE'), 'authenticated has event field update privilege');
SELECT ok(NOT has_column_privilege('authenticated', 'public.game_system_events', 'game_system_id', 'UPDATE'), 'authenticated cannot move an event to another system');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
INSERT INTO public.game_system_events (id, game_system_id, title, description, starts_at, ends_at)
VALUES ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Sessão zero', NULL, '2026-12-12 18:00:00+00', '2026-12-12 20:00:00+00');
SELECT lives_ok($$UPDATE public.game_system_events SET title = 'Sessão inicial' WHERE id = 'a3000000-0000-4000-8000-000000000001'$$, 'Owner updates a system event');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*) FROM public.game_system_events WHERE game_system_id = 'a2000000-0000-4000-8000-000000000001'), 1::bigint, 'system member can read event');
SELECT throws_ok($$INSERT INTO public.game_system_events (game_system_id, title, starts_at, ends_at) VALUES ('a2000000-0000-4000-8000-000000000001', 'Unauthorized', '2026-12-12 18:00:00+00', '2026-12-12 20:00:00+00')$$, '42501', NULL, 'system member cannot create events');
UPDATE public.game_system_events SET title = 'Stolen' WHERE id = 'a3000000-0000-4000-8000-000000000001';
DELETE FROM public.game_system_events WHERE id = 'a3000000-0000-4000-8000-000000000001';
SELECT is((SELECT title FROM public.game_system_events WHERE id = 'a3000000-0000-4000-8000-000000000001'), 'Sessão inicial', 'member cannot update or delete events');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SELECT lives_ok($$UPDATE public.game_system_events SET description = 'Admin edit' WHERE id = 'a3000000-0000-4000-8000-000000000001'$$, 'global Admin can update system events');
SELECT is((SELECT description FROM public.game_system_events WHERE id = 'a3000000-0000-4000-8000-000000000001'), 'Admin edit', 'Admin update persists');
DELETE FROM public.game_system_events WHERE id = 'a3000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.game_system_events), 0::bigint, 'global Admin can delete system events');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
