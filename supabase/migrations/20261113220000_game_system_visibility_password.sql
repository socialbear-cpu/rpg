BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.game_systems
    ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN access_password_hash TEXT;
ALTER TABLE public.game_systems
    ADD CONSTRAINT game_systems_private_password_check
    CHECK (is_public OR access_password_hash IS NOT NULL);

CREATE TABLE private.system_password_attempts (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    failure_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, game_system_id)
);
REVOKE ALL ON TABLE private.system_password_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private._update_game_system_access_settings(
    p_system_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_is_public BOOLEAN,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_system public.game_systems%ROWTYPE;
BEGIN
    IF NOT private.has_system_role(p_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner', 'system', NULL);
    END IF;

    SELECT * INTO v_system
    FROM public.game_systems
    WHERE id = p_system_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'system', NULL);
    END IF;

    IF NOT p_is_public AND v_system.access_password_hash IS NULL AND COALESCE(p_password, '') = '' THEN
        RETURN jsonb_build_object('status', 'password_required', 'system', NULL);
    END IF;
    IF COALESCE(p_password, '') <> '' AND length(p_password) < 8 THEN
        RETURN jsonb_build_object('status', 'password_too_short', 'system', NULL);
    END IF;
    IF octet_length(COALESCE(p_password, '')) > 72 THEN
        RETURN jsonb_build_object('status', 'password_too_long', 'system', NULL);
    END IF;

    UPDATE public.game_systems
    SET name = p_name,
        description = p_description,
        is_public = p_is_public,
        access_password_hash = CASE
            WHEN COALESCE(p_password, '') <> '' THEN extensions.crypt(p_password, extensions.gen_salt('bf', 12))
            ELSE v_system.access_password_hash
        END,
        updated_at = now()
    WHERE id = p_system_id
    RETURNING * INTO v_system;

    RETURN jsonb_build_object(
        'status', 'updated',
        'system', jsonb_build_object(
            'id', v_system.id,
            'slug', v_system.slug,
            'name', v_system.name,
            'description', v_system.description,
            'is_public', v_system.is_public
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION private._update_game_system_access_settings(UUID, TEXT, TEXT, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._update_game_system_access_settings(UUID, TEXT, TEXT, BOOLEAN, TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.update_game_system_access_settings(
    p_system_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_is_public BOOLEAN,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._update_game_system_access_settings($1, $2, $3, $4, $5);
$function$;
REVOKE ALL ON FUNCTION public.update_game_system_access_settings(UUID, TEXT, TEXT, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_game_system_access_settings(UUID, TEXT, TEXT, BOOLEAN, TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION private._join_game_system_with_password(
    p_system_id UUID,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_system public.game_systems%ROWTYPE;
    v_attempt private.system_password_attempts%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    SELECT * INTO v_system FROM public.game_systems WHERE id = p_system_id AND is_active;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_system.is_public OR private.has_system_role(p_system_id, ARRAY['owner', 'mod', 'user']) THEN
        RETURN jsonb_build_object('status', 'ok');
    END IF;
    IF COALESCE(p_password, '') = '' THEN
        RETURN jsonb_build_object('status', 'password_required');
    END IF;
    IF octet_length(p_password) > 72 THEN
        RETURN jsonb_build_object('status', 'invalid_password');
    END IF;

    SELECT * INTO v_attempt FROM private.system_password_attempts
    WHERE user_id = v_user_id AND game_system_id = p_system_id;
    IF FOUND AND v_attempt.window_started_at > now() - interval '1 hour' AND v_attempt.failure_count >= 5 THEN
        RETURN jsonb_build_object('status', 'rate_limited');
    END IF;

    IF v_system.access_password_hash IS NULL
       OR extensions.crypt(p_password, v_system.access_password_hash) <> v_system.access_password_hash THEN
        INSERT INTO private.system_password_attempts (user_id, game_system_id, window_started_at, failure_count)
        VALUES (v_user_id, p_system_id, now(), 1)
        ON CONFLICT (user_id, game_system_id) DO UPDATE SET
            failure_count = CASE
                WHEN private.system_password_attempts.window_started_at <= now() - interval '1 hour' THEN 1
                ELSE private.system_password_attempts.failure_count + 1
            END,
            window_started_at = CASE
                WHEN private.system_password_attempts.window_started_at <= now() - interval '1 hour' THEN now()
                ELSE private.system_password_attempts.window_started_at
            END;
        RETURN jsonb_build_object('status', 'invalid_password');
    END IF;

    DELETE FROM private.system_password_attempts
    WHERE user_id = v_user_id AND game_system_id = p_system_id;
    INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
    VALUES (v_user_id, p_system_id, 'user')
    ON CONFLICT (user_id, game_system_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'ok');
END;
$function$;
REVOKE ALL ON FUNCTION private._join_game_system_with_password(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._join_game_system_with_password(UUID, TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.join_game_system_with_password(
    p_system_id UUID,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._join_game_system_with_password($1, $2);
$function$;
REVOKE ALL ON FUNCTION public.join_game_system_with_password(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game_system_with_password(UUID, TEXT)
    TO authenticated;

COMMIT;
