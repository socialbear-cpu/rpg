BEGIN;

-- Keep the old account-wide ledger for compatibility; new displays use this ledger.
CREATE TABLE public.daily_login_system_popup_views (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    viewed_on DATE NOT NULL,
    PRIMARY KEY (user_id, game_system_id)
);
ALTER TABLE public.daily_login_system_popup_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_login_system_popup_views FROM anon, authenticated;

CREATE FUNCTION private._take_daily_login_popup(p_game_system_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_timezone TEXT;
    v_day DATE;
    v_inserted UUID;
BEGIN
    IF v_user IS NULL THEN RETURN FALSE; END IF;
    SELECT daily_login_timezone INTO v_timezone FROM public.game_systems
    WHERE id = p_game_system_id AND is_active AND daily_login_rewards_enabled;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.characters
        WHERE user_id = v_user AND game_system_id = p_game_system_id AND status = 'active')
    THEN RETURN FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_timezone)
    THEN RETURN FALSE; END IF;
    v_day := (clock_timestamp() AT TIME ZONE v_timezone)::DATE;
    INSERT INTO public.daily_login_system_popup_views (user_id, game_system_id, viewed_on)
    VALUES (v_user, p_game_system_id, v_day)
    ON CONFLICT (user_id, game_system_id) DO UPDATE SET viewed_on = EXCLUDED.viewed_on
    WHERE daily_login_system_popup_views.viewed_on < EXCLUDED.viewed_on
    RETURNING user_id INTO v_inserted;
    RETURN v_inserted IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION private._take_daily_login_popup(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._take_daily_login_popup(UUID) TO authenticated;

CREATE FUNCTION public.take_daily_login_popup(p_game_system_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY INVOKER SET search_path = ''
AS $$ SELECT private._take_daily_login_popup(p_game_system_id); $$;
REVOKE ALL ON FUNCTION public.take_daily_login_popup(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_daily_login_popup(UUID) TO authenticated;

COMMIT;
