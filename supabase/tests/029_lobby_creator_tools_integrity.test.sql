BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'creator-owner@example.test', '{}'),
  ('c1000000-0000-4000-8000-000000000002', 'creator-member@example.test', '{}'),
  ('c1000000-0000-4000-8000-000000000003', 'creator-admin@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('c2000000-0000-4000-8000-000000000001', 'creator-integrity-system', 'Creator Integrity System', 'c1000000-0000-4000-8000-000000000001');
INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'owner'),
  ('c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'user');
INSERT INTO private.platform_admins (user_id)
VALUES ('c1000000-0000-4000-8000-000000000003');
INSERT INTO public.characters (id, user_id, game_system_id, name, status)
VALUES
  ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Owner Hero', 'active'),
  ('c3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Inactive Hero', 'archived'),
  ('c3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'Admin Hero', 'active'),
  ('c3000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Member Hero', 'active');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_system_lobby_settings'::regclass), 'lobby settings keep RLS enabled');
SELECT has_function('public', 'create_system_campaign', ARRAY['uuid', 'uuid', 'text', 'text'], 'campaign creation RPC is available');
SELECT has_function('private', 'create_system_campaign_impl', ARRAY['uuid', 'uuid', 'text', 'text'], 'internal campaign writer is private');
SELECT ok((SELECT NOT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.create_system_campaign(uuid, uuid, text, text)')), 'public campaign RPC is SECURITY INVOKER');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('private.create_system_campaign_impl(uuid, uuid, text, text)')), 'internal writer uses SECURITY DEFINER behind explicit checks');
SELECT ok(NOT has_function_privilege('anon', 'public.create_system_campaign(uuid, uuid, text, text)', 'EXECUTE'), 'anonymous cannot execute campaign creation RPC');
SELECT ok(has_function_privilege('authenticated', 'public.create_system_campaign(uuid, uuid, text, text)', 'EXECUTE'), 'authenticated can execute campaign creation RPC');
SELECT ok(NOT has_table_privilege('authenticated', 'public.campaigns', 'INSERT'), 'authenticated cannot create campaigns through the table API');
SELECT ok(CASE WHEN to_regprocedure('private.create_system_campaign_impl(uuid, uuid, text, text)') IS NULL THEN false ELSE NOT has_function_privilege('anon', to_regprocedure('private.create_system_campaign_impl(uuid, uuid, text, text)'), 'EXECUTE') END, 'anonymous cannot execute internal campaign writer');
SELECT ok(CASE WHEN to_regprocedure('private.create_system_campaign_impl(uuid, uuid, text, text)') IS NULL THEN false ELSE has_function_privilege('authenticated', to_regprocedure('private.create_system_campaign_impl(uuid, uuid, text, text)'), 'EXECUTE') END, 'authenticated can call the guarded internal writer through its wrapper');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$INSERT INTO public.campaigns (game_system_id, owner_user_id, name) VALUES ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Direct insert')$$, '42501', NULL, 'Owner cannot create a campaign without its GM membership via table API');
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', E'\tA Campanha\t', E'\tDescrição inicial\t')->>'status', 'created', 'Owner campaign creation RPC succeeds with normalized whitespace');
SELECT is((SELECT name FROM public.campaigns WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'), 'A Campanha', 'campaign name is normalized with ASCII whitespace');
SELECT is((SELECT description FROM public.campaigns WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'), 'Descrição inicial', 'campaign description is normalized with ASCII whitespace');
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', '   ', NULL)->>'status', 'invalid_input', 'campaign RPC rejects whitespace-only titles');
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', E'\t', NULL)->>'status', 'invalid_input', 'campaign RPC rejects tab-only titles');
SELECT is((SELECT count(*) FROM public.campaigns WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'), 1::bigint, 'campaign is persisted');
SELECT is((SELECT role FROM public.campaign_members WHERE character_id = 'c3000000-0000-4000-8000-000000000001'), 'game_master', 'creator character is linked as game master atomically');
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'Inactive', NULL)->>'status', 'character_not_found', 'inactive character cannot create a campaign');
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000004', 'Foreign character', NULL)->>'status', 'character_not_found', 'Owner cannot attach another user’s character during campaign creation');

INSERT INTO public.game_system_events (id, game_system_id, title, starts_at, ends_at)
VALUES ('c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Start guard', now(), now() + interval '1 hour');
INSERT INTO public.game_system_lobby_settings (game_system_id) VALUES ('c2000000-0000-4000-8000-000000000001');

SELECT lives_ok($$UPDATE public.game_system_events SET started_at = '2000-01-01 00:00:00+00' WHERE id = 'c4000000-0000-4000-8000-000000000001'$$, 'Owner can transition a scheduled event to started');
SELECT ok((SELECT started_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute' FROM public.game_system_events WHERE id = 'c4000000-0000-4000-8000-000000000001'), 'start time is set by the database to the current timestamp');
SELECT throws_ok($$UPDATE public.game_system_events SET started_at = NULL WHERE id = 'c4000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'started timestamp cannot be cleared');
SELECT throws_ok($$UPDATE public.game_system_events SET started_at = '2001-01-01 00:00:00+00' WHERE id = 'c4000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'started timestamp cannot be changed');

SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET section_order = ARRAY['system-presentation', 'system-presentation', 'store', 'campaign-chat', 'events', 'character-sheet'] WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'section order rejects duplicates');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET section_order = ARRAY['system-presentation', 'matchmaking', 'store', 'campaign-chat', 'events', 'unknown'] WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'section order rejects unknown ids');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET section_order = ARRAY[['system-presentation', 'matchmaking'], ['store', 'campaign-chat'], ['events', 'character-sheet']] WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'section order rejects multidimensional arrays');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET hidden_sections = ARRAY['store', 'store'] WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'hidden sections reject duplicates');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET hidden_sections = ARRAY['unknown'] WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'hidden sections reject ids outside the allowlist');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET welcome_title = '   ' WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'welcome title rejects whitespace-only text');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET welcome_title = E'\t' WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'welcome title rejects tab-only text');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET welcome_title = '  Welcome  ' WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'welcome title requires canonical trimmed text');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET welcome_message = '  Welcome  ' WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'welcome message requires canonical trimmed text');
SELECT throws_ok($$UPDATE public.game_system_lobby_settings SET welcome_message = E'\t' WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, '23514', NULL, 'welcome message rejects tab-only text instead of storing noncanonical whitespace');
SELECT lives_ok($$UPDATE public.game_system_lobby_settings SET section_order = ARRAY['events', 'system-presentation', 'matchmaking', 'store', 'campaign-chat', 'character-sheet'], hidden_sections = ARRAY['store'] WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'$$, 'valid reordered sections and hidden subset are accepted');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Denied', NULL)->>'status', 'forbidden', 'non-owner campaign RPC is denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
SELECT is(public.create_system_campaign('c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000003', 'Admin Campaign', NULL)->>'status', 'created', 'platform Admin can create a campaign');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
