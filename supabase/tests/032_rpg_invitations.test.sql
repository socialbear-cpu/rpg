BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('72000000-0000-4000-8000-000000000001', 'invite-owner@example.test', '{"display_name":"System Owner"}'),
  ('72000000-0000-4000-8000-000000000002', 'invite-member@example.test', '{"display_name":"Chat Member"}'),
  ('72000000-0000-4000-8000-000000000003', 'invite-friend@example.test', '{"display_name":"Invited Friend"}'),
  ('72000000-0000-4000-8000-000000000004', 'invite-owner-friend@example.test', '{"display_name":"Owner Friend"}'),
  ('72000000-0000-4000-8000-000000000005', 'invite-outsider@example.test', '{"display_name":"Outsider"}');

UPDATE public.user_profiles
SET username = CASE user_id
  WHEN '72000000-0000-4000-8000-000000000001'::uuid THEN 'invite_owner'
  WHEN '72000000-0000-4000-8000-000000000002'::uuid THEN 'invite_member'
  WHEN '72000000-0000-4000-8000-000000000003'::uuid THEN 'invite_friend'
  WHEN '72000000-0000-4000-8000-000000000004'::uuid THEN 'owner_friend'
  WHEN '72000000-0000-4000-8000-000000000005'::uuid THEN 'invite_outsider'
END
WHERE user_id BETWEEN '72000000-0000-4000-8000-000000000001'::uuid
  AND '72000000-0000-4000-8000-000000000005'::uuid;

INSERT INTO public.friend_requests (requester_user_id, recipient_user_id, status)
VALUES
  ('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000003', 'accepted'),
  ('72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000004', 'accepted'),
  ('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000004', 'accepted'),
  ('72000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000003', 'accepted');

INSERT INTO public.game_systems (id, slug, name, owner_user_id, is_public, is_active)
VALUES
  ('82000000-0000-4000-8000-000000000001', 'invite-private-system', 'Invite Private System', '72000000-0000-4000-8000-000000000001', false, true),
  ('82000000-0000-4000-8000-000000000002', 'invite-archived-system', 'Invite Archived System', '72000000-0000-4000-8000-000000000001', true, false);

INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
VALUES ('72000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'user');

INSERT INTO public.characters (id, user_id, game_system_id, character_name, status)
VALUES
  ('92000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'System Host', 'active'),
  ('92000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'Chat Member', 'active');

INSERT INTO public.chats (id, game_system_id, owner_user_id, name, status)
VALUES
  ('a2000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Main Chat', 'active'),
  ('a2000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Second Chat', 'active');

INSERT INTO public.chat_members (chat_id, character_id, game_system_id, role)
VALUES
  ('a2000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'player'),
  ('a2000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'player');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', NULL
)->>'status', 'pending_owner_approval', 'a system member requests a friend invitation and waits for owner approval');
SELECT set_config('test.system_invitation_id', (
  SELECT id::text FROM public.rpg_invitations
  WHERE invitee_user_id = '72000000-0000-4000-8000-000000000003'
    AND game_system_id = '82000000-0000-4000-8000-000000000001'
), true);
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', NULL
)->>'status', 'already_invited', 'a duplicate pending destination invite is rejected');
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001', NULL
)->>'status', 'not_friends', 'a member cannot invite a non-friend');
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', NULL
)->>'status', 'pending_owner_approval', 'an existing member can request a second friend invitation');
SELECT set_config('test.cancelled_invitation_id', (
  SELECT id::text FROM public.rpg_invitations
  WHERE invitee_user_id = '72000000-0000-4000-8000-000000000004'
), true);
SELECT is(public.remove_friend('72000000-0000-4000-8000-000000000004')->>'status', 'removed', 'either friend can end the friendship');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}', true);
SELECT is(public.list_my_social_invitations()->'owner_approvals'->0->>'id', current_setting('test.system_invitation_id'), 'the destination owner sees pending approval');
SELECT is(public.respond_rpg_invitation(current_setting('test.system_invitation_id')::uuid, 'approve', NULL)->>'status', 'pending_recipient', 'the owner approval sends the invitation to the recipient');
SELECT is(public.respond_rpg_invitation(current_setting('test.cancelled_invitation_id')::uuid, 'approve', NULL)->>'status', 'conflict', 'a friendship removal cancels its pending invitation');
SELECT is((SELECT status FROM public.rpg_invitations WHERE id = current_setting('test.cancelled_invitation_id')::uuid), 'cancelled', 'friendship removal persists cancellation of pending invitations');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000004"}', true);
SELECT is(public.respond_rpg_invitation(current_setting('test.system_invitation_id')::uuid, 'approve', NULL)->>'status', 'forbidden', 'a non-owner cannot approve a member request');
SELECT is(public.respond_rpg_invitation(current_setting('test.cancelled_invitation_id')::uuid, 'accept', NULL)->>'status', 'conflict', 'a cancelled invitation cannot be accepted');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000003"}', true);
SELECT is((SELECT count(*) FROM public.game_system_memberships
  WHERE user_id = '72000000-0000-4000-8000-000000000003' AND game_system_id = '82000000-0000-4000-8000-000000000001'), 0::bigint,
  'owner approval alone grants no system membership');
