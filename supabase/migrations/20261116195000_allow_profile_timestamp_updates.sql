CREATE OR REPLACE FUNCTION private.guard_profile_system_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NOT private.is_platform_admin()
       AND (OLD.user_id IS DISTINCT FROM NEW.user_id
            OR OLD.created_at IS DISTINCT FROM NEW.created_at) THEN
        RAISE EXCEPTION 'Only a platform admin can update protected profile fields'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;
