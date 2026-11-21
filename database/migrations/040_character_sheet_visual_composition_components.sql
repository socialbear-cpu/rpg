BEGIN;

ALTER FUNCTION private.is_valid_character_sheet_definition(JSONB)
    RENAME TO is_valid_character_sheet_definition_before_visual_components;

CREATE FUNCTION private.is_valid_character_sheet_definition(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_step JSONB;
    v_component JSONB;
    v_normalized_step JSONB;
    v_normalized_components JSONB;
    v_normalized_steps JSONB := '[]'::JSONB;
    v_composition_key TEXT;
    v_seen_compositions TEXT[];
    v_component_count INTEGER := 0;
BEGIN
    IF p_definition IS NULL
       OR pg_catalog.jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(p_definition->'steps') IS DISTINCT FROM 'array' THEN
        RETURN FALSE;
    END IF;

    FOR v_step IN
        SELECT value FROM pg_catalog.jsonb_array_elements(p_definition->'steps') AS entry(value)
    LOOP
        v_normalized_step := v_step;
        IF pg_catalog.jsonb_typeof(v_step) = 'object'
           AND pg_catalog.jsonb_typeof(v_step->'components') = 'array' THEN
            v_normalized_components := '[]'::JSONB;
            v_seen_compositions := ARRAY[]::TEXT[];
            FOR v_component IN
                SELECT value FROM pg_catalog.jsonb_array_elements(v_step->'components') AS entry(value)
            LOOP
                v_component_count := v_component_count + 1;
                IF v_component->>'type' = 'visual_composition' THEN
                    IF pg_catalog.jsonb_typeof(v_component) IS DISTINCT FROM 'object'
                       OR NOT (v_component ?& ARRAY['key', 'label', 'type', 'required', 'position', 'width', 'show_on_card', 'composition_key'])
                       OR (v_component - ARRAY['key', 'label', 'type', 'required', 'position', 'width', 'show_on_card', 'composition_key']) <> '{}'::JSONB
                       OR pg_catalog.jsonb_typeof(v_component->'composition_key') IS DISTINCT FROM 'string' THEN
                        RETURN FALSE;
                    END IF;
                    v_composition_key := v_component->>'composition_key';
                    IF v_composition_key !~ '^[a-z][a-z0-9_]{0,39}$'
                       OR v_composition_key = ANY(v_seen_compositions)
                       OR pg_catalog.jsonb_typeof(v_step->'elements') IS DISTINCT FROM 'array'
                       OR NOT EXISTS (
                           SELECT 1
                           FROM pg_catalog.jsonb_array_elements(v_step->'elements') AS element(value)
                           WHERE COALESCE(element.value->>'composition_key', 'composition_1') = v_composition_key
                       ) THEN
                        RETURN FALSE;
                    END IF;
                    v_seen_compositions := pg_catalog.array_append(v_seen_compositions, v_composition_key);
                    v_component := (v_component - 'composition_key') || '{"type":"short_text"}'::JSONB;
                END IF;
                v_normalized_components := v_normalized_components || pg_catalog.jsonb_build_array(v_component);
            END LOOP;
            v_normalized_step := pg_catalog.jsonb_set(v_step, '{components}', v_normalized_components, FALSE);
        END IF;
        v_normalized_steps := v_normalized_steps || pg_catalog.jsonb_build_array(v_normalized_step);
    END LOOP;

    IF v_component_count > 50 THEN
        RETURN FALSE;
    END IF;

    RETURN private.is_valid_character_sheet_definition_before_visual_components(
        pg_catalog.jsonb_set(p_definition, '{steps}', v_normalized_steps, FALSE)
    );
END;
$function$;

REVOKE ALL ON FUNCTION private.is_valid_character_sheet_definition(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_valid_character_sheet_definition(JSONB) TO authenticated;

ALTER TABLE public.game_system_character_sheets
    DROP CONSTRAINT game_system_character_sheets_definition_check;
ALTER TABLE public.game_system_character_sheets
    ADD CONSTRAINT game_system_character_sheets_definition_check
    CHECK (private.is_valid_character_sheet_definition(definition));

COMMENT ON FUNCTION private.is_valid_character_sheet_definition(JSONB) IS
    'Validates character sheet fields, conditional choices, and visual composition components.';

COMMIT;
