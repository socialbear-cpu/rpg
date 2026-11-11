BEGIN;

CREATE TABLE public.daily_login_popup_views (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    viewed_on DATE NOT NULL
);
ALTER TABLE public.daily_login_popup_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_login_popup_views FROM anon, authenticated;

CREATE FUNCTION private._take_daily_login_popup()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_day DATE := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_inserted UUID;
BEGIN
    IF v_user IS NULL THEN RETURN FALSE; END IF;
    INSERT INTO public.daily_login_popup_views (user_id, viewed_on)
    VALUES (v_user, v_day)
    ON CONFLICT (user_id) DO UPDATE SET viewed_on = EXCLUDED.viewed_on
    WHERE daily_login_popup_views.viewed_on < EXCLUDED.viewed_on
    RETURNING user_id INTO v_inserted;
    RETURN v_inserted IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION private._take_daily_login_popup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._take_daily_login_popup() TO authenticated;

CREATE FUNCTION public.take_daily_login_popup()
RETURNS BOOLEAN LANGUAGE SQL SECURITY INVOKER SET search_path = ''
AS $$ SELECT private._take_daily_login_popup(); $$;
REVOKE ALL ON FUNCTION public.take_daily_login_popup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_daily_login_popup() TO authenticated;

COMMIT;