SELECT is(public.respond_rpg_invitation(current_setting('test.system_invitation_id')::uuid, 'accept', NULL)->>'status', 'accepted', 'recipient accepts the system invitation');
SELECT is((SELECT role FROM public.game_system_memberships
  WHERE user_id = '72000000-0000-4000-8000-000000000003' AND game_system_id = '82000000-0000-4000-8000-000000000001'), 'user',
  'accepted private-system invitation grants only regular membership');
SELECT ok(private.can_access_game_system('82000000-0000-4000-8000-000000000001'), 'accepted invitation grants access to the private system');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000003', NULL, 'a2000000-0000-4000-8000-000000000001'
)->>'status', 'pending_owner_approval', 'a chat member requests a friend invitation to that chat');
SELECT set_config('test.chat_invitation_id', (
  SELECT id::text FROM public.rpg_invitations WHERE chat_id = 'a2000000-0000-4000-8000-000000000001'
    AND invitee_user_id = '72000000-0000-4000-8000-000000000003'
), true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}', true);
SELECT is(public.respond_rpg_invitation(current_setting('test.chat_invitation_id')::uuid, 'approve', NULL)->>'status', 'pending_recipient', 'chat owner approves the member request');
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000004', NULL, 'a2000000-0000-4000-8000-000000000001'
)->>'status', 'pending_recipient', 'chat owner can invite a friend directly');
SELECT set_config('test.owner_chat_invitation_id', (
  SELECT id::text FROM public.rpg_invitations WHERE chat_id = 'a2000000-0000-4000-8000-000000000001'
    AND invitee_user_id = '72000000-0000-4000-8000-000000000004'
), true);
SELECT is(public.create_rpg_invitation(
  '72000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000002', NULL
)->>'status', 'not_found', 'inactive systems cannot receive invitations');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000003"}', true);
SELECT is(public.respond_rpg_invitation(current_setting('test.chat_invitation_id')::uuid, 'accept', NULL)->>'status', 'accepted', 'recipient can accept a chat invitation before creating a character');
SELECT is((SELECT count(*) FROM public.chat_members WHERE chat_id = 'a2000000-0000-4000-8000-000000000001'
  AND character_id IN (SELECT id FROM public.characters WHERE user_id = '72000000-0000-4000-8000-000000000003')), 0::bigint,
  'chat invitation waits for the recipient character');
INSERT INTO public.characters (id, user_id, game_system_id, character_name, status)
VALUES ('92000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', 'Invited Hero', 'active');
SELECT is(public.respond_rpg_invitation(
  current_setting('test.chat_invitation_id')::uuid, 'accept', '92000000-0000-4000-8000-000000000003'
)->>'status', 'accepted', 'recipient completes chat entry with their own active character');
SELECT is((SELECT count(*) FROM public.chat_members WHERE chat_id = 'a2000000-0000-4000-8000-000000000001'
  AND character_id = '92000000-0000-4000-8000-000000000003'), 1::bigint,
  'recipient character is attached to the invited chat');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
