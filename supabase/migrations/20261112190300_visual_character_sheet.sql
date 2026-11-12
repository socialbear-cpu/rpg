-- Version character sheets into ordered stages and visual components.
BEGIN;

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
    v_key TEXT;
    v_type TEXT;
    v_position_text TEXT;
    v_position INTEGER;
    v_seen_step_keys TEXT[] := ARRAY[]::TEXT[];
    v_seen_step_positions INTEGER[] := ARRAY[]::INTEGER[];
    v_seen_component_keys TEXT[] := ARRAY[]::TEXT[];
    v_seen_component_positions INTEGER[];
    v_seen_options TEXT[];
    v_total_components INTEGER := 0;
    v_option_label TEXT;
    v_image_url TEXT;
BEGIN
    IF p_definition IS NULL
       OR pg_catalog.jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
       OR NOT (p_definition ?& ARRAY['version', 'steps'])
       OR (p_definition - 'version' - 'steps') <> '{}'::JSONB
       OR p_definition->'version' <> '1'::JSONB
       OR pg_catalog.jsonb_typeof(p_definition->'steps') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_definition->'steps') < 1
       OR pg_catalog.jsonb_array_length(p_definition->'steps') > 20 THEN
        RETURN FALSE;
    END IF;

    FOR v_step IN SELECT value FROM pg_catalog.jsonb_array_elements(p_definition->'steps') AS entry(value)
    LOOP
        IF pg_catalog.jsonb_typeof(v_step) IS DISTINCT FROM 'object'
           OR NOT (v_step ?& ARRAY['key', 'label', 'position', 'components'])
           OR (v_step - 'key' - 'label' - 'position' - 'components') <> '{}'::JSONB
           OR pg_catalog.jsonb_typeof(v_step->'key') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_step->'label') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_step->'position') IS DISTINCT FROM 'number'
           OR pg_catalog.jsonb_typeof(v_step->'components') IS DISTINCT FROM 'array'
           OR pg_catalog.jsonb_array_length(v_step->'components') > 50 THEN
            RETURN FALSE;
        END IF;

        v_key := v_step->>'key';
        v_position_text := v_step->>'position';
        IF v_key !~ '^[a-z][a-z0-9_]{0,39}$'
           OR pg_catalog.btrim(v_step->>'label') = ''
           OR pg_catalog.char_length(v_step->>'label') > 80
           OR v_position_text !~ '^(0|[1-9][0-9]*)$'
           OR pg_catalog.char_length(v_position_text) > 2 THEN
            RETURN FALSE;
        END IF;
        v_position := v_position_text::INTEGER;
        IF v_position > 19 OR v_key = ANY(v_seen_step_keys) OR v_position = ANY(v_seen_step_positions) THEN
            RETURN FALSE;
        END IF;
        v_seen_step_keys := pg_catalog.array_append(v_seen_step_keys, v_key);
        v_seen_step_positions := pg_catalog.array_append(v_seen_step_positions, v_position);
        v_seen_component_positions := ARRAY[]::INTEGER[];

        FOR v_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v_step->'components') AS entry(value)
        LOOP
            IF pg_catalog.jsonb_typeof(v_component) IS DISTINCT FROM 'object'
               OR NOT (v_component ?& ARRAY['key', 'label', 'type', 'required', 'position', 'width', 'show_on_card'])
               OR pg_catalog.jsonb_typeof(v_component->'key') IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(v_component->'label') IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(v_component->'type') IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(v_component->'required') IS DISTINCT FROM 'boolean'
               OR pg_catalog.jsonb_typeof(v_component->'position') IS DISTINCT FROM 'number'
               OR pg_catalog.jsonb_typeof(v_component->'width') IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(v_component->'show_on_card') IS DISTINCT FROM 'boolean' THEN
                RETURN FALSE;
            END IF;

            v_key := v_component->>'key';
            v_type := v_component->>'type';
            v_position_text := v_component->>'position';
            IF v_key !~ '^[a-z][a-z0-9_]{0,39}$'
               OR pg_catalog.btrim(v_component->>'label') = ''
               OR pg_catalog.char_length(v_component->>'label') > 80
               OR v_type NOT IN ('short_text', 'long_text', 'number', 'single_select')
               OR v_component->>'width' NOT IN ('full', 'half', 'third')
               OR v_position_text !~ '^(0|[1-9][0-9]*)$'
               OR pg_catalog.char_length(v_position_text) > 2 THEN
                RETURN FALSE;
            END IF;
            v_position := v_position_text::INTEGER;
            IF v_position > 49
               OR v_key = ANY(v_seen_component_keys)
               OR v_position = ANY(v_seen_component_positions) THEN
                RETURN FALSE;
            END IF;

            IF v_type = 'single_select' THEN
                IF NOT (v_component ?& ARRAY['presentation', 'options'])
                   OR (v_component - 'key' - 'label' - 'type' - 'required' - 'position' - 'width' - 'show_on_card' - 'presentation' - 'options') <> '{}'::JSONB
                   OR pg_catalog.jsonb_typeof(v_component->'presentation') IS DISTINCT FROM 'string'
                   OR v_component->>'presentation' NOT IN ('select', 'cards')
                   OR pg_catalog.jsonb_typeof(v_component->'options') IS DISTINCT FROM 'array'
                   OR pg_catalog.jsonb_array_length(v_component->'options') < 1
                   OR pg_catalog.jsonb_array_length(v_component->'options') > 50 THEN
                    RETURN FALSE;
                END IF;

                v_seen_options := ARRAY[]::TEXT[];
                FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_component->'options') AS option(value)
                LOOP
                    IF pg_catalog.jsonb_typeof(v_option) IS DISTINCT FROM 'object'
                       OR NOT (v_option ? 'label')
                       OR (v_option - 'label' - 'image_url' - 'description') <> '{}'::JSONB
                       OR pg_catalog.jsonb_typeof(v_option->'label') IS DISTINCT FROM 'string' THEN
                        RETURN FALSE;
                    END IF;

                    v_option_label := pg_catalog.btrim(v_option->>'label');
                    IF v_option_label = ''
                       OR pg_catalog.char_length(v_option_label) > 80
                       OR v_option_label = ANY(v_seen_options) THEN
                        RETURN FALSE;
                    END IF;
                    v_seen_options := pg_catalog.array_append(v_seen_options, v_option_label);

                    IF v_option ? 'description' AND (
                        pg_catalog.jsonb_typeof(v_option->'description') IS DISTINCT FROM 'string'
                        OR pg_catalog.char_length(v_option->>'description') > 500
                    ) THEN
                        RETURN FALSE;
                    END IF;

                    IF v_option ? 'image_url' THEN
                        IF pg_catalog.jsonb_typeof(v_option->'image_url') IS DISTINCT FROM 'string' THEN
                            RETURN FALSE;
                        END IF;
                        v_image_url := v_option->>'image_url';
                        IF v_image_url = '' OR pg_catalog.char_length(v_image_url) > 2048
                           OR v_image_url !~* '^https://[^[:space:]/?#]+([/?#][^[:space:]]*)?$' THEN
                            RETURN FALSE;
                        END IF;
                    END IF;
                END LOOP;
            ELSIF v_component ? 'options' OR v_component ? 'presentation' THEN
                RETURN FALSE;
            ELSIF (v_component - 'key' - 'label' - 'type' - 'required' - 'position' - 'width' - 'show_on_card') <> '{}'::JSONB THEN
                RETURN FALSE;
            END IF;

            v_seen_component_keys := pg_catalog.array_append(v_seen_component_keys, v_key);
            v_seen_component_positions := pg_catalog.array_append(v_seen_component_positions, v_position);
            v_total_components := v_total_components + 1;
        END LOOP;
    END LOOP;

    RETURN v_total_components <= 50;
