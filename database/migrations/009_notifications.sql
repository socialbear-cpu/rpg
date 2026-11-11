-- Persistent per-user inbox for role changes and system announcements.
BEGIN;

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_system_id UUID REFERENCES public.game_systems(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (length(type) > 0),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_created_idx
    ON public.notifications (recipient_user_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread_recipient_idx
    ON public.notifications (recipient_user_id)
    WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;

CREATE POLICY notifications_read_own
    ON public.notifications FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL AND recipient_user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private._set_system_moderator(
    p_game_system_id UUID,
    p_user_id UUID,
    p_is_moderator BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := (SELECT auth.uid());
    v_target_role TEXT;
    v_new_role TEXT := CASE WHEN p_is_moderator THEN 'mod' ELSE 'user' END;
    v_system_name TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    IF NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;

    SELECT membership.role
    INTO v_target_role
    FROM public.game_system_memberships AS membership
    WHERE membership.user_id = p_user_id
      AND membership.game_system_id = p_game_system_id
    FOR UPDATE;

    IF NOT FOUND OR v_target_role NOT IN ('user', 'mod') THEN
        RETURN jsonb_build_object('status', 'invalid_member');
    END IF;

    IF v_target_role IS DISTINCT FROM v_new_role THEN
        SELECT system.name
        INTO v_system_name
        FROM public.game_systems AS system
        WHERE system.id = p_game_system_id;

        UPDATE public.game_system_memberships
        SET role = v_new_role,
            updated_at = now()
        WHERE user_id = p_user_id
          AND game_system_id = p_game_system_id;

        INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
        VALUES (
            p_user_id,
            p_game_system_id,
            'system_role_changed',
            jsonb_build_object(
                'game_system_name', v_system_name,
                'previous_role', v_target_role,
                'new_role', v_new_role
            )
        );
    END IF;

    RETURN jsonb_build_object('status', 'updated');
END;
$function$;
REVOKE ALL ON FUNCTION private._set_system_moderator(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._set_system_moderator(UUID, UUID, BOOLEAN)
    TO authenticated;

CREATE OR REPLACE FUNCTION private._mark_my_notification_read(p_notification_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    UPDATE public.notifications
    SET read_at = COALESCE(read_at, now())
    WHERE id = p_notification_id
      AND recipient_user_id = v_user_id;

    IF FOUND THEN
        RETURN jsonb_build_object('status', 'updated');
    END IF;

    RETURN jsonb_build_object('status', 'not_found');
END;
$function$;
REVOKE ALL ON FUNCTION private._mark_my_notification_read(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._mark_my_notification_read(UUID)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_my_notification_read(p_notification_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._mark_my_notification_read($1);
$function$;
REVOKE ALL ON FUNCTION public.mark_my_notification_read(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_read(UUID)
    TO authenticated;

CREATE OR REPLACE FUNCTION private._create_system_announcement(
    p_game_system_id UUID,
    p_title TEXT,
    p_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := (SELECT auth.uid());
    v_title TEXT := btrim(p_title);
    v_body TEXT := btrim(p_body);
    v_recipient_count INTEGER;
BEGIN
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 100
       OR v_body IS NULL OR length(v_body) NOT BETWEEN 1 AND 2000 THEN
        RETURN jsonb_build_object('status', 'invalid_content');
    END IF;

    PERFORM 1
    FROM public.game_system_memberships AS membership
    WHERE membership.user_id = v_actor_id
      AND membership.game_system_id = p_game_system_id
      AND membership.role IN ('owner', 'mod')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_authorized');
    END IF;

    INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
    SELECT membership.user_id,
           p_game_system_id,
           'system_announcement',
           jsonb_build_object('title', v_title, 'body', v_body)
    FROM public.game_system_memberships AS membership
    WHERE membership.game_system_id = p_game_system_id;

    GET DIAGNOSTICS v_recipient_count = ROW_COUNT;
    RETURN jsonb_build_object('status', 'created', 'recipient_count', v_recipient_count);
END;
$function$;
REVOKE ALL ON FUNCTION private._create_system_announcement(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._create_system_announcement(UUID, TEXT, TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.create_system_announcement(
    p_game_system_id UUID,
    p_title TEXT,
    p_body TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._create_system_announcement($1, $2, $3);
$function$;
REVOKE ALL ON FUNCTION public.create_system_announcement(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_system_announcement(UUID, TEXT, TEXT)
    TO authenticated;

COMMIT;
