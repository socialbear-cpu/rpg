BEGIN;

CREATE OR REPLACE FUNCTION private._search_system_members_by_character_name(
    p_game_system_id UUID,
    p_query TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := (SELECT auth.uid());
    v_results JSONB;
BEGIN
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'results', '[]'::jsonb);
    END IF;

    IF NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner', 'results', '[]'::jsonb);
    END IF;

    SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
            'user_id', result.user_id,
            'character_name', result.character_name,
            'display_name', result.display_name
        ) ORDER BY lower(result.character_name), lower(result.display_name)),
        '[]'::jsonb
    )
    INTO v_results
    FROM (
        SELECT DISTINCT ON (character.user_id)
            character.user_id,
            character.character_name,
            COALESCE(profile.display_name, 'Jogador') AS display_name
        FROM public.characters AS character
        JOIN public.game_system_memberships AS membership
          ON membership.user_id = character.user_id
         AND membership.game_system_id = character.game_system_id
         AND membership.role IN ('user', 'mod')
        LEFT JOIN public.user_profiles AS profile ON profile.user_id = character.user_id
        WHERE character.game_system_id = p_game_system_id
          AND character.status = 'active'
          AND position(lower(btrim(p_query)) IN lower(character.character_name)) > 0
        ORDER BY character.user_id, lower(character.character_name)
        LIMIT 10
    ) AS result;

    RETURN jsonb_build_object('status', 'ok', 'results', v_results);
END;
$function$;
REVOKE ALL ON FUNCTION private._search_system_members_by_character_name(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._search_system_members_by_character_name(UUID, TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.search_system_members_by_character_name(
    p_game_system_id UUID,
    p_query TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._search_system_members_by_character_name($1, $2);
$function$;
REVOKE ALL ON FUNCTION public.search_system_members_by_character_name(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_system_members_by_character_name(UUID, TEXT)
    TO authenticated;

COMMIT;
