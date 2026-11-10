BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

-- Real Auth inserts exercise the existing profile-creation trigger as well.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'rls-owner@example.test', '{"display_name":"Owner"}'),
    ('10000000-0000-4000-8000-000000000002', 'rls-other@example.test', '{"display_name":"Other"}');

SELECT is((SELECT count(*) FROM public.user_profiles WHERE user_id IN (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
)), 2::bigint, 'Auth trigger creates both profiles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass), 'users has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_profiles'::regclass), 'profiles has RLS enabled');
SELECT ok(NOT has_table_privilege('anon', 'public.users', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_any_column_privilege('anon', 'public.users', 'SELECT,INSERT,UPDATE,REFERENCES'), 'anonymous role has no users table or column grants');
SELECT ok(NOT has_table_privilege('authenticated', 'public.users', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_any_column_privilege('authenticated', 'public.users', 'SELECT,INSERT,UPDATE,REFERENCES'), 'authenticated role has no users table or column grants');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok('SELECT * FROM public.user_profiles', '42501', NULL, 'anonymous profile reads are denied');
SELECT throws_ok($$UPDATE public.user_profiles SET bio = 'anonymous'$$, '42501', NULL, 'anonymous profile updates are denied');
SELECT throws_ok($$INSERT INTO public.user_profiles (user_id, display_name) VALUES ('10000000-0000-4000-8000-000000000001', 'forbidden')$$, '42501', NULL, 'anonymous profile inserts are denied');
SELECT throws_ok('DELETE FROM public.user_profiles', '42501', NULL, 'anonymous profile deletes are denied');
SELECT throws_ok('SELECT * FROM public.users', '42501', NULL, 'anonymous users access is denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
SELECT results_eq('SELECT display_name FROM public.user_profiles', $$VALUES ('Owner'::text)$$, 'owner sees only their own profile');
SELECT is((SELECT count(*) FROM public.user_profiles WHERE user_id = '10000000-0000-4000-8000-000000000002'), 0::bigint, 'cross-user profile reads return no rows');
SELECT lives_ok($$UPDATE public.user_profiles SET display_name = 'Updated owner', avatar_url = 'https://example.test/avatar.png', bio = 'Updated bio' WHERE user_id = '10000000-0000-4000-8000-000000000001'$$, 'owner can update all three editable fields');
SELECT results_eq(
    'SELECT display_name, avatar_url, bio FROM public.user_profiles',
    $$VALUES ('Updated owner'::text, 'https://example.test/avatar.png'::text, 'Updated bio'::text)$$,
    'owner edits persist'
);
SELECT lives_ok($$UPDATE public.user_profiles SET bio = 'cross-user write' WHERE user_id = '10000000-0000-4000-8000-000000000002'$$, 'cross-user update is filtered without a SQL error');
SELECT throws_ok($$UPDATE public.user_profiles SET user_id = '10000000-0000-4000-8000-000000000003'$$, '42501', NULL, 'owner cannot transfer profile ownership');
SELECT throws_ok('UPDATE public.user_profiles SET created_at = now()', '42501', NULL, 'owner cannot change created_at');
SELECT throws_ok('UPDATE public.user_profiles SET updated_at = now()', '42501', NULL, 'owner cannot change updated_at');
SELECT throws_ok($$INSERT INTO public.user_profiles (user_id, display_name) VALUES ('10000000-0000-4000-8000-000000000001', 'forbidden')$$, '42501', NULL, 'authenticated direct profile inserts are denied');
SELECT throws_ok('DELETE FROM public.user_profiles', '42501', NULL, 'authenticated profile deletes are denied');
SELECT throws_ok('SELECT * FROM public.users', '42501', NULL, 'authenticated users reads are denied');
SELECT throws_ok('UPDATE public.users SET is_active = false', '42501', NULL, 'authenticated users updates are denied');
SELECT throws_ok($$INSERT INTO public.users (id) VALUES ('10000000-0000-4000-8000-000000000003')$$, '42501', NULL, 'authenticated users inserts are denied');
SELECT throws_ok('DELETE FROM public.users', '42501', NULL, 'authenticated users deletes are denied');
RESET ROLE;

-- Change identities to prove isolation in both directions and verify no mutation.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}', true);
SELECT results_eq('SELECT display_name, bio FROM public.user_profiles', $$VALUES ('Other'::text, NULL::text)$$, 'second user sees their unchanged profile only');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.user_profiles), 0::bigint, 'authenticated role without UID sees no profiles');
SELECT lives_ok($$UPDATE public.user_profiles SET bio = 'missing UID write'$$, 'missing UID update is filtered without a SQL error');
RESET ROLE;
SELECT results_eq(
    $$SELECT display_name, bio FROM public.user_profiles WHERE user_id IN ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') ORDER BY user_id$$,
    $$VALUES ('Updated owner'::text, 'Updated bio'::text), ('Other'::text, NULL::text)$$,
    'forbidden operations preserve both profiles and their data'
);

SELECT * FROM finish();
ROLLBACK;
