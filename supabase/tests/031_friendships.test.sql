BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('71000000-0000-4000-8000-000000000001', 'friend-one@example.test', '{"display_name":"Hero One"}'),
  ('71000000-0000-4000-8000-000000000002', 'friend-two@example.test', '{"display_name":"Artemis"}'),
  ('71000000-0000-4000-8000-000000000003', 'friend-three@example.test', '{"display_name":"Martian"}'),
  ('71000000-0000-4000-8000-000000000004', 'friend-four@example.test', '{"display_name":"Fourth"}');

UPDATE public.user_profiles
SET username = CASE user_id
  WHEN '71000000-0000-4000-8000-000000000001'::uuid THEN 'hero_one'
  WHEN '71000000-0000-4000-8000-000000000002'::uuid THEN 'artemis'
  WHEN '71000000-0000-4000-8000-000000000003'::uuid THEN 'martian'
  WHEN '71000000-0000-4000-8000-000000000004'::uuid THEN 'fourth'
END,
avatar_url = CASE user_id
  WHEN '71000000-0000-4000-8000-000000000002'::uuid THEN 'https://example.test/artemis.png'
  WHEN '71000000-0000-4000-8000-000000000003'::uuid THEN 'https://example.test/martian.png'
  ELSE NULL
END,
bio = CASE user_id
  WHEN '71000000-0000-4000-8000-000000000002'::uuid THEN 'Exploradora'
  WHEN '71000000-0000-4000-8000-000000000003'::uuid THEN 'Viajante'
  ELSE NULL
END
WHERE user_id BETWEEN '71000000-0000-4000-8000-000000000001'::uuid
  AND '71000000-0000-4000-8000-000000000004'::uuid;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  $$SELECT public.search_social_profiles('art')$$,
  '42501', NULL, 'anonymous users cannot search player profiles'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}', true);
SELECT is(
  public.search_social_profiles('  ArT  ') -> 'results',
  '[{"user_id":"71000000-0000-4000-8000-000000000002","username":"artemis","display_name":"Artemis","avatar_url":"https://example.test/artemis.png","bio":"Exploradora"},{"user_id":"71000000-0000-4000-8000-000000000003","username":"martian","display_name":"Martian","avatar_url":"https://example.test/martian.png","bio":"Viajante"}]'::jsonb,
  'username search is trimmed, case-insensitive, partial, ordered, and returns public profile fields'
);
SELECT ok(
  NOT (public.search_social_profiles('art')::text ILIKE '%email%'),
  'social search response contains no email field or address'
);
SELECT is(
  public.search_social_profiles('hero') -> 'results',
  '[]'::jsonb,
  'search does not return the current user'
);
SELECT is(
  public.create_friend_request('71000000-0000-4000-8000-000000000001') ->> 'status',
  'self_request',
  'a player cannot request themself'
);
SELECT is(
  public.create_friend_request('71000000-0000-4000-8000-000000000002') ->> 'status',
  'created',
  'a player can send a request to a profile'
);
SELECT is(
  public.create_friend_request('71000000-0000-4000-8000-000000000002') ->> 'status',
  'already_pending',
  'a duplicate pending request is rejected'
);
SELECT is((SELECT count(*) FROM public.friend_requests), 1::bigint, 'one pending request row exists');
SELECT set_config('test.friend_request_id', (SELECT id::text FROM public.friend_requests LIMIT 1), true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}', true);
SELECT is((SELECT count(*) FROM public.friend_requests), 0::bigint, 'unrelated players cannot read a request');
SELECT is(
  public.respond_friend_request(current_setting('test.friend_request_id')::uuid, 'accept') ->> 'status',
  'forbidden',
  'a different player cannot accept another player’s request'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}', true);
SELECT is(
  public.create_friend_request('71000000-0000-4000-8000-000000000001') ->> 'status',
  'already_pending',
  'reverse duplicate requests for the same pair are rejected'
);
SELECT is(
  public.respond_friend_request((SELECT id FROM public.friend_requests LIMIT 1), NULL) ->> 'status',
  'invalid_decision',
  'a missing decision cannot accidentally decline the request'
);
SELECT is(
  public.respond_friend_request((SELECT id FROM public.friend_requests LIMIT 1), 'accept') ->> 'status',
  'accepted',
  'the recipient can accept the pending request'
);
SELECT is(
  public.list_my_friendships() -> 'friends' -> 0 ->> 'user_id',
  '71000000-0000-4000-8000-000000000001',
  'the recipient sees the new friend'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}', true);
SELECT is(
  public.list_my_friendships() -> 'friends' -> 0 ->> 'user_id',
  '71000000-0000-4000-8000-000000000002',
  'the requester sees the same friendship'
);
SELECT is(
  public.remove_friend('71000000-0000-4000-8000-000000000002') ->> 'status',
  'removed',
  'either friend can remove the bilateral relationship'
);
SELECT is(public.list_my_friendships() -> 'friends', '[]'::jsonb, 'removal clears the requester friend list');
SELECT is(
  public.create_friend_request('71000000-0000-4000-8000-000000000003') ->> 'status',
  'created',
  'a player can send a new request after removing a friend'
);
SELECT is(public.cancel_friend_request((SELECT id FROM public.friend_requests WHERE recipient_user_id = '71000000-0000-4000-8000-000000000003')) ->> 'status', 'cancelled', 'requester can cancel a pending request');
SELECT is(
  public.create_friend_request('71000000-0000-4000-8000-000000000004') ->> 'status',
  'created',
  'a player can send a separate request'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000004"}', true);
SELECT is(
  public.respond_friend_request((SELECT id FROM public.friend_requests WHERE recipient_user_id = '71000000-0000-4000-8000-000000000004'), 'decline') ->> 'status',
  'declined',
  'recipient can decline a pending request'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
