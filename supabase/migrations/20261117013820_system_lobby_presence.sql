BEGIN;

CREATE TABLE public.game_system_lobby_presence (
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (game_system_id, user_id)
);

CREATE INDEX game_system_lobby_presence_last_seen_idx
    ON public.game_system_lobby_presence (game_system_id, last_seen_at DESC);

ALTER TABLE public.game_system_lobby_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_system_lobby_presence FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.heartbeat_game_system_lobby_presence(p_game_system_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_online_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.game_system_memberships AS membership
        WHERE membership.user_id = v_user_id
          AND membership.game_system_id = p_game_system_id
    ) THEN
        RAISE EXCEPTION 'System membership required' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.game_system_lobby_presence (game_system_id, user_id, last_seen_at)
    VALUES (p_game_system_id, v_user_id, statement_timestamp())
    ON CONFLICT (game_system_id, user_id)
    DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;

    SELECT count(*)::INTEGER
    INTO v_online_count
    FROM public.game_system_lobby_presence AS presence
    WHERE presence.game_system_id = p_game_system_id
      AND presence.last_seen_at > statement_timestamp() - INTERVAL '90 seconds'
      AND EXISTS (
          SELECT 1
          FROM public.game_system_memberships AS membership
          WHERE membership.game_system_id = presence.game_system_id
            AND membership.user_id = presence.user_id
      );

    RETURN v_online_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_game_system_lobby_presence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_game_system_lobby_presence(UUID) TO authenticated;

COMMIT;
