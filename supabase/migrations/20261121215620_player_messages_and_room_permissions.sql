BEGIN;

ALTER TABLE public.chats ADD COLUMN max_players INTEGER CHECK (max_players > 0);
CREATE TABLE public.chat_role_permissions (
 chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK (role IN ('owner','mod','user')),
 can_view BOOLEAN NOT NULL DEFAULT false,
 can_enter BOOLEAN NOT NULL DEFAULT false,
 can_write BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(chat_id,role)
);
CREATE TABLE public.chat_user_permissions (
 chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 can_view BOOLEAN, can_enter BOOLEAN, can_write BOOLEAN,
 PRIMARY KEY(chat_id,user_id)
);
ALTER TABLE public.chat_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_user_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_role_permissions,public.chat_user_permissions FROM PUBLIC,anon,authenticated;

-- Keep previous participants' access without exposing existing histories to all players.
INSERT INTO public.chat_user_permissions(chat_id,user_id,can_view,can_enter,can_write)
 SELECT DISTINCT m.chat_id,c.user_id,true,true,true
 FROM public.chat_members m JOIN public.characters c ON c.id=m.character_id;
INSERT INTO public.chat_role_permissions(chat_id,role,can_view,can_enter,can_write)
 SELECT id,'owner',true,true,true FROM public.chats;

-- Leaving a room must not cascade-delete the character's past messages.
ALTER TABLE public.messages DROP CONSTRAINT messages_chat_id_character_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY(chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_character_id_fkey FOREIGN KEY(character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

CREATE FUNCTION private.can_manage_chat(p_chat UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.chats c
 JOIN public.game_systems s ON s.id=c.game_system_id AND s.is_active
 JOIN public.game_system_memberships m ON m.game_system_id=c.game_system_id
 JOIN public.users account ON account.id=m.user_id AND account.is_active
 WHERE c.id=p_chat AND m.user_id=(SELECT auth.uid()) AND m.role IN ('owner','mod'));
$$;
CREATE FUNCTION private.chat_permission(p_chat UUID,p_action TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT CASE p_action
 WHEN 'view' THEN COALESCE(u.can_view,r.can_view,false)
 WHEN 'enter' THEN COALESCE(u.can_enter,r.can_enter,false)
 WHEN 'write' THEN COALESCE(u.can_write,r.can_write,false) ELSE false END
 FROM public.chats c JOIN public.game_systems s ON s.id=c.game_system_id AND s.is_active
 JOIN public.game_system_memberships m ON m.game_system_id=c.game_system_id AND m.user_id=(SELECT auth.uid())
 JOIN public.users account ON account.id=m.user_id AND account.is_active
 LEFT JOIN public.chat_role_permissions r ON r.chat_id=c.id AND r.role=m.role
 LEFT JOIN public.chat_user_permissions u ON u.chat_id=c.id AND u.user_id=m.user_id
 WHERE c.id=p_chat AND (p_action='view' OR c.status='active')),false);
$$;
CREATE FUNCTION private.chat_player_count(p_chat UUID) RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT count(DISTINCT c.user_id)::integer FROM public.chat_members m JOIN public.characters c ON c.id=m.character_id WHERE m.chat_id=p_chat;
$$;
CREATE FUNCTION private.chat_info(p_chat UUID,p_character UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'game_system_id',c.game_system_id,'name',c.name,'description',c.description,
 'status',c.status,'created_at',c.created_at,'max_players',c.max_players,'player_count',private.chat_player_count(c.id),
 'can_manage',private.can_manage_chat(c.id),'permissions',jsonb_build_object(
 'view',private.chat_permission(c.id,'view'),'enter',private.chat_permission(c.id,'enter'),'write',private.chat_permission(c.id,'write')),
 'is_member',EXISTS(SELECT 1 FROM public.chat_members m JOIN public.characters ch ON ch.id=m.character_id
 WHERE m.chat_id=c.id AND ch.user_id=(SELECT auth.uid()) AND (p_character IS NULL OR ch.id=p_character)),
 'has_player_seat',EXISTS(SELECT 1 FROM public.chat_members m JOIN public.characters ch ON ch.id=m.character_id
 WHERE m.chat_id=c.id AND ch.user_id=(SELECT auth.uid()))) FROM public.chats c WHERE c.id=p_chat;
$$;

-- All membership insertions, including invitation RPCs, use one serialized gate.
CREATE FUNCTION private.guard_chat_admission() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_room public.chats%ROWTYPE; v_user UUID := (SELECT auth.uid());
BEGIN
 SELECT * INTO v_room FROM public.chats WHERE id=NEW.chat_id FOR UPDATE;
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.characters WHERE id=NEW.character_id
 AND user_id=v_user AND game_system_id=v_room.game_system_id AND status='active') THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='invalid_character';
 END IF;
 IF EXISTS(SELECT 1 FROM public.chat_members WHERE chat_id=NEW.chat_id AND character_id=NEW.character_id) THEN RETURN NULL; END IF;
 IF NOT private.chat_permission(NEW.chat_id,'view') OR NOT private.chat_permission(NEW.chat_id,'enter') THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='room_forbidden';
 END IF;
 IF v_room.max_players IS NOT NULL AND private.chat_player_count(NEW.chat_id)>=v_room.max_players
 AND NOT EXISTS(SELECT 1 FROM public.chat_members m JOIN public.characters c ON c.id=m.character_id WHERE m.chat_id=NEW.chat_id AND c.user_id=v_user) THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='room_full';
 END IF;
 NEW.game_system_id := v_room.game_system_id;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_chat_admission BEFORE INSERT ON public.chat_members FOR EACH ROW EXECUTE FUNCTION private.guard_chat_admission();

