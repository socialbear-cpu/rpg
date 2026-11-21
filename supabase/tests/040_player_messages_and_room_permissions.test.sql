BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('ab100000-0000-4000-8000-000000000001','room-owner@test.invalid','{}'),
 ('ab100000-0000-4000-8000-000000000002','room-mod@test.invalid','{}'),
 ('ab100000-0000-4000-8000-000000000003','room-player@test.invalid','{}'),
 ('ab100000-0000-4000-8000-000000000004','room-other@test.invalid','{}');
INSERT INTO public.game_systems(id,slug,name,owner_user_id) VALUES
 ('ab200000-0000-4000-8000-000000000001','permission-test','Permission test','ab100000-0000-4000-8000-000000000001');
INSERT INTO public.game_system_memberships(user_id,game_system_id,role) VALUES
 ('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','owner'),
 ('ab100000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000001','mod'),
 ('ab100000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000001','user')
 ON CONFLICT(user_id,game_system_id) DO UPDATE SET role=excluded.role;
INSERT INTO public.characters(id,user_id,game_system_id,character_name,status) VALUES
 ('ab300000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000001','One','active'),
 ('ab300000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000001','Two','active'),
 ('ab300000-0000-4000-8000-000000000003','ab100000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000001','Moderator','active');
INSERT INTO private.platform_admins(user_id) VALUES('ab100000-0000-4000-8000-000000000004');
CREATE TEMP TABLE test_room(id uuid);
GRANT ALL ON test_room TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
INSERT INTO test_room SELECT (public.create_system_chat('ab200000-0000-4000-8000-000000000001',NULL,'Room',NULL)->'chat'->>'id')::uuid;
SELECT ok((SELECT id IS NOT NULL FROM test_room),'owner creates without character');
SELECT is((SELECT count(*)::integer FROM public.chat_members),0,'creation does not consume a seat');
SELECT is(public.room_operation('configure',(SELECT id FROM test_room),NULL,
 '{"max_players":1,"roles":[{"role":"user","view":true,"enter":true,"write":false}],"users":[]}')->>'status','ok','owner configures role grants');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
