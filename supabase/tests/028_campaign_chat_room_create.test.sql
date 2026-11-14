BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'room-system-owner@example.test', '{}'),
  ('b1000000-0000-4000-8000-000000000002', 'room-campaign-owner@example.test', '{}'),
  ('b1000000-0000-4000-8000-000000000003', 'room-game-master@example.test', '{}'),
  ('b1000000-0000-4000-8000-000000000004', 'room-player@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('b2000000-0000-4000-8000-000000000001', 'room-permissions-system', 'Room Permissions System', 'b1000000-0000-4000-8000-000000000001');
INSERT INTO public.campaigns (id, game_system_id, owner_user_id, name)
VALUES ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'Permission Campaign');
INSERT INTO public.characters (id, user_id, game_system_id, character_name)
VALUES
  ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'Room Game Master'),
  ('b4000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'Room Player');
INSERT INTO public.campaign_members (campaign_id, character_id, game_system_id, role)
VALUES
  ('b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'game_master'),
  ('b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'player');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_rooms'::regclass), 'chat rooms keep RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
SELECT lives_ok($$INSERT INTO public.chat_rooms (id, campaign_id, name) VALUES ('b5000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Campaign owner room')$$, 'campaign owner can create a room');
SELECT lives_ok($$UPDATE public.chat_rooms SET name = 'Owner renamed room' WHERE id = 'b5000000-0000-4000-8000-000000000001'$$, 'campaign owner rename attempt is safely filtered');
SELECT lives_ok($$DELETE FROM public.chat_rooms WHERE id = 'b5000000-0000-4000-8000-000000000001'$$, 'campaign owner delete attempt is safely filtered');
RESET ROLE;
SELECT is((SELECT name FROM public.chat_rooms WHERE id = 'b5000000-0000-4000-8000-000000000001'), 'Campaign owner room', 'campaign owner cannot rename or remove the room');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
SELECT lives_ok($$INSERT INTO public.chat_rooms (id, campaign_id, name) VALUES ('b5000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'Game master room')$$, 'linked campaign game master can create a room');
SELECT lives_ok($$UPDATE public.chat_rooms SET name = 'GM renamed room' WHERE id = 'b5000000-0000-4000-8000-000000000002'$$, 'campaign game master rename attempt is safely filtered');
SELECT lives_ok($$DELETE FROM public.chat_rooms WHERE id = 'b5000000-0000-4000-8000-000000000002'$$, 'campaign game master delete attempt is safely filtered');
RESET ROLE;
SELECT is((SELECT name FROM public.chat_rooms WHERE id = 'b5000000-0000-4000-8000-000000000002'), 'Game master room', 'campaign game master cannot rename or remove the room');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$INSERT INTO public.chat_rooms (campaign_id, name) VALUES ('b3000000-0000-4000-8000-000000000001', 'System owner room')$$, 'system Owner can create a room');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000004', true);
SELECT throws_ok($$INSERT INTO public.chat_rooms (campaign_id, name) VALUES ('b3000000-0000-4000-8000-000000000001', 'Player room')$$, '42501', NULL, 'regular campaign player cannot create a room');
SELECT is((SELECT count(*) FROM public.chat_rooms WHERE campaign_id = 'b3000000-0000-4000-8000-000000000001'), 3::bigint, 'campaign members retain read access to rooms');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$INSERT INTO public.chat_rooms (campaign_id, name) VALUES ('b3000000-0000-4000-8000-000000000001', '   ')$$, '23514', NULL, 'blank room names are rejected by the database');
SELECT throws_ok($$INSERT INTO public.chat_rooms (campaign_id, name) VALUES ('b3000000-0000-4000-8000-000000000001', repeat('R', 81))$$, '23514', NULL, 'room names over 80 characters are rejected by the database');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
