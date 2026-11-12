BEGIN;

ALTER FUNCTION private.is_valid_character_sheet_definition(JSONB)
    RENAME TO is_valid_character_sheet_definition_without_interactive_choices;

CREATE FUNCTION private.is_valid_character_sheet_condition(p_condition JSONB, p_prior_component_keys TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_rule JSONB;
    v_component_key TEXT;
    v_operator TEXT;
BEGIN
    IF p_condition IS NULL
       OR pg_catalog.jsonb_typeof(p_condition) IS DISTINCT FROM 'object' THEN
        RETURN FALSE;
    END IF;
    IF NOT (p_condition ?& ARRAY['logic', 'rules'])
       OR (p_condition - 'logic' - 'rules') <> '{}'::JSONB
       OR pg_catalog.jsonb_typeof(p_condition->'logic') IS DISTINCT FROM 'string'
       OR p_condition->>'logic' NOT IN ('all', 'any')
       OR pg_catalog.jsonb_typeof(p_condition->'rules') IS DISTINCT FROM 'array' THEN
        RETURN FALSE;
    END IF;
    IF pg_catalog.jsonb_array_length(p_condition->'rules') < 1
       OR pg_catalog.jsonb_array_length(p_condition->'rules') > 20 THEN
        RETURN FALSE;
    END IF;

    FOR v_rule IN
        SELECT value FROM pg_catalog.jsonb_array_elements(p_condition->'rules') AS entry(value)
    LOOP
        IF pg_catalog.jsonb_typeof(v_rule) IS DISTINCT FROM 'object' THEN
            RETURN FALSE;
        END IF;
        IF NOT (v_rule ?& ARRAY['component_key', 'operator'])
           OR (v_rule - 'component_key' - 'operator' - 'value') <> '{}'::JSONB
           OR pg_catalog.jsonb_typeof(v_rule->'component_key') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_rule->'operator') IS DISTINCT FROM 'string' THEN
            RETURN FALSE;
        END IF;

        v_component_key := v_rule->>'component_key';
        v_operator := v_rule->>'operator';
        IF v_component_key !~ '^[a-z][a-z0-9_]{0,39}$'
           OR NOT (v_component_key = ANY(p_prior_component_keys))
           OR v_operator NOT IN ('equals', 'not_equals', 'contains', 'not_contains', 'is_filled', 'is_empty') THEN
            RETURN FALSE;
        END IF;

        IF v_operator IN ('equals', 'not_equals', 'contains', 'not_contains') THEN
            IF NOT (v_rule ? 'value')
               OR pg_catalog.jsonb_typeof(v_rule->'value') IS DISTINCT FROM 'string'
               OR pg_catalog.btrim(v_rule->>'value') = ''
               OR pg_catalog.char_length(v_rule->>'value') > 80 THEN
                RETURN FALSE;
            END IF;
        ELSIF v_rule ? 'value' THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION private.is_valid_character_sheet_condition(JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_valid_character_sheet_condition(JSONB, TEXT[]) TO authenticated;

CREATE FUNCTION private.is_valid_character_sheet_definition(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_step JSONB;
    v_component JSONB;
    v_option JSONB;
    v_normalized_step JSONB;
    v_normalized_component JSONB;
    v_normalized_option JSONB;
    v_normalized_options JSONB;
    v_normalized_components JSONB;
    v_normalized_steps JSONB := '[]'::JSONB;
    v_legacy_definition JSONB;
    v_prior_component_keys TEXT[] := ARRAY[]::TEXT[];
    v_seen_option_values TEXT[];
    v_option_value TEXT;
    v_has_layout BOOLEAN;
    v_has_complete_layout BOOLEAN;
    v_x NUMERIC;
    v_y NUMERIC;
    v_width NUMERIC;
    v_height NUMERIC;
    v_rotation NUMERIC;
BEGIN
    IF p_definition IS NULL
       OR pg_catalog.jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(p_definition->'steps') IS DISTINCT FROM 'array' THEN
        RETURN FALSE;
    END IF;

    FOR v_step IN
        SELECT value FROM pg_catalog.jsonb_array_elements(p_definition->'steps') AS entry(value)
    LOOP
        v_normalized_step := CASE
            WHEN pg_catalog.jsonb_typeof(v_step) = 'object' THEN v_step - 'condition'
            ELSE v_step
        END;
        IF pg_catalog.jsonb_typeof(v_step) = 'object'
           AND pg_catalog.jsonb_typeof(v_step->'components') = 'array' THEN
            v_normalized_components := '[]'::JSONB;
            FOR v_component IN
                SELECT value FROM pg_catalog.jsonb_array_elements(v_step->'components') AS entry(value)
            LOOP
                v_normalized_component := CASE
                    WHEN pg_catalog.jsonb_typeof(v_component) = 'object' THEN v_component - 'condition'
                    ELSE v_component
                END;
                IF pg_catalog.jsonb_typeof(v_component) = 'object'
                   AND v_component->>'type' = 'single_select'
                   AND pg_catalog.jsonb_typeof(v_component->'options') = 'array' THEN
                    v_normalized_options := '[]'::JSONB;
                    FOR v_option IN
                        SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'options') AS entry(value)
                    LOOP
                        v_normalized_option := CASE
                            WHEN pg_catalog.jsonb_typeof(v_option) = 'object' THEN v_option - 'value' - 'x' - 'y' - 'width' - 'height' - 'rotation' - 'condition'
                            ELSE v_option
                        END;
                        v_normalized_options := v_normalized_options || pg_catalog.jsonb_build_array(v_normalized_option);
                    END LOOP;
                    v_normalized_component := pg_catalog.jsonb_set(v_normalized_component - 'selection_mode', '{options}', v_normalized_options, FALSE);
                    IF v_component->>'presentation' = 'canvas' THEN
                        v_normalized_component := pg_catalog.jsonb_set(v_normalized_component, '{presentation}', '"cards"'::JSONB, FALSE);
                    END IF;
                END IF;
                v_normalized_components := v_normalized_components || pg_catalog.jsonb_build_array(v_normalized_component);
            END LOOP;
            v_normalized_step := pg_catalog.jsonb_set(v_normalized_step, '{components}', v_normalized_components, FALSE);
        END IF;
        v_normalized_steps := v_normalized_steps || pg_catalog.jsonb_build_array(v_normalized_step);
    END LOOP;

    v_legacy_definition := pg_catalog.jsonb_set(p_definition, '{steps}', v_normalized_steps, FALSE);
    IF NOT private.is_valid_character_sheet_definition_without_interactive_choices(v_legacy_definition) THEN
        RETURN FALSE;
    END IF;

    FOR v_step IN
        SELECT value
        FROM pg_catalog.jsonb_array_elements(p_definition->'steps') AS entry(value)
        ORDER BY (value->>'position')::INTEGER
    LOOP
        IF v_step ? 'condition'
           AND NOT private.is_valid_character_sheet_condition(v_step->'condition', v_prior_component_keys) THEN
            RETURN FALSE;
        END IF;

        FOR v_component IN
            SELECT value
            FROM pg_catalog.jsonb_array_elements(v_step->'components') AS entry(value)
            ORDER BY (value->>'position')::INTEGER
        LOOP
            IF v_component ? 'condition'
               AND NOT private.is_valid_character_sheet_condition(v_component->'condition', v_prior_component_keys) THEN
                RETURN FALSE;
            END IF;

            IF v_component->>'type' = 'single_select' THEN
                IF v_component ? 'selection_mode'
                   AND (
                       pg_catalog.jsonb_typeof(v_component->'selection_mode') IS DISTINCT FROM 'string'
                       OR v_component->>'selection_mode' NOT IN ('single', 'multiple')
                   ) THEN
                    RETURN FALSE;
                END IF;

                v_seen_option_values := ARRAY[]::TEXT[];
                FOR v_option IN
                    SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'options') AS entry(value)
                LOOP
                    IF v_option ? 'value' AND (
                        pg_catalog.jsonb_typeof(v_option->'value') IS DISTINCT FROM 'string'
                        OR pg_catalog.btrim(v_option->>'value') = ''
                        OR pg_catalog.char_length(v_option->>'value') > 80
                    ) THEN
                        RETURN FALSE;
                    END IF;
                    v_option_value := pg_catalog.btrim(COALESCE(v_option->>'value', v_option->>'label'));
                    IF v_option_value = ANY(v_seen_option_values) THEN
                        RETURN FALSE;
                    END IF;
                    v_seen_option_values := pg_catalog.array_append(v_seen_option_values, v_option_value);

                    v_has_layout := v_option ?| ARRAY['x', 'y', 'width', 'height', 'rotation'];
                    v_has_complete_layout := v_option ?& ARRAY['x', 'y', 'width', 'height', 'rotation'];
                    IF (v_component->>'presentation' = 'canvas' AND NOT v_has_complete_layout)
                       OR (v_has_layout AND NOT v_has_complete_layout) THEN
                        RETURN FALSE;
                    END IF;
                    IF v_has_complete_layout THEN
                        IF pg_catalog.jsonb_typeof(v_option->'x') IS DISTINCT FROM 'number'
                           OR pg_catalog.jsonb_typeof(v_option->'y') IS DISTINCT FROM 'number'
                           OR pg_catalog.jsonb_typeof(v_option->'width') IS DISTINCT FROM 'number'
                           OR pg_catalog.jsonb_typeof(v_option->'height') IS DISTINCT FROM 'number'
                           OR pg_catalog.jsonb_typeof(v_option->'rotation') IS DISTINCT FROM 'number' THEN
                            RETURN FALSE;
                        END IF;
                        v_x := (v_option->>'x')::NUMERIC;
                        v_y := (v_option->>'y')::NUMERIC;
                        v_width := (v_option->>'width')::NUMERIC;
                        v_height := (v_option->>'height')::NUMERIC;
                        v_rotation := (v_option->>'rotation')::NUMERIC;
                        IF v_x < 0 OR v_x > 100 OR v_y < 0 OR v_y > 100
                           OR v_width < 1 OR v_width > 100 OR v_height < 1 OR v_height > 100
                           OR v_x + v_width > 100 OR v_y + v_height > 100
                           OR v_rotation < -360 OR v_rotation > 360 THEN
                            RETURN FALSE;
                        END IF;
                    END IF;

                    IF v_option ? 'condition'
                       AND NOT private.is_valid_character_sheet_condition(v_option->'condition', v_prior_component_keys) THEN
                        RETURN FALSE;
                    END IF;
                END LOOP;
            END IF;

            v_prior_component_keys := pg_catalog.array_append(v_prior_component_keys, v_component->>'key');
        END LOOP;
    END LOOP;

    RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION private.is_valid_character_sheet_definition(JSONB) TO authenticated;

ALTER TABLE public.game_system_character_sheets
    DROP CONSTRAINT game_system_character_sheets_definition_check;
ALTER TABLE public.game_system_character_sheets
    ADD CONSTRAINT game_system_character_sheets_definition_check
    CHECK (private.is_valid_character_sheet_definition(definition));

COMMENT ON FUNCTION private.is_valid_character_sheet_definition(JSONB) IS
    'Validates character sheet components, interactive image choices, and conditional rules.';

COMMIT;
