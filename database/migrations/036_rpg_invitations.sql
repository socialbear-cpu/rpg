BEGIN;

-- Bound username-search payloads and reject a NULL friendship decision.
CREATE OR REPLACE FUNCTION public.search_social_profiles(p_query TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user_id UUID := (SELECT auth.uid()); v_query TEXT := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_query, '')));
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('status','unauthorized','results','[]'::jsonb); END IF;
    IF pg_catalog.char_length(v_query) NOT BETWEEN 2 AND 20 OR v_query !~ '^[a-z0-9_]+$' THEN
        RETURN jsonb_build_object('status','invalid_query','results','[]'::jsonb);
    END IF;
    RETURN jsonb_build_object('status','ok','results',COALESCE((
        SELECT jsonb_agg(jsonb_build_object('user_id', profile_result.user_id, 'username', profile_result.username,
            'display_name', profile_result.display_name, 'avatar_url', profile_result.avatar_url, 'bio', profile_result.bio)
            ORDER BY profile_result.username)
        FROM (SELECT profile.user_id, profile.username, profile.display_name, profile.avatar_url, profile.bio
            FROM public.user_profiles profile
            WHERE profile.user_id <> v_user_id AND profile.username IS NOT NULL
              AND pg_catalog.lower(profile.username) LIKE '%' || v_query || '%'
            ORDER BY profile.username LIMIT 20) AS profile_result
    ),'[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_request_id UUID, p_decision TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user_id UUID := (SELECT auth.uid()); v_request public.friend_requests%ROWTYPE; v_next_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('accept','decline') THEN
        RETURN jsonb_build_object('status','invalid_decision');
    END IF;
    SELECT * INTO v_request FROM public.friend_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    IF v_request.recipient_user_id <> v_user_id THEN RETURN jsonb_build_object('status','forbidden'); END IF;
    IF v_request.status <> 'pending' THEN RETURN jsonb_build_object('status','conflict'); END IF;
    v_next_status := CASE p_decision WHEN 'accept' THEN 'accepted' ELSE 'declined' END;
    UPDATE public.friend_requests SET status = v_next_status, updated_at = now() WHERE id = p_request_id;
    RETURN jsonb_build_object('status',v_next_status,'request_id',p_request_id);
END;
$function$;

CREATE TABLE public.rpg_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invitee_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    chat_id UUID,
    status TEXT NOT NULL CHECK (status IN (
        'pending_owner_approval', 'pending_recipient', 'accepted', 'declined', 'cancelled'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rpg_invitations_no_self CHECK (inviter_user_id <> invitee_user_id),
    CONSTRAINT rpg_invitations_chat_system_fk FOREIGN KEY (chat_id, game_system_id)
        REFERENCES public.chats(id, game_system_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX rpg_invitations_active_target_uq
    ON public.rpg_invitations (invitee_user_id, game_system_id, COALESCE(chat_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE status IN ('pending_owner_approval', 'pending_recipient', 'accepted');
CREATE INDEX rpg_invitations_invitee_status_created_idx
    ON public.rpg_invitations (invitee_user_id, status, created_at DESC);
CREATE INDEX rpg_invitations_system_status_created_idx
    ON public.rpg_invitations (game_system_id, status, created_at DESC);

ALTER TABLE public.rpg_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rpg_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.rpg_invitations TO authenticated;
CREATE POLICY rpg_invitations_read_participant
    ON public.rpg_invitations FOR SELECT TO authenticated
    USING (
        inviter_user_id = (SELECT auth.uid()) OR invitee_user_id = (SELECT auth.uid())
        OR (status = 'pending_owner_approval' AND EXISTS (
            SELECT 1 FROM public.game_systems AS system
            LEFT JOIN public.chats AS chat ON chat.id = chat_id
            WHERE system.id = game_system_id
              AND COALESCE(chat.owner_user_id, system.owner_user_id) = (SELECT auth.uid())
        ))
    );

CREATE FUNCTION public.create_rpg_invitation(
    p_friend_user_id UUID, p_game_system_id UUID, p_chat_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_system public.game_systems%ROWTYPE;
    v_chat public.chats%ROWTYPE;
    v_is_owner BOOLEAN;
    v_is_member BOOLEAN;
    v_status TEXT;
    v_id UUID;
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
    IF p_friend_user_id IS NULL OR p_friend_user_id = v_user_id THEN
        RETURN jsonb_build_object('status', 'invalid_recipient');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.friend_requests AS friendship
        WHERE friendship.status = 'accepted'
          AND LEAST(friendship.requester_user_id, friendship.recipient_user_id) = LEAST(v_user_id, p_friend_user_id)
          AND GREATEST(friendship.requester_user_id, friendship.recipient_user_id) = GREATEST(v_user_id, p_friend_user_id)
    ) THEN RETURN jsonb_build_object('status', 'not_friends'); END IF;

    IF p_chat_id IS NOT NULL THEN
        SELECT * INTO v_chat FROM public.chats WHERE id = p_chat_id AND status = 'active' FOR SHARE;
        IF NOT FOUND OR v_chat.game_system_id <> p_game_system_id THEN
            RETURN jsonb_build_object('status', 'not_found');
        END IF;
        p_game_system_id := v_chat.game_system_id;
    END IF;
    SELECT * INTO v_system FROM public.game_systems WHERE id = p_game_system_id AND is_active = true FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

    v_is_owner := CASE WHEN p_chat_id IS NULL
        THEN v_system.owner_user_id = v_user_id ELSE v_chat.owner_user_id = v_user_id END;
    IF p_chat_id IS NULL THEN
        v_is_member := private.has_system_role(p_game_system_id, ARRAY['owner','mod','user']);
    ELSE
        v_is_member := private.has_system_role(p_game_system_id, ARRAY['owner'])
            OR private.is_chat_member(p_chat_id)
            OR EXISTS (SELECT 1 FROM public.chats c WHERE c.id = p_chat_id AND c.owner_user_id = v_user_id);
    END IF;
    IF NOT v_is_owner AND NOT v_is_member THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;

    IF p_chat_id IS NULL AND EXISTS (
        SELECT 1 FROM public.game_system_memberships m WHERE m.user_id = p_friend_user_id AND m.game_system_id = p_game_system_id
    ) THEN RETURN jsonb_build_object('status', 'already_member'); END IF;
    IF p_chat_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.chat_members cm JOIN public.characters c ON c.id = cm.character_id
        WHERE cm.chat_id = p_chat_id AND c.user_id = p_friend_user_id
    ) THEN RETURN jsonb_build_object('status', 'already_member'); END IF;

    v_status := CASE WHEN v_is_owner THEN 'pending_recipient' ELSE 'pending_owner_approval' END;
    INSERT INTO public.rpg_invitations (inviter_user_id, invitee_user_id, game_system_id, chat_id, status)
    VALUES (v_user_id, p_friend_user_id, p_game_system_id, p_chat_id, v_status)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', v_status, 'invitation_id', v_id);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'already_invited');
END;
$function$;

CREATE FUNCTION public.list_my_social_invitations() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user_id UUID := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status','unauthorized','owner_approvals','[]'::jsonb,'recipient_invitations','[]'::jsonb);
    END IF;
    RETURN jsonb_build_object(
      'status','ok',
      'owner_approvals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'invitee_user_id', i.invitee_user_id, 'username', p.username,
        'display_name', p.display_name, 'game_system_id', i.game_system_id, 'chat_id', i.chat_id,
        'system_name', s.name, 'chat_name', c.name, 'created_at', i.created_at, 'status', i.status
      ) ORDER BY i.created_at DESC) FROM public.rpg_invitations i
        JOIN public.game_systems s ON s.id = i.game_system_id
        LEFT JOIN public.chats c ON c.id = i.chat_id
        JOIN public.user_profiles p ON p.user_id = i.invitee_user_id
        WHERE i.status = 'pending_owner_approval' AND COALESCE(c.owner_user_id, s.owner_user_id) = v_user_id), '[]'::jsonb),
      'recipient_invitations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'inviter_user_id', i.inviter_user_id, 'username', p.username,
        'display_name', p.display_name, 'game_system_id', i.game_system_id, 'chat_id', i.chat_id,
        'system_name', s.name, 'chat_name', c.name, 'created_at', i.created_at, 'status', i.status
      ) ORDER BY i.created_at DESC) FROM public.rpg_invitations i
        JOIN public.game_systems s ON s.id = i.game_system_id
        LEFT JOIN public.chats c ON c.id = i.chat_id
        JOIN public.user_profiles p ON p.user_id = i.inviter_user_id
        WHERE i.invitee_user_id = v_user_id AND (
          i.status = 'pending_recipient'
          OR (i.status = 'accepted' AND i.chat_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.chat_members cm JOIN public.characters ch ON ch.id = cm.character_id
            WHERE cm.chat_id = i.chat_id AND ch.user_id = v_user_id
          ))
        )), '[]'::jsonb)
    );
