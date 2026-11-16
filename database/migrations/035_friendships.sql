BEGIN;

CREATE TABLE public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT friend_requests_no_self CHECK (requester_user_id <> recipient_user_id)
);

CREATE UNIQUE INDEX friend_requests_active_pair_uq
    ON public.friend_requests (
        LEAST(requester_user_id, recipient_user_id),
        GREATEST(requester_user_id, recipient_user_id)
    )
    WHERE status IN ('pending', 'accepted');
CREATE INDEX friend_requests_recipient_status_created_idx
    ON public.friend_requests (recipient_user_id, status, created_at DESC, id DESC);
CREATE INDEX friend_requests_requester_status_created_idx
    ON public.friend_requests (requester_user_id, status, created_at DESC, id DESC);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.friend_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.friend_requests TO authenticated;

CREATE POLICY friend_requests_read_participant
    ON public.friend_requests FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) IS NOT NULL
        AND (requester_user_id = (SELECT auth.uid()) OR recipient_user_id = (SELECT auth.uid()))
    );

CREATE FUNCTION public.search_social_profiles(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_query TEXT := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_query, '')));
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'results', '[]'::jsonb);
    END IF;
    IF pg_catalog.char_length(v_query) NOT BETWEEN 2 AND 20
       OR v_query !~ '^[a-z0-9_]+$' THEN
        RETURN jsonb_build_object('status', 'invalid_query', 'results', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'results', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'user_id', profile.user_id,
                    'username', profile.username,
                    'display_name', profile.display_name,
                    'avatar_url', profile.avatar_url,
                    'bio', profile.bio
                ) ORDER BY profile.username
            )
            FROM public.user_profiles AS profile
            WHERE profile.user_id <> v_user_id
              AND profile.username IS NOT NULL
              AND pg_catalog.lower(profile.username) LIKE '%' || v_query || '%'
        ), '[]'::jsonb)
    );
END;
$function$;

CREATE FUNCTION public.list_my_friendships()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'unauthorized',
            'friends', '[]'::jsonb,
            'incoming_requests', '[]'::jsonb,
            'outgoing_requests', '[]'::jsonb
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'friends', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'user_id', profile.user_id,
                    'username', profile.username,
                    'display_name', profile.display_name,
                    'avatar_url', profile.avatar_url,
                    'bio', profile.bio,
                    'since', request.updated_at
                ) ORDER BY profile.username
            )
            FROM public.friend_requests AS request
            JOIN public.user_profiles AS profile
              ON profile.user_id = CASE
                    WHEN request.requester_user_id = v_user_id THEN request.recipient_user_id
                    ELSE request.requester_user_id
                 END
            WHERE request.status = 'accepted'
              AND v_user_id IN (request.requester_user_id, request.recipient_user_id)
        ), '[]'::jsonb),
        'incoming_requests', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', request.id,
                    'user_id', profile.user_id,
                    'username', profile.username,
                    'display_name', profile.display_name,
                    'avatar_url', profile.avatar_url,
                    'bio', profile.bio,
                    'created_at', request.created_at
                ) ORDER BY request.created_at DESC, request.id
            )
            FROM public.friend_requests AS request
            JOIN public.user_profiles AS profile ON profile.user_id = request.requester_user_id
            WHERE request.recipient_user_id = v_user_id AND request.status = 'pending'
        ), '[]'::jsonb),
        'outgoing_requests', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', request.id,
                    'user_id', profile.user_id,
                    'username', profile.username,
                    'display_name', profile.display_name,
                    'avatar_url', profile.avatar_url,
                    'bio', profile.bio,
                    'created_at', request.created_at
                ) ORDER BY request.created_at DESC, request.id
            )
            FROM public.friend_requests AS request
            JOIN public.user_profiles AS profile ON profile.user_id = request.recipient_user_id
            WHERE request.requester_user_id = v_user_id AND request.status = 'pending'
        ), '[]'::jsonb)
    );
END;
$function$;

CREATE FUNCTION public.create_friend_request(p_recipient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_request_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_recipient_id IS NULL OR p_recipient_id = v_user_id THEN
        RETURN jsonb_build_object('status', 'self_request');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles AS profile
        WHERE profile.user_id = p_recipient_id AND profile.username IS NOT NULL
    ) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    INSERT INTO public.friend_requests (requester_user_id, recipient_user_id)
    VALUES (v_user_id, p_recipient_id)
    RETURNING id INTO v_request_id;
    RETURN jsonb_build_object('status', 'created', 'request_id', v_request_id);
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'already_pending');
END;
$function$;

CREATE FUNCTION public.respond_friend_request(p_request_id UUID, p_decision TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_request public.friend_requests%ROWTYPE;
    v_next_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_decision NOT IN ('accept', 'decline') THEN
        RETURN jsonb_build_object('status', 'invalid_decision');
    END IF;

    SELECT * INTO v_request
    FROM public.friend_requests
    WHERE id = p_request_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_request.recipient_user_id <> v_user_id THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF v_request.status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'conflict');
    END IF;

    v_next_status := CASE p_decision WHEN 'accept' THEN 'accepted' ELSE 'declined' END;
    UPDATE public.friend_requests
    SET status = v_next_status, updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', v_next_status, 'request_id', p_request_id);
END;
$function$;

CREATE FUNCTION public.cancel_friend_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_request public.friend_requests%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    SELECT * INTO v_request
    FROM public.friend_requests
    WHERE id = p_request_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_request.requester_user_id <> v_user_id THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF v_request.status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'conflict');
    END IF;

    UPDATE public.friend_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'cancelled', 'request_id', p_request_id);
END;
$function$;

CREATE FUNCTION public.remove_friend(p_friend_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_removed INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_friend_user_id IS NULL OR p_friend_user_id = v_user_id THEN
        RETURN jsonb_build_object('status', 'invalid_friend');
    END IF;

    DELETE FROM public.friend_requests AS request
    WHERE request.status = 'accepted'
      AND (
          (request.requester_user_id = v_user_id AND request.recipient_user_id = p_friend_user_id)
          OR (request.requester_user_id = p_friend_user_id AND request.recipient_user_id = v_user_id)
      );
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    IF v_removed = 0 THEN
        RETURN jsonb_build_object('status', 'not_friends');
    END IF;
    RETURN jsonb_build_object('status', 'removed');
END;
$function$;

REVOKE ALL ON FUNCTION public.search_social_profiles(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_friendships() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_friend_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_friend_request(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_friend_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_friend(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_social_profiles(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_friendships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;

COMMIT;