END;
$function$;

REVOKE ALL ON FUNCTION private.is_valid_character_sheet_definition(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_valid_character_sheet_definition(JSONB) TO authenticated;

ALTER TABLE public.game_system_character_sheets
    DROP CONSTRAINT game_system_character_sheets_fields_check;

UPDATE public.game_system_character_sheets AS sheet
SET fields = pg_catalog.jsonb_build_object(
    'version', 1,
    'steps', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'key', 'step_1',
        'label', 'Etapa 1',
        'position', 0,
        'components', COALESCE((
            SELECT pg_catalog.jsonb_agg(
                CASE WHEN legacy_field.value->>'type' = 'single_select' THEN
                    pg_catalog.jsonb_build_object(
                        'key', legacy_field.value->>'key',
                        'label', legacy_field.value->>'label',
                        'type', legacy_field.value->>'type',
                        'required', legacy_field.value->'required',
                        'position', legacy_field.value->'position',
                        'width', 'full',
                        'show_on_card', legacy_field.value->'show_on_card',
                        'presentation', 'select',
                        'options', (
                            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('label', option.value))
                            FROM pg_catalog.jsonb_array_elements(legacy_field.value->'options') AS option(value)
                        )
                    )
                ELSE
                    pg_catalog.jsonb_build_object(
                        'key', legacy_field.value->>'key',
                        'label', legacy_field.value->>'label',
                        'type', legacy_field.value->>'type',
                        'required', legacy_field.value->'required',
                        'position', legacy_field.value->'position',
                        'width', 'full',
                        'show_on_card', legacy_field.value->'show_on_card'
                    )
                END
                ORDER BY (legacy_field.value->>'position')::INTEGER
            )
            FROM pg_catalog.jsonb_array_elements(sheet.fields) AS legacy_field(value)
        ), '[]'::JSONB)
    ))
)
WHERE pg_catalog.jsonb_typeof(sheet.fields) = 'array';

