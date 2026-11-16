ALTER TABLE public.user_profiles
    ADD COLUMN username_change_used BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_user_profile_username_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    IF OLD.username IS DISTINCT FROM NEW.username THEN
        IF OLD.username_change_used THEN
            RAISE EXCEPTION 'Profile nick can only be changed once'
                USING ERRCODE = '23514';
        END IF;

        IF OLD.username IS NOT NULL THEN
            NEW.username_change_used := true;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_user_profile_username_change() FROM PUBLIC, anon, authenticated;
