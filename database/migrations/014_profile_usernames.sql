BEGIN;

ALTER TABLE public.user_profiles
    ADD COLUMN username TEXT;

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_username_format_check
    CHECK (
        username IS NULL
        OR (
            username = lower(username)
            AND username ~ '^[a-z0-9_]{3,20}$'
        )
    );

CREATE UNIQUE INDEX user_profiles_username_lower_uq
    ON public.user_profiles (lower(username))
    WHERE username IS NOT NULL;

GRANT UPDATE (username) ON TABLE public.user_profiles TO authenticated;

CREATE FUNCTION public.prevent_user_profile_username_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
        RAISE EXCEPTION 'Profile nick can only be chosen once'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_user_profile_username_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER user_profiles_username_immutable
    BEFORE UPDATE OF username ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_user_profile_username_change();

COMMIT;
