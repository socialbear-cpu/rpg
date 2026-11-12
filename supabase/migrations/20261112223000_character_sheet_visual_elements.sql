BEGIN;

ALTER FUNCTION private.is_valid_character_sheet_definition(JSONB)
    RENAME TO is_valid_character_sheet_definition_without_elements;

CREATE FUNCTION private.is_valid_character_sheet_definition(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_step JSONB;
    v_element JSONB;
    v_legacy_steps JSONB;
    v_legacy_definition JSONB;
    v_key TEXT;
    v_type TEXT;
    v_text TEXT;
    v_image_url TEXT;
    v_seen_element_keys TEXT[] := ARRAY[]::TEXT[];
    v_total_elements INTEGER := 0;
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

    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            CASE
                WHEN pg_catalog.jsonb_typeof(step) = 'object' THEN step - 'elements'
                ELSE step
            END
            ORDER BY ordinal
        ),
        '[]'::JSONB
    )
    INTO v_legacy_steps
    FROM pg_catalog.jsonb_array_elements(p_definition->'steps') WITH ORDINALITY AS entry(step, ordinal);

    v_legacy_definition := pg_catalog.jsonb_set(p_definition, '{steps}', v_legacy_steps, FALSE);
    IF NOT private.is_valid_character_sheet_definition_without_elements(v_legacy_definition) THEN
        RETURN FALSE;
    END IF;

    FOR v_step IN
        SELECT value FROM pg_catalog.jsonb_array_elements(p_definition->'steps') AS entry(value)
    LOOP
        IF NOT (v_step ? 'elements') THEN
            CONTINUE;
        END IF;
        IF pg_catalog.jsonb_typeof(v_step->'elements') IS DISTINCT FROM 'array'
           OR pg_catalog.jsonb_array_length(v_step->'elements') > 50 THEN
            RETURN FALSE;
        END IF;

        FOR v_element IN
            SELECT value FROM pg_catalog.jsonb_array_elements(v_step->'elements') AS entry(value)
        LOOP
            IF pg_catalog.jsonb_typeof(v_element) IS DISTINCT FROM 'object'
               OR NOT (v_element ?& ARRAY['key', 'type', 'x', 'y', 'width', 'height', 'rotation'])
               OR pg_catalog.jsonb_typeof(v_element->'key') IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(v_element->'type') IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(v_element->'x') IS DISTINCT FROM 'number'
               OR pg_catalog.jsonb_typeof(v_element->'y') IS DISTINCT FROM 'number'
               OR pg_catalog.jsonb_typeof(v_element->'width') IS DISTINCT FROM 'number'
               OR pg_catalog.jsonb_typeof(v_element->'height') IS DISTINCT FROM 'number'
               OR pg_catalog.jsonb_typeof(v_element->'rotation') IS DISTINCT FROM 'number' THEN
                RETURN FALSE;
            END IF;

            v_key := v_element->>'key';
            v_type := v_element->>'type';
            v_x := (v_element->>'x')::NUMERIC;
            v_y := (v_element->>'y')::NUMERIC;
            v_width := (v_element->>'width')::NUMERIC;
            v_height := (v_element->>'height')::NUMERIC;
            v_rotation := (v_element->>'rotation')::NUMERIC;

            IF v_key !~ '^[a-z][a-z0-9_]{0,39}$'
               OR v_key = ANY(v_seen_element_keys)
               OR v_x < 0 OR v_x > 100
               OR v_y < 0 OR v_y > 100
               OR v_width < 1 OR v_width > 100
               OR v_height < 1 OR v_height > 100
               OR v_x + v_width > 100
               OR v_y + v_height > 100
               OR v_rotation < -360 OR v_rotation > 360 THEN
                RETURN FALSE;
            END IF;

            IF v_type = 'text' THEN
                IF NOT (v_element ? 'text')
                   OR pg_catalog.jsonb_typeof(v_element->'text') IS DISTINCT FROM 'string'
                   OR (v_element - 'key' - 'type' - 'x' - 'y' - 'width' - 'height' - 'rotation' - 'text') <> '{}'::JSONB THEN
                    RETURN FALSE;
                END IF;
                v_text := v_element->>'text';
                IF pg_catalog.btrim(v_text) = '' OR pg_catalog.char_length(v_text) > 500 THEN
                    RETURN FALSE;
                END IF;
            ELSIF v_type = 'image' THEN
                IF NOT (v_element ? 'image_url')
                   OR pg_catalog.jsonb_typeof(v_element->'image_url') IS DISTINCT FROM 'string'
                   OR (v_element - 'key' - 'type' - 'x' - 'y' - 'width' - 'height' - 'rotation' - 'image_url' - 'description') <> '{}'::JSONB THEN
                    RETURN FALSE;
                END IF;
                IF v_element ? 'description' AND (
                    pg_catalog.jsonb_typeof(v_element->'description') IS DISTINCT FROM 'string'
                    OR pg_catalog.char_length(v_element->>'description') > 500
                ) THEN
                    RETURN FALSE;
                END IF;
                v_image_url := v_element->>'image_url';
                IF v_image_url = ''
                   OR pg_catalog.char_length(v_image_url) > 2048
                   OR v_image_url !~* '^https://[^[:space:]/?#]+([/?#][^[:space:]]*)?$' THEN
                    RETURN FALSE;
                END IF;
            ELSE
                RETURN FALSE;
            END IF;

            v_seen_element_keys := pg_catalog.array_append(v_seen_element_keys, v_key);
            v_total_elements := v_total_elements + 1;
        END LOOP;
    END LOOP;

    RETURN v_total_elements <= 50;
END;
$function$;

GRANT EXECUTE ON FUNCTION private.is_valid_character_sheet_definition(JSONB) TO authenticated;

ALTER TABLE public.game_system_character_sheets
    DROP CONSTRAINT game_system_character_sheets_definition_check;
ALTER TABLE public.game_system_character_sheets
    ADD CONSTRAINT game_system_character_sheets_definition_check
    CHECK (private.is_valid_character_sheet_definition(definition));

COMMENT ON FUNCTION private.is_valid_character_sheet_definition(JSONB) IS
    'Validates character sheet components and positioned text/image elements.';

COMMIT;