SELECT is(public.create_system_chat('ab200000-0000-4000-8000-000000000001',NULL,'Denied',NULL)->>'status','forbidden','moderator cannot create');
SELECT is(public.room_operation('settings',(SELECT id FROM test_room),NULL,'{}')->>'status','ok','moderator can manage hidden room');
SELECT is(public.room_operation('messages',(SELECT id FROM test_room),NULL,'{}')->>'status','not_found','management does not reveal history');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
SELECT is(public.room_operation('messages',(SELECT id FROM test_room),NULL,'{}')->>'status','ok','visible history can be read without joining');
SELECT is(public.room_operation('join',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000001','{}')->>'status','ok','player enters');
SELECT is(public.room_operation('join',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000002','{}')->>'status','ok','second character uses the same seat');
SELECT is(public.room_operation('send',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000001','{"content":"Blocked"}')->>'status','forbidden','read-only player cannot send');
SELECT is(public.room_operation('configure',(SELECT id FROM test_room),NULL,'{"max_players":5,"roles":[],"users":[]}')->>'status','forbidden','player cannot configure');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
SELECT is(public.room_operation('configure',(SELECT id FROM test_room),NULL,
 '{"max_players":1,"roles":[{"role":"user","view":true,"enter":true,"write":true}],"users":[{"user_id":"ab100000-0000-4000-8000-000000000003","view":false,"enter":null,"write":null}]}')->>'status','ok','individual deny can override role');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
SELECT is(public.room_operation('messages',(SELECT id FROM test_room),NULL,'{}')->>'status','not_found','revoked viewer cannot read even as participant');
SELECT is((SELECT count(*)::integer FROM public.messages),0,'RLS hides revoked history');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
SELECT is(public.room_operation('messages',(SELECT id FROM test_room),NULL,'{}')->>'status','not_found','outsider cannot read');
SELECT is(public.create_system_chat('ab200000-0000-4000-8000-000000000001',NULL,'Admin denied',NULL)->>'status','forbidden','global admin without system Owner cannot create');
SELECT is(public.room_operation('settings',(SELECT id FROM test_room),NULL,'{}')->>'status','forbidden','global admin without system role cannot manage');
SELECT ok(NOT has_function_privilege('anon','public.room_operation(text,uuid,uuid,jsonb)','EXECUTE'),'anonymous cannot call room operations');
SELECT ok(NOT has_function_privilege('anon','public.social_groups_action(text,uuid,jsonb)','EXECUTE'),'anonymous cannot call social group operations');

RESET ROLE;
INSERT INTO public.friend_requests(requester_user_id,recipient_user_id,status) VALUES('ab100000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','accepted');
INSERT INTO public.rpg_invitations(id,inviter_user_id,invitee_user_id,game_system_id,chat_id,status)
 SELECT 'ab400000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','ab200000-0000-4000-8000-000000000001',id,'pending_recipient' FROM test_room;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
SELECT is(public.respond_rpg_invitation('ab400000-0000-4000-8000-000000000001','accept',NULL)->>'status','room_full','initial invitation acceptance without character still checks capacity');
RESET ROLE;
SELECT is((SELECT status FROM public.rpg_invitations WHERE id='ab400000-0000-4000-8000-000000000001'),'pending_recipient','full room does not consume invitation');
SELECT is((SELECT count(*)::integer FROM public.game_system_memberships WHERE user_id='ab100000-0000-4000-8000-000000000004'),0,'failed admission rolls back system membership');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
SELECT is(public.room_operation('configure',(SELECT id FROM test_room),NULL,
 '{"max_players":1,"roles":[{"role":"user","view":true,"enter":true,"write":true},{"role":"mod","view":true,"enter":true,"write":true}],"users":[]}')->>'status','ok','remove individual override to inherit role');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
SELECT is(public.room_operation('join',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000003','{}')->>'status','room_full','another account cannot take occupied last seat');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
SELECT is(public.room_operation('send',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000001','{"content":"Preserve this message"}')->>'status','ok','role permits writing after override removal');
SELECT is(public.room_operation('leave',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000001','{}')->>'status','ok','first character leaves');
SELECT is((SELECT count(*)::integer FROM public.messages WHERE content='Preserve this message'),1,'leaving preserves message history');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
SELECT is(public.room_operation('join',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000003','{}')->>'status','room_full','remaining character retains account seat');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
SELECT is(public.room_operation('leave',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000002','{}')->>'status','ok','last character releases account seat');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
SELECT is(public.room_operation('join',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000003','{}')->>'status','ok','new account can take released seat');
RESET ROLE;
UPDATE public.chats SET status='completed' WHERE id=(SELECT id FROM test_room);
SET LOCAL ROLE authenticated;
SELECT is(public.room_operation('messages',(SELECT id FROM test_room),NULL,'{}')->>'status','ok','completed room retains visible history');
SELECT is(public.room_operation('send',(SELECT id FROM test_room),'ab300000-0000-4000-8000-000000000003','{"content":"No further action"}')->>'status','forbidden','completed room is read-only');
SELECT ok(NOT has_table_privilege('authenticated','public.chat_members','INSERT'),'direct membership insert cannot bypass admission');
SELECT ok(NOT has_table_privilege('authenticated','public.chats','UPDATE'),'direct room update cannot bypass configuration rules');
SELECT ok(NOT has_table_privilege('authenticated','public.social_group_messages','SELECT'),'social group messages only exposed by guarded RPC');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);

CREATE TEMP TABLE test_group(id uuid);
GRANT ALL ON test_group TO authenticated;
INSERT INTO test_group SELECT (public.social_groups_action('create',NULL,'{"name":"Friends","user_ids":["ab100000-0000-4000-8000-000000000003"]}')->'group'->>'id')::uuid;
SELECT ok((SELECT id IS NOT NULL FROM test_group),'group needs no character or system membership');
SELECT is(public.social_groups_action('leave',(SELECT id FROM test_group),'{}')->>'status','transfer_required','creator must transfer before leaving');
SELECT is(public.social_groups_action('send',(SELECT id FROM test_group),'{"content":"Hello"}')->>'status','ok','group member sends');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
SELECT is(public.social_groups_action('read',(SELECT id FROM test_group),'{}')->>'status','not_found','room owner cannot read unrelated social group');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
SELECT is(public.social_groups_action('rename',(SELECT id FROM test_group),'{"name":"Stolen"}')->>'status','forbidden','member cannot administer group');
SELECT is(public.social_groups_action('read',(SELECT id FROM test_group),'{}')->'messages'->0->>'content','Hello','new member reads full history');
SELECT is(public.social_groups_action('leave',(SELECT id FROM test_group),'{}')->>'status','ok','member leaves');
SELECT is(public.social_groups_action('read',(SELECT id FROM test_group),'{}')->>'status','not_found','former member loses history');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
SELECT is(public.social_groups_action('add',(SELECT id FROM test_group),'{"user_id":"ab100000-0000-4000-8000-000000000003"}')->>'status','ok','owner adds member again');
SELECT is(public.social_groups_action('transfer',(SELECT id FROM test_group),'{"user_id":"ab100000-0000-4000-8000-000000000003"}')->>'status','ok','owner transfers administration');
SELECT is(public.social_groups_action('leave',(SELECT id FROM test_group),'{}')->>'status','ok','previous owner can leave after transfer');
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
SELECT is(public.social_groups_action('rename',(SELECT id FROM test_group),'{"name":"New name"}')->>'status','ok','transferred owner administers group');
SELECT * FROM finish();
ROLLBACK;