-- Replace permissive legacy policies, including platform-admin bypasses, for these entities.
DO $$ DECLARE p RECORD; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('chats','chat_members','messages') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
CREATE POLICY chats_read ON public.chats FOR SELECT TO authenticated
 USING(private.chat_permission(id,'view') OR private.can_manage_chat(id));
CREATE POLICY chat_members_read ON public.chat_members FOR SELECT TO authenticated
 USING(private.chat_permission(chat_id,'view') OR private.can_manage_chat(chat_id));
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated USING(private.chat_permission(chat_id,'view'));
CREATE POLICY messages_write ON public.messages FOR INSERT TO authenticated WITH CHECK(
 private.chat_permission(chat_id,'view') AND private.chat_permission(chat_id,'write')
 AND EXISTS(SELECT 1 FROM public.chat_members m JOIN public.characters c ON c.id=m.character_id
 WHERE m.chat_id=messages.chat_id AND m.character_id=messages.character_id AND c.user_id=(SELECT auth.uid()) AND c.status='active')
 AND length(btrim(content)) BETWEEN 1 AND 2000);
REVOKE INSERT,UPDATE,DELETE ON public.chats,public.chat_members,public.messages FROM authenticated;
GRANT SELECT ON public.chats,public.chat_members,public.messages TO authenticated;

CREATE OR REPLACE FUNCTION private.create_system_chat_impl(p_game_system_id UUID,p_character_id UUID,p_name TEXT,p_description TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id UUID; v_user UUID := (SELECT auth.uid());
 v_name TEXT := regexp_replace(COALESCE(p_name,''),'^[[:space:]]+|[[:space:]]+$','','g');
 v_description TEXT := regexp_replace(COALESCE(p_description,''),'^[[:space:]]+|[[:space:]]+$','','g');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.game_system_memberships m JOIN public.game_systems s ON s.id=m.game_system_id AND s.is_active
 JOIN public.users account ON account.id=m.user_id AND account.is_active
 WHERE m.game_system_id=p_game_system_id AND m.user_id=v_user AND m.role='owner') THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 IF length(v_name) NOT BETWEEN 1 AND 80 OR length(v_description)>2000 THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
 INSERT INTO public.chats(game_system_id,owner_user_id,name,description) VALUES(p_game_system_id,v_user,v_name,NULLIF(v_description,'')) RETURNING id INTO v_id;
 INSERT INTO public.chat_role_permissions(chat_id,role,can_view,can_enter,can_write) VALUES(v_id,'owner',true,true,true);
 RETURN jsonb_build_object('status','created','character_id',NULL,'chat',private.chat_info(v_id,NULL));
