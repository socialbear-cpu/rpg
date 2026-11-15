CREATE FUNCTION private.strip_character_sheet_conditions(p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
    v_result JSONB;
BEGIN
    CASE jsonb_typeof(p_value)
        WHEN 'object' THEN
            SELECT COALESCE(jsonb_object_agg(entry.key, private.strip_character_sheet_conditions(entry.value)), '{}'::JSONB)
            INTO v_result
            FROM jsonb_each(p_value) AS entry
            WHERE entry.key <> 'condition';
            RETURN v_result;
        WHEN 'array' THEN
            SELECT COALESCE(jsonb_agg(private.strip_character_sheet_conditions(entry.value) ORDER BY entry.ordinality), '[]'::JSONB)
            INTO v_result
            FROM jsonb_array_elements(p_value) WITH ORDINALITY AS entry(value, ordinality);
            RETURN v_result;
        ELSE
            RETURN p_value;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.strip_character_sheet_conditions(JSONB) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.strip_character_sheet_conditions(JSONB) TO authenticated, service_role;

UPDATE public.game_system_character_sheets
SET definition = private.strip_character_sheet_conditions(definition)
WHERE definition IS DISTINCT FROM private.strip_character_sheet_conditions(definition);

ALTER TABLE public.game_system_character_sheets
    ADD CONSTRAINT game_system_character_sheets_no_conditions_check
    CHECK (definition = private.strip_character_sheet_conditions(definition));
