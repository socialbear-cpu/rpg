BEGIN;

-- The API also persists layout_mode and composition_key, which the legacy
-- SQL validator predates. Normalize only those new properties for validation.
ALTER FUNCTION private.is_valid_character_sheet_definition(JSONB)
    RENAME TO is_valid_character_sheet_definition_without_layout_mode;

CREATE FUNCTION private._character_sheet_definition_without_composition_keys(p_definition JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT CASE WHEN pg_catalog.jsonb_typeof(p_definition->'steps') IS DISTINCT FROM 'array'
        THEN p_definition - 'layout_mode'
        ELSE pg_catalog.jsonb_set(
        p_definition - 'layout_mode',
        '{steps}',
        COALESCE((
            SELECT pg_catalog.jsonb_agg(CASE WHEN step ? 'elements' THEN pg_catalog.jsonb_set(
                step,
                '{elements}',
                COALESCE((SELECT pg_catalog.jsonb_agg(element - 'composition_key') FROM pg_catalog.jsonb_array_elements(step->'elements') AS item(element)), '[]'::JSONB),
                FALSE
            ) ELSE step END)
            FROM pg_catalog.jsonb_array_elements(p_definition->'steps') AS item(step)
        ), '[]'::JSONB),
        FALSE
    ) END;
$function$;

CREATE FUNCTION private.is_valid_character_sheet_definition(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT CASE
        WHEN p_definition IS NULL OR pg_catalog.jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN FALSE
        ELSE private.is_valid_character_sheet_definition_without_layout_mode(private._character_sheet_definition_without_composition_keys(p_definition))
    END;
$function$;

REVOKE ALL ON FUNCTION private.is_valid_character_sheet_definition(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_valid_character_sheet_definition(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION private._character_sheet_definition_without_composition_keys(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._character_sheet_definition_without_composition_keys(JSONB) TO authenticated;

COMMIT;
