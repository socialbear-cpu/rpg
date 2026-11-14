BEGIN;

CREATE OR REPLACE FUNCTION private._has_recent_email_sign_in()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(
            CASE
                WHEN pg_catalog.jsonb_typeof((SELECT auth.jwt())->'amr') = 'array'
                    THEN (SELECT auth.jwt())->'amr'
                ELSE '[]'::JSONB
            END
        ) AS method(value)
        WHERE method.value->>'method' IN ('otp', 'magiclink')
          AND NULLIF((SELECT auth.jwt())->>'email', '') IS NOT NULL
          AND (method.value->>'timestamp') ~ '^[0-9]+$'
          AND (method.value->>'timestamp')::NUMERIC >=
              extract(epoch FROM now() - INTERVAL '1 hour')
    );
$function$;
REVOKE ALL ON FUNCTION private._has_recent_email_sign_in() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.manage_game_system_lifecycle(p_system_id UUID, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_action = 'delete' AND NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;
    RETURN private._manage_game_system_lifecycle(p_system_id, p_action);
END;
$function$;
REVOKE ALL ON FUNCTION private._manage_game_system_lifecycle(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manage_game_system_lifecycle(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_game_system_lifecycle(UUID, TEXT)
    TO authenticated;

COMMIT;
