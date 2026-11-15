BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'chats', 'chat is the game space table');
SELECT has_table('public', 'chat_members', 'chat membership is attached directly to chats');
SELECT has_column('public', 'messages', 'chat_id', 'messages belong directly to a chat');
SELECT ok(to_regclass('public.campaigns') IS NULL, 'the old game-space table is removed');
SELECT ok(to_regclass('public.chat_rooms') IS NULL, 'separate chat rooms are removed');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'room_id'
), 'messages no longer carry a room id');
SELECT has_function('public', 'create_system_chat', ARRAY['uuid', 'uuid', 'text', 'text'], 'chat creation RPC exists');
SELECT ok(to_regprocedure('public.create_system_campaign(uuid, uuid, text, text)') IS NULL, 'campaign creation RPC is removed');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chats'::regclass), 'chat RLS is enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_members'::regclass), 'chat membership RLS is enabled');

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'chat-owner@example.test', '{}'),
  ('d1000000-0000-4000-8000-000000000002', 'chat-player@example.test', '{}');
INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('d2000000-0000-4000-8000-000000000001', 'chat-space-system', 'Chat Space System', 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'owner'),
  ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'user');
INSERT INTO public.characters (id, user_id, game_system_id, name, status)
VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Chat Host', 'active'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'Chat Player', 'active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
SELECT is(public.create_system_chat(
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  '  The Old Road  ',
  '  Opening scene  '
)->>'status', 'created', 'system owner creates a chat with a host character');
SELECT is((SELECT name FROM public.chats WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001'), 'The Old Road', 'chat title is trimmed');
SELECT is((SELECT description FROM public.chats WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001'), 'Opening scene', 'chat description is trimmed');
SELECT is((SELECT role FROM public.chat_members WHERE character_id = 'd3000000-0000-4000-8000-000000000001'), 'game_master', 'creator character becomes chat host');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chats', 'INSERT'), 'authenticated users create chats through the guarded RPC');
INSERT INTO public.messages (chat_id, character_id, content)
SELECT id, 'd3000000-0000-4000-8000-000000000001', 'First action in the chat'
FROM public.chats WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.messages WHERE chat_id = (SELECT id FROM public.chats WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001')), 1::bigint, 'the chat accepts messages directly without a room');
SELECT throws_ok($$INSERT INTO public.messages (chat_id, character_id, content) VALUES ((SELECT id FROM public.chats WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001'), 'd3000000-0000-4000-8000-000000000002', 'Not a member')$$, '42501', NULL, 'a character outside the chat cannot write messages');
SELECT is(public.create_system_chat(
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000002',
  'Unauthorized',
  NULL
)->>'status', 'forbidden', 'regular system member cannot create a chat');
RESET ROLE;

INSERT INTO public.game_system_lobby_settings (game_system_id)
VALUES ('d2000000-0000-4000-8000-000000000001');
SELECT ok('chat' = ANY((SELECT section_order FROM public.game_system_lobby_settings WHERE game_system_id = 'd2000000-0000-4000-8000-000000000001')), 'default lobby settings use the chat section');

SELECT * FROM finish();
ROLLBACK;