END;
$$;

CREATE FUNCTION private.list_system_chats(p_system UUID,p_character UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 IF p_character IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.characters WHERE id=p_character AND user_id=(SELECT auth.uid()) AND game_system_id=p_system AND status='active') THEN
 RETURN jsonb_build_object('status','invalid_character'); END IF;
 RETURN jsonb_build_object('status','ok','chats',COALESCE((SELECT jsonb_agg(private.chat_info(c.id,p_character) ORDER BY c.name,c.id)
 FROM public.chats c WHERE c.game_system_id=p_system AND (private.chat_permission(c.id,'view') OR private.can_manage_chat(c.id))),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.list_system_chats(p_system UUID,p_character UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_system_chats(p_system,p_character); $$;

CREATE FUNCTION private.room_operation(p_action TEXT,p_chat UUID,p_character UUID,p_payload JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_room public.chats%ROWTYPE; v_rule JSONB; v_message public.messages%ROWTYPE; v_user UUID := (SELECT auth.uid());
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 SELECT * INTO v_room FROM public.chats WHERE id=p_chat FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
 IF p_action IN ('settings','configure') THEN
  IF NOT private.can_manage_chat(p_chat) THEN RETURN jsonb_build_object('status','forbidden'); END IF;
  IF p_action='configure' THEN
   IF jsonb_typeof(p_payload->'roles') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'users') IS DISTINCT FROM 'array'
   OR NOT p_payload ? 'max_players' THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
   IF p_payload->>'max_players' IS NOT NULL AND ((p_payload->>'max_players') !~ '^[0-9]+$' OR (p_payload->>'max_players')::bigint NOT BETWEEN 1 AND 2147483647) THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
   DELETE FROM public.chat_role_permissions WHERE chat_id=p_chat;
   DELETE FROM public.chat_user_permissions WHERE chat_id=p_chat;
   FOR v_rule IN SELECT value FROM jsonb_array_elements(p_payload->'roles') LOOP
    IF v_rule->>'role' NOT IN ('owner','mod','user') OR v_rule->>'role' IS NULL
    OR jsonb_typeof(v_rule->'view') IS DISTINCT FROM 'boolean' OR jsonb_typeof(v_rule->'enter') IS DISTINCT FROM 'boolean' OR jsonb_typeof(v_rule->'write') IS DISTINCT FROM 'boolean' THEN
     RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='invalid_input'; END IF;
    INSERT INTO public.chat_role_permissions VALUES(p_chat,v_rule->>'role',(v_rule->>'view')::boolean,(v_rule->>'enter')::boolean,(v_rule->>'write')::boolean);
   END LOOP;
   FOR v_rule IN SELECT value FROM jsonb_array_elements(p_payload->'users') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.game_system_memberships WHERE user_id=(v_rule->>'user_id')::uuid AND game_system_id=v_room.game_system_id)
    OR (v_rule->>'view' IS NOT NULL AND jsonb_typeof(v_rule->'view')<>'boolean')
    OR (v_rule->>'enter' IS NOT NULL AND jsonb_typeof(v_rule->'enter')<>'boolean')
    OR (v_rule->>'write' IS NOT NULL AND jsonb_typeof(v_rule->'write')<>'boolean') THEN
     RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='invalid_input'; END IF;
    INSERT INTO public.chat_user_permissions VALUES(p_chat,(v_rule->>'user_id')::uuid,(v_rule->>'view')::boolean,(v_rule->>'enter')::boolean,(v_rule->>'write')::boolean);
   END LOOP;
   UPDATE public.chats SET max_players=(p_payload->>'max_players')::integer,updated_at=now() WHERE id=p_chat;
  END IF;
  RETURN jsonb_build_object('status','ok','chat',private.chat_info(p_chat,p_character),'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role,'view',can_view,'enter',can_enter,'write',can_write) ORDER BY role) FROM public.chat_role_permissions WHERE chat_id=p_chat),'[]'::jsonb),
  'users',COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'view',can_view,'enter',can_enter,'write',can_write) ORDER BY user_id) FROM public.chat_user_permissions WHERE chat_id=p_chat),'[]'::jsonb),
  'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'display_name',COALESCE(p.display_name,p.username,'Jogador'))) FROM public.game_system_memberships m LEFT JOIN public.user_profiles p ON p.user_id=m.user_id WHERE m.game_system_id=v_room.game_system_id),'[]'::jsonb));
 END IF;
 -- Allow leaving a hidden/revoked room so its capacity cannot become permanently occupied.
 IF p_action='leave' THEN
  IF NOT EXISTS(SELECT 1 FROM public.characters WHERE id=p_character AND user_id=v_user AND game_system_id=v_room.game_system_id) THEN RETURN jsonb_build_object('status','invalid_character'); END IF;
  DELETE FROM public.chat_members WHERE chat_id=p_chat AND character_id=p_character;
  RETURN jsonb_build_object('status','ok');
 END IF;
 IF NOT private.chat_permission(p_chat,'view') THEN RETURN jsonb_build_object('status','not_found'); END IF;
 IF p_character IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.characters WHERE id=p_character AND user_id=v_user AND game_system_id=v_room.game_system_id AND status='active') THEN RETURN jsonb_build_object('status','invalid_character'); END IF;
 IF p_action='messages' THEN
  RETURN jsonb_build_object('status','ok','messages',COALESCE((SELECT jsonb_agg(m ORDER BY m.created_at,m.id) FROM public.messages m WHERE m.chat_id=p_chat),'[]'::jsonb));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.characters WHERE id=p_character AND user_id=v_user AND game_system_id=v_room.game_system_id AND status='active') THEN RETURN jsonb_build_object('status','invalid_character'); END IF;
 IF p_action='join' THEN
  INSERT INTO public.chat_members(chat_id,character_id,game_system_id,role) VALUES(p_chat,p_character,v_room.game_system_id,'player') ON CONFLICT DO NOTHING;
 ELSIF p_action='send' THEN
  IF NOT private.chat_permission(p_chat,'write') OR NOT EXISTS(SELECT 1 FROM public.chat_members WHERE chat_id=p_chat AND character_id=p_character) THEN RETURN jsonb_build_object('status','forbidden'); END IF;
  IF p_payload->>'content' IS NULL OR length(btrim(p_payload->>'content')) NOT BETWEEN 1 AND 2000 THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
  INSERT INTO public.messages(chat_id,character_id,content) VALUES(p_chat,p_character,btrim(p_payload->>'content')) RETURNING * INTO v_message;
  RETURN jsonb_build_object('status','ok','message',to_jsonb(v_message));
 ELSE RETURN jsonb_build_object('status','invalid_input'); END IF;
 RETURN jsonb_build_object('status','ok','chat',private.chat_info(p_chat,p_character));
