BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('73000000-0000-4000-8000-000000000001','profile-a@example.test','{"display_name":"Player A"}'),
 ('73000000-0000-4000-8000-000000000002','profile-b@example.test','{"display_name":"Player B"}'),
 ('73000000-0000-4000-8000-000000000003','profile-c@example.test','{"display_name":"Player C"}');
UPDATE public.user_profiles SET username=CASE user_id
 WHEN '73000000-0000-4000-8000-000000000001'::uuid THEN 'player_a'
 WHEN '73000000-0000-4000-8000-000000000002'::uuid THEN 'player_b'
 WHEN '73000000-0000-4000-8000-000000000003'::uuid THEN 'player_c' END
WHERE user_id BETWEEN '73000000-0000-4000-8000-000000000001'::uuid AND '73000000-0000-4000-8000-000000000003'::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000001"}',true);
SELECT is(public.get_social_profile('player_b')->>'status','ok','connected users can read a public player profile');
SELECT ok(NOT ((public.get_social_profile('player_b')->'profile') ? 'phone'),'profile response omits phone');
SELECT ok(NOT ((public.get_social_profile('player_b')->'profile') ? 'email'),'profile response omits email');
SELECT is(public.get_social_profile('missing_player')->>'status','not_found','missing profiles return not_found');
SELECT is(public.create_profile_comment('player_b',' hello ')->>'status','created','connected users can comment on another player mural');
SELECT is(public.create_profile_comment('player_a','own wall')->>'status','self_wall','players cannot comment on their own wall');
SELECT is(public.create_profile_comment('player_b',repeat('x',501))->>'status','invalid_content','oversized comments are rejected');
SELECT is(public.list_profile_comments('player_b')->'comments'->0->>'content','hello','mural content is trimmed and readable');
SELECT is(public.send_direct_message('73000000-0000-4000-8000-000000000002','hello')->>'status','sent','a player can start a direct message');
SELECT is(public.send_direct_message('73000000-0000-4000-8000-000000000001','self')->>'status','self_message','self messaging is rejected');
SELECT is(jsonb_array_length(public.get_direct_messages('73000000-0000-4000-8000-000000000002')->'messages'),1,'participants can read their conversation');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000003"}',true);
SELECT is(jsonb_array_length(public.get_direct_messages('73000000-0000-4000-8000-000000000002')->'messages'),0,'a nonparticipant cannot read another conversation');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