END;
$function$;

CREATE FUNCTION public.respond_rpg_invitation(
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user_id UUID := (SELECT auth.uid()); v_removed INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
    IF p_friend_user_id IS NULL OR p_friend_user_id = v_user_id THEN RETURN jsonb_build_object('status','invalid_friend'); END IF;
    UPDATE public.rpg_invitations SET status = 'cancelled', updated_at = now()
      WHERE status IN ('pending_owner_approval','pending_recipient')
        AND ((inviter_user_id = v_user_id AND invitee_user_id = p_friend_user_id)
          OR (inviter_user_id = p_friend_user_id AND invitee_user_id = v_user_id));
    DELETE FROM public.friend_requests
      WHERE status = 'accepted'
        AND LEAST(requester_user_id,recipient_user_id) = LEAST(v_user_id,p_friend_user_id)
        AND GREATEST(requester_user_id,recipient_user_id) = GREATEST(v_user_id,p_friend_user_id);
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    IF v_removed = 0 THEN RETURN jsonb_build_object('status','not_found'); END IF;
    RETURN jsonb_build_object('status','removed','friend_user_id',p_friend_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_rpg_invitation(UUID,UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_social_invitations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_rpg_invitation(UUID,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rpg_invitation(UUID,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_social_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_rpg_invitation(UUID,TEXT,UUID) TO authenticated;

COMMIT;