ALTER TABLE public.game_system_character_sheets RENAME COLUMN fields TO definition;
ALTER TABLE public.game_system_character_sheets
    ALTER COLUMN definition SET DEFAULT '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::JSONB;
ALTER TABLE public.game_system_character_sheets
    ADD CONSTRAINT game_system_character_sheets_definition_check
    CHECK (private.is_valid_character_sheet_definition(definition));
COMMENT ON TABLE public.game_system_character_sheets IS
    'Versioned character-sheet definitions with ordered stages and components for each RPG system.';

GRANT UPDATE (definition) ON TABLE public.game_system_character_sheets TO authenticated;
CREATE POLICY game_system_character_sheets_update_owner
    ON public.game_system_character_sheets FOR UPDATE TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));

DROP FUNCTION public.create_game_system_with_sheet(TEXT, TEXT, JSONB);
CREATE FUNCTION public.create_game_system_with_sheet(
    p_name TEXT,
    p_description TEXT,
    p_fields JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_system_id UUID := pg_catalog.gen_random_uuid();
    v_name TEXT := pg_catalog.btrim(p_name);
    v_slug_base TEXT;
    v_slug TEXT;
    v_description TEXT := NULLIF(pg_catalog.btrim(p_description), '');
    v_system public.game_systems%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;
    IF v_name IS NULL OR v_name = '' OR pg_catalog.char_length(v_name) > 80
       OR (v_description IS NOT NULL AND pg_catalog.char_length(v_description) > 500)
       OR NOT private.is_valid_character_sheet_definition(p_fields) THEN
        RAISE EXCEPTION 'Invalid game system or character sheet' USING ERRCODE = '22023';
    END IF;

    v_slug_base := pg_catalog.btrim(
        pg_catalog.regexp_replace(pg_catalog.lower(v_name), '[^a-z0-9]+', '-', 'g'),
        '-'
    );
    IF v_slug_base = '' THEN
        v_slug_base := 'system';
    END IF;
    v_slug := v_slug_base || '-' || pg_catalog.left(v_system_id::TEXT, 8);

    INSERT INTO public.game_systems (id, slug, name, description, owner_user_id)
    VALUES (v_system_id, v_slug, v_name, v_description, v_user_id)
    RETURNING * INTO v_system;

    INSERT INTO public.game_system_character_sheets (game_system_id, definition)
    VALUES (v_system.id, p_fields);

    RETURN pg_catalog.jsonb_build_object(
        'status', 'created',
        'system', pg_catalog.jsonb_build_object(
            'id', v_system.id,
            'slug', v_system.slug,
            'name', v_system.name,
            'description', v_system.description
        ),
        'definition', p_fields
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_game_system_with_sheet(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_game_system_with_sheet(TEXT, TEXT, JSONB) TO authenticated;

CREATE FUNCTION public.update_game_system_character_sheet(
    p_system_id UUID,
    p_definition JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_updated_system_id UUID;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;
    IF NOT private.is_valid_character_sheet_definition(p_definition) THEN
        RAISE EXCEPTION 'Invalid character sheet definition' USING ERRCODE = '22023';
    END IF;

    UPDATE public.game_system_character_sheets
       SET definition = p_definition
     WHERE game_system_id = p_system_id
     RETURNING game_system_id INTO v_updated_system_id;

    IF v_updated_system_id IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.game_systems WHERE id = p_system_id) THEN
            RAISE EXCEPTION 'Only the system owner can update its character sheet' USING ERRCODE = '42501';
        END IF;
        RAISE EXCEPTION 'Game system character sheet not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'game_system_id', v_updated_system_id,
        'definition', p_definition
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_game_system_character_sheet(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_game_system_character_sheet(UUID, JSONB) TO authenticated;

COMMIT;