EXCEPTION
 WHEN SQLSTATE 'P0001' THEN RETURN jsonb_build_object('status',CASE SQLERRM WHEN 'room_forbidden' THEN 'forbidden' ELSE SQLERRM END);
 WHEN invalid_text_representation OR numeric_value_out_of_range OR unique_violation OR not_null_violation OR check_violation THEN RETURN jsonb_build_object('status','invalid_input');
END;
$$;
CREATE FUNCTION public.room_operation(p_action TEXT,p_chat UUID,p_character UUID DEFAULT NULL,p_payload JSONB DEFAULT '{}') RETURNS JSONB
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.room_operation(p_action,p_chat,p_character,p_payload); $$;

CREATE TABLE public.social_groups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
 owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.social_group_members (
 group_id UUID NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(group_id,user_id)
);
CREATE INDEX social_group_members_user_idx ON public.social_group_members(user_id,group_id);
CREATE TABLE public.social_group_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), group_id UUID NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
 sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 content TEXT NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 2000), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX social_group_messages_timeline_idx ON public.social_group_messages(group_id,created_at,id);
ALTER TABLE public.social_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_group_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_groups,public.social_group_members,public.social_group_messages FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.social_groups_action(p_action TEXT,p_group UUID,p_payload JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user UUID := (SELECT auth.uid()); v_group public.social_groups%ROWTYPE; v_member UUID; v_message public.social_group_messages%ROWTYPE;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_user AND is_active) THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 IF p_action='list' THEN RETURN jsonb_build_object('status','ok','groups',COALESCE((SELECT jsonb_agg(g ORDER BY g.created_at DESC,g.id) FROM public.social_groups g
 WHERE EXISTS(SELECT 1 FROM public.social_group_members m WHERE m.group_id=g.id AND m.user_id=v_user)),'[]'::jsonb)); END IF;
 IF p_action='create' THEN
  IF p_payload->>'name' IS NULL OR length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 80 OR jsonb_typeof(p_payload->'user_ids') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'user_ids') x WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=x.value::uuid AND u.is_active)) THEN RETURN jsonb_build_object('status','invalid_member'); END IF;
  INSERT INTO public.social_groups(name,owner_user_id) VALUES(btrim(p_payload->>'name'),v_user) RETURNING * INTO v_group;
  INSERT INTO public.social_group_members(group_id,user_id) SELECT v_group.id,id FROM (
   SELECT v_user id UNION SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'user_ids')) members;
  RETURN jsonb_build_object('status','ok','group',to_jsonb(v_group));
 END IF;
 SELECT * INTO v_group FROM public.social_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.social_group_members WHERE group_id=p_group AND user_id=v_user) THEN RETURN jsonb_build_object('status','not_found'); END IF;
 IF p_action='read' THEN RETURN jsonb_build_object('status','ok','group',to_jsonb(v_group),
  'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',COALESCE(p.display_name,p.username,'Jogador'),'username',p.username) ORDER BY m.joined_at,m.user_id)
   FROM public.social_group_members m LEFT JOIN public.user_profiles p ON p.user_id=m.user_id WHERE m.group_id=p_group),'[]'::jsonb),
  'messages',COALESCE((SELECT jsonb_agg(m ORDER BY m.created_at,m.id) FROM public.social_group_messages m WHERE m.group_id=p_group),'[]'::jsonb)); END IF;
 IF p_action='send' THEN
  IF p_payload->>'content' IS NULL OR length(btrim(p_payload->>'content')) NOT BETWEEN 1 AND 2000 THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
  INSERT INTO public.social_group_messages(group_id,sender_user_id,content) VALUES(p_group,v_user,btrim(p_payload->>'content')) RETURNING * INTO v_message;
  RETURN jsonb_build_object('status','ok','message',to_jsonb(v_message));
 END IF;
 IF p_action='leave' THEN
  IF v_group.owner_user_id=v_user THEN
   IF (SELECT count(*) FROM public.social_group_members WHERE group_id=p_group)>1 THEN RETURN jsonb_build_object('status','transfer_required'); END IF;
   DELETE FROM public.social_groups WHERE id=p_group;
  ELSE DELETE FROM public.social_group_members WHERE group_id=p_group AND user_id=v_user; END IF;
  RETURN jsonb_build_object('status','ok');
 END IF;
 IF v_group.owner_user_id<>v_user THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 IF p_action='rename' THEN
  IF p_payload->>'name' IS NULL OR length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 80 THEN RETURN jsonb_build_object('status','invalid_input'); END IF;
  UPDATE public.social_groups SET name=btrim(p_payload->>'name') WHERE id=p_group;
 ELSIF p_action IN ('add','remove','transfer') THEN
  v_member := (p_payload->>'user_id')::uuid;
  IF v_member IS NULL THEN RETURN jsonb_build_object('status','invalid_member'); END IF;
  IF p_action='add' THEN
   IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_member AND is_active) THEN RETURN jsonb_build_object('status','invalid_member'); END IF;
   INSERT INTO public.social_group_members(group_id,user_id) VALUES(p_group,v_member) ON CONFLICT DO NOTHING;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.social_group_members WHERE group_id=p_group AND user_id=v_member) THEN RETURN jsonb_build_object('status','invalid_member'); END IF;
   IF p_action='transfer' THEN UPDATE public.social_groups SET owner_user_id=v_member WHERE id=p_group;
   ELSIF v_member=v_user THEN RETURN jsonb_build_object('status','transfer_required');
   ELSE DELETE FROM public.social_group_members WHERE group_id=p_group AND user_id=v_member; END IF;
  END IF;
 ELSE RETURN jsonb_build_object('status','invalid_input'); END IF;
 RETURN jsonb_build_object('status','ok');
EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('status','invalid_input');
END;
$$;
CREATE FUNCTION public.social_groups_action(p_action TEXT,p_group UUID DEFAULT NULL,p_payload JSONB DEFAULT '{}') RETURNS JSONB
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.social_groups_action(p_action,p_group,p_payload); $$;

CREATE FUNCTION private.list_direct_conversations() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('conversations',COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC,x.id) FROM (
 SELECT DISTINCT ON (CASE WHEN m.sender_user_id=(SELECT auth.uid()) THEN m.recipient_user_id ELSE m.sender_user_id END)
 m.id,CASE WHEN m.sender_user_id=(SELECT auth.uid()) THEN m.recipient_user_id ELSE m.sender_user_id END AS user_id,
 p.display_name,p.username,m.content,m.created_at
 FROM public.direct_messages m LEFT JOIN public.user_profiles p ON p.user_id=CASE WHEN m.sender_user_id=(SELECT auth.uid()) THEN m.recipient_user_id ELSE m.sender_user_id END
 WHERE (SELECT auth.uid()) IN (m.sender_user_id,m.recipient_user_id)
 ORDER BY CASE WHEN m.sender_user_id=(SELECT auth.uid()) THEN m.recipient_user_id ELSE m.sender_user_id END,m.created_at DESC,m.id DESC) x),'[]'::jsonb));
