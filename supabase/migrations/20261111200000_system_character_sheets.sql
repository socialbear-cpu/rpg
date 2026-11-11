-- Persist the character-sheet field definition for each RPG system.
BEGIN;

CREATE TABLE public.game_system_character_sheets (
    game_system_id UUID PRIMARY KEY REFERENCES public.game_systems(id) ON DELETE CASCADE,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.game_system_character_sheets IS
    'Ordered configurable character fields defined when a game system is created.';

ALTER TABLE public.game_system_character_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_system_character_sheets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.game_system_character_sheets TO authenticated;

CREATE POLICY game_system_character_sheets_read_available
    ON public.game_system_character_sheets FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.game_systems AS system
        WHERE system.id = game_system_id
          AND (system.is_active
               OR private.is_platform_admin()
               OR private.has_system_role(system.id, ARRAY['owner', 'mod', 'user']))
    ));

-- Existing systems receive the built-in name-only sheet.
INSERT INTO public.game_system_character_sheets (game_system_id, fields)
SELECT system.id, '[]'::jsonb
FROM public.game_systems AS system
ON CONFLICT (game_system_id) DO NOTHING;

-- System creation must go through the atomic RPC so a system cannot be saved
-- without its sheet definition.
REVOKE INSERT ON TABLE public.game_systems FROM authenticated;
DROP POLICY IF EXISTS game_systems_create_as_owner ON public.game_systems;

CREATE FUNCTION private.is_valid_character_sheet_fields(p_fields JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_field JSONB;
    v_option JSONB;
    v_key TEXT;
    v_type TEXT;
    v_position_text TEXT;
    v_position INTEGER;
    v_seen_keys TEXT[] := ARRAY[]::TEXT[];
    v_seen_positions INTEGER[] := ARRAY[]::INTEGER[];
    v_seen_options TEXT[];
BEGIN
    IF p_fields IS NULL
       OR pg_catalog.jsonb_typeof(p_fields) IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_fields) > 50 THEN
        RETURN FALSE;
    END IF;

    FOR v_field IN SELECT value FROM pg_catalog.jsonb_array_elements(p_fields) AS entry(value)
    LOOP
        IF pg_catalog.jsonb_typeof(v_field) IS DISTINCT FROM 'object'
           OR NOT (v_field ?& ARRAY['key', 'label', 'type', 'required', 'position', 'show_on_card'])
           OR EXISTS (
               SELECT 1
               FROM pg_catalog.jsonb_object_keys(v_field) AS field_key(name)
               WHERE field_key.name NOT IN ('key', 'label', 'type', 'required', 'position', 'show_on_card', 'options')
           ) THEN
            RETURN FALSE;
        END IF;

        IF pg_catalog.jsonb_typeof(v_field->'key') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_field->'label') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_field->'type') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_field->'required') IS DISTINCT FROM 'boolean'
           OR pg_catalog.jsonb_typeof(v_field->'show_on_card') IS DISTINCT FROM 'boolean'
           OR pg_catalog.jsonb_typeof(v_field->'position') IS DISTINCT FROM 'number' THEN
            RETURN FALSE;
        END IF;

        v_key := v_field->>'key';
        v_type := v_field->>'type';
        v_position_text := v_field->>'position';

        IF v_key !~ '^[a-z][a-z0-9_]{0,39}$'
           OR pg_catalog.btrim(v_field->>'label') = ''
           OR pg_catalog.char_length(v_field->>'label') > 80
           OR v_type NOT IN ('short_text', 'long_text', 'number', 'single_select')
           OR v_position_text !~ '^(0|[1-9][0-9]*)$'
           OR pg_catalog.char_length(v_position_text) > 2 THEN
            RETURN FALSE;
        END IF;

        v_position := v_position_text::INTEGER;
        IF v_position > 49 OR v_key = ANY(v_seen_keys) OR v_position = ANY(v_seen_positions) THEN
            RETURN FALSE;
        END IF;

        v_seen_keys := pg_catalog.array_append(v_seen_keys, v_key);
        v_seen_positions := pg_catalog.array_append(v_seen_positions, v_position);

        IF v_type = 'single_select' THEN
            IF NOT (v_field ? 'options')
               OR pg_catalog.jsonb_typeof(v_field->'options') IS DISTINCT FROM 'array'
               OR pg_catalog.jsonb_array_length(v_field->'options') < 1
               OR pg_catalog.jsonb_array_length(v_field->'options') > 50 THEN
                RETURN FALSE;
            END IF;

            v_seen_options := ARRAY[]::TEXT[];
            FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_field->'options') AS option(value)
            LOOP
                IF pg_catalog.jsonb_typeof(v_option) IS DISTINCT FROM 'string'
                   OR pg_catalog.btrim(v_option #>> '{}') = ''
                   OR pg_catalog.char_length(v_option #>> '{}') > 80
                   OR pg_catalog.btrim(v_option #>> '{}') = ANY(v_seen_options) THEN
                    RETURN FALSE;
                END IF;
                v_seen_options := pg_catalog.array_append(v_seen_options, pg_catalog.btrim(v_option #>> '{}'));
            END LOOP;
        ELSIF v_field ? 'options' THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION private.is_valid_character_sheet_fields(JSONB) FROM PUBLIC, anon, authenticated;

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
       OR NOT private.is_valid_character_sheet_fields(p_fields) THEN
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

    INSERT INTO public.game_system_character_sheets (game_system_id, fields)
    VALUES (v_system.id, p_fields);

    RETURN pg_catalog.jsonb_build_object(
        'status', 'created',
        'system', pg_catalog.jsonb_build_object(
            'id', v_system.id,
            'slug', v_system.slug,
            'name', v_system.name,
            'description', v_system.description
        ),
        'fields', p_fields
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_game_system_with_sheet(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_game_system_with_sheet(TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