$$;
CREATE FUNCTION public.list_direct_conversations() RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_direct_conversations(); $$;

-- Explicit grants: no callable anonymous definer functions or direct table writes.
REVOKE ALL ON FUNCTION private.can_manage_chat(UUID),private.chat_permission(UUID,TEXT),private.chat_player_count(UUID),private.chat_info(UUID,UUID),private.guard_chat_admission(),private.list_system_chats(UUID,UUID),private.room_operation(TEXT,UUID,UUID,JSONB),private.social_groups_action(TEXT,UUID,JSONB),private.list_direct_conversations(),public.list_system_chats(UUID,UUID),public.room_operation(TEXT,UUID,UUID,JSONB),public.social_groups_action(TEXT,UUID,JSONB),public.list_direct_conversations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_chat(UUID),private.chat_permission(UUID,TEXT),private.list_system_chats(UUID,UUID),private.room_operation(TEXT,UUID,UUID,JSONB),private.social_groups_action(TEXT,UUID,JSONB),private.list_direct_conversations(),public.list_system_chats(UUID,UUID),public.room_operation(TEXT,UUID,UUID,JSONB),public.social_groups_action(TEXT,UUID,JSONB),public.list_direct_conversations() TO authenticated;

-- Preserve invitation workflow; admission failures roll back all membership/status writes.
CREATE FUNCTION private.respond_rpg_invitation(
    p_invitation_id UUID, p_decision TEXT, p_character_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_invitation public.rpg_invitations%ROWTYPE;
    v_system public.game_systems%ROWTYPE;
    v_chat public.chats%ROWTYPE;
    v_next TEXT;
    v_character public.characters%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('approve','decline','accept','cancel') THEN
        RETURN jsonb_build_object('status','invalid_decision');
    END IF;
    SELECT * INTO v_invitation FROM public.rpg_invitations WHERE id = p_invitation_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    SELECT * INTO v_system FROM public.game_systems WHERE id = v_invitation.game_system_id;
    IF v_invitation.chat_id IS NOT NULL THEN SELECT * INTO v_chat FROM public.chats WHERE id = v_invitation.chat_id; END IF;

    IF p_decision IN ('approve','decline') THEN
        IF COALESCE(v_chat.owner_user_id, v_system.owner_user_id) <> v_user_id THEN
            RETURN jsonb_build_object('status','forbidden');
        END IF;
        IF v_invitation.status <> 'pending_owner_approval' THEN RETURN jsonb_build_object('status','conflict'); END IF;
        v_next := CASE p_decision WHEN 'approve' THEN 'pending_recipient' ELSE 'declined' END;
    ELSIF p_decision = 'cancel' THEN
        IF v_invitation.inviter_user_id <> v_user_id THEN RETURN jsonb_build_object('status','forbidden'); END IF;
        IF v_invitation.status NOT IN ('pending_owner_approval','pending_recipient') THEN RETURN jsonb_build_object('status','conflict'); END IF;
        v_next := 'cancelled';
    ELSE
        IF v_invitation.invitee_user_id <> v_user_id THEN RETURN jsonb_build_object('status','forbidden'); END IF;
        IF v_invitation.status <> 'pending_recipient'
           AND NOT (v_invitation.status = 'accepted' AND v_invitation.chat_id IS NOT NULL AND p_character_id IS NOT NULL) THEN
            RETURN jsonb_build_object('status','conflict');
        END IF;
        IF p_character_id IS NOT NULL THEN
            SELECT * INTO v_character FROM public.characters
            WHERE id = p_character_id AND user_id = v_user_id AND game_system_id = v_invitation.game_system_id AND status = 'active';
            IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid_character'); END IF;
        END IF;
        IF p_decision = 'decline' THEN v_next := 'declined';
        ELSE
            IF v_system.id IS NULL OR v_system.is_active IS DISTINCT FROM true
               OR (v_invitation.chat_id IS NOT NULL AND v_chat.status IS DISTINCT FROM 'active') THEN
                RETURN jsonb_build_object('status','not_found');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM public.friend_requests f WHERE f.status = 'accepted'
                AND LEAST(f.requester_user_id,f.recipient_user_id) = LEAST(v_user_id,v_invitation.inviter_user_id)
                AND GREATEST(f.requester_user_id,f.recipient_user_id) = GREATEST(v_user_id,v_invitation.inviter_user_id)) THEN
                RETURN jsonb_build_object('status','conflict');
            END IF;
            INSERT INTO public.game_system_memberships(user_id, game_system_id, role)
            VALUES(v_user_id, v_invitation.game_system_id, 'user')
            ON CONFLICT(user_id, game_system_id) DO NOTHING;
            -- The first UI acceptance has no character yet. It must obey the
            -- same account permissions and capacity, without reserving a seat.
            IF v_invitation.chat_id IS NOT NULL THEN
                SELECT * INTO v_chat FROM public.chats WHERE id=v_invitation.chat_id FOR UPDATE;
                IF NOT private.chat_permission(v_chat.id,'view') OR NOT private.chat_permission(v_chat.id,'enter') THEN
                    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='room_forbidden';
                END IF;
                IF v_chat.max_players IS NOT NULL AND private.chat_player_count(v_chat.id)>=v_chat.max_players
                AND NOT EXISTS(SELECT 1 FROM public.chat_members m JOIN public.characters c ON c.id=m.character_id WHERE m.chat_id=v_chat.id AND c.user_id=v_user_id) THEN
                    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='room_full';
                END IF;
            END IF;
            IF v_invitation.chat_id IS NOT NULL AND p_character_id IS NOT NULL THEN
                INSERT INTO public.chat_members(chat_id, character_id, game_system_id, role)
                VALUES(v_invitation.chat_id, p_character_id, v_invitation.game_system_id, 'player')
                ON CONFLICT(chat_id, character_id) DO NOTHING;
            END IF;
            v_next := 'accepted';
        END IF;
    END IF;
    UPDATE public.rpg_invitations SET status = v_next, updated_at = now() WHERE id = p_invitation_id;
    RETURN jsonb_build_object('status',v_next,'invitation_id',p_invitation_id);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
 RETURN jsonb_build_object('status',CASE SQLERRM WHEN 'room_forbidden' THEN 'forbidden' ELSE SQLERRM END);
END;
$function$;


CREATE OR REPLACE FUNCTION public.respond_rpg_invitation(p_invitation_id UUID,p_decision TEXT,p_character_id UUID) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.respond_rpg_invitation(p_invitation_id,p_decision,p_character_id); $$;
REVOKE ALL ON FUNCTION private.respond_rpg_invitation(UUID,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.respond_rpg_invitation(UUID,TEXT,UUID) TO authenticated;

COMMIT;
