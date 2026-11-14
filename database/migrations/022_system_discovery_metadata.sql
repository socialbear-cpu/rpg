BEGIN;

CREATE TABLE public.game_system_tag_catalog (
    slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{0,39}$'),
    label TEXT NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE public.game_system_tag_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_system_tag_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.game_system_tag_catalog TO authenticated;
CREATE POLICY game_system_tag_catalog_read
    ON public.game_system_tag_catalog FOR SELECT TO authenticated
    USING (TRUE);

INSERT INTO public.game_system_tag_catalog (slug, label, sort_order) VALUES
    ('fantasia', 'Fantasia', 1),
    ('fantasia-sombria', 'Fantasia sombria', 2),
    ('ficcao-cientifica', 'Ficção científica', 3),
    ('terror', 'Terror', 4),
    ('suspense', 'Suspense', 5),
    ('misterio', 'Mistério', 6),
    ('investigacao', 'Investigação', 7),
    ('aventura', 'Aventura', 8),
    ('medieval', 'Medieval', 9),
    ('futurista', 'Futurista', 10),
    ('pos-apocaliptico', 'Pós-apocalíptico', 11),
    ('sobrenatural', 'Sobrenatural', 12),
    ('mitologia', 'Mitologia', 13),
    ('drama', 'Drama', 14),
    ('comedia', 'Comédia', 15),
    ('romance', 'Romance', 16),
    ('acao', 'Ação', 17),
    ('sobrevivencia', 'Sobrevivência', 18),
    ('cyberpunk', 'Cyberpunk', 19),
    ('steampunk', 'Steampunk', 20);

ALTER TABLE public.game_systems
    ADD COLUMN cover_image_path TEXT,
    ADD COLUMN cover_focus_x SMALLINT NOT NULL DEFAULT 50 CHECK (cover_focus_x BETWEEN 0 AND 100),
    ADD COLUMN cover_focus_y SMALLINT NOT NULL DEFAULT 50 CHECK (cover_focus_y BETWEEN 0 AND 100),
    ADD COLUMN tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN play_mode TEXT NOT NULL DEFAULT 'text' CHECK (play_mode IN ('text', 'voice')),
    ADD CONSTRAINT game_systems_cover_path_check CHECK (
        cover_image_path IS NULL
        OR (
            cover_image_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
            AND split_part(cover_image_path, '/', 1) = id::TEXT
        )
    );
CREATE INDEX game_systems_tags_gin_idx ON public.game_systems USING GIN (tags);

CREATE OR REPLACE FUNCTION private._is_valid_game_system_tags(p_tags TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF p_tags IS NULL OR cardinality(p_tags) > 5 THEN
        RETURN FALSE;
    END IF;
    IF cardinality(p_tags) <> (SELECT count(DISTINCT tag) FROM unnest(p_tags) AS input(tag)) THEN
        RETURN FALSE;
    END IF;
    RETURN NOT EXISTS (
        SELECT 1
        FROM unnest(p_tags) AS input(tag)
        LEFT JOIN public.game_system_tag_catalog AS catalog
            ON catalog.slug = input.tag AND catalog.is_active
        WHERE catalog.slug IS NULL
    );
END;
$function$;
REVOKE ALL ON FUNCTION private._is_valid_game_system_tags(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._is_valid_game_system_tags(TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION private._validate_game_system_tags_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF NOT private._is_valid_game_system_tags(NEW.tags) THEN
        RAISE EXCEPTION 'Invalid game system tags' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private._validate_game_system_tags_trigger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS game_systems_validate_tags ON public.game_systems;
CREATE TRIGGER game_systems_validate_tags
    BEFORE INSERT OR UPDATE OF tags ON public.game_systems
    FOR EACH ROW EXECUTE FUNCTION private._validate_game_system_tags_trigger();

CREATE OR REPLACE FUNCTION private._update_game_system_access_settings(
    p_system_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_is_public BOOLEAN,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_system public.game_systems%ROWTYPE;
BEGIN
    IF NOT private.is_platform_admin()
       AND NOT private.has_system_role(p_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner', 'system', NULL);
    END IF;

    SELECT * INTO v_system
    FROM public.game_systems
    WHERE id = p_system_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'system', NULL);
    END IF;
    IF NOT p_is_public AND v_system.access_password_hash IS NULL AND COALESCE(p_password, '') = '' THEN
        RETURN jsonb_build_object('status', 'password_required', 'system', NULL);
    END IF;
    IF COALESCE(p_password, '') <> '' AND length(p_password) < 8 THEN
        RETURN jsonb_build_object('status', 'password_too_short', 'system', NULL);
    END IF;
    IF octet_length(COALESCE(p_password, '')) > 72 THEN
        RETURN jsonb_build_object('status', 'password_too_long', 'system', NULL);
    END IF;

    UPDATE public.game_systems
    SET name = p_name,
        description = p_description,
        is_public = p_is_public,
        access_password_hash = CASE
            WHEN p_is_public THEN NULL
            WHEN COALESCE(p_password, '') <> '' THEN extensions.crypt(p_password, extensions.gen_salt('bf', 12))
            ELSE v_system.access_password_hash
        END,
        updated_at = now()
    WHERE id = p_system_id
    RETURNING * INTO v_system;

    RETURN jsonb_build_object(
        'status', 'updated',
        'system', jsonb_build_object(
            'id', v_system.id,
            'slug', v_system.slug,
            'name', v_system.name,
            'description', v_system.description,
            'is_public', v_system.is_public
        )
    );
END;
$function$;

CREATE FUNCTION public.create_game_system_with_metadata(
    p_name TEXT,
    p_description TEXT,
    p_fields JSONB,
    p_play_mode TEXT,
    p_tags TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_created JSONB;
    v_system_id UUID;
    v_system public.game_systems%ROWTYPE;
BEGIN
    IF p_play_mode IS NULL OR p_play_mode NOT IN ('text', 'voice') THEN
        RAISE EXCEPTION 'Invalid game system play mode' USING ERRCODE = '22023';
    END IF;
    IF NOT private._is_valid_game_system_tags(p_tags) THEN
        RAISE EXCEPTION 'Invalid game system tags' USING ERRCODE = '22023';
    END IF;

    v_created := public.create_game_system_with_sheet(p_name, p_description, p_fields);
    v_system_id := (v_created->'system'->>'id')::UUID;
    UPDATE public.game_systems
    SET play_mode = p_play_mode, tags = p_tags
    WHERE id = v_system_id
    RETURNING * INTO v_system;

    RETURN jsonb_build_object(
        'status', 'created',
        'system', jsonb_build_object(
            'id', v_system.id,
            'slug', v_system.slug,
            'name', v_system.name,
            'description', v_system.description,
            'is_public', v_system.is_public,
            'cover_image_path', v_system.cover_image_path,
            'cover_focus_x', v_system.cover_focus_x,
            'cover_focus_y', v_system.cover_focus_y,
            'tags', to_jsonb(v_system.tags),
            'play_mode', v_system.play_mode
        ),
        'definition', p_fields
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.create_game_system_with_metadata(TEXT, TEXT, JSONB, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_game_system_with_metadata(TEXT, TEXT, JSONB, TEXT, TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.create_game_system_with_sheet(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_game_system_profile(
    p_system_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_is_public BOOLEAN,
    p_password TEXT,
    p_play_mode TEXT,
    p_tags TEXT[],
    p_cover_image_path TEXT,
    p_cover_focus_x SMALLINT,
    p_cover_focus_y SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_access_result JSONB;
    v_system public.game_systems%ROWTYPE;
BEGIN
    IF p_play_mode IS NULL OR p_play_mode NOT IN ('text', 'voice')
       OR NOT private._is_valid_game_system_tags(p_tags)
       OR p_cover_focus_x IS NULL OR p_cover_focus_x NOT BETWEEN 0 AND 100
       OR p_cover_focus_y IS NULL OR p_cover_focus_y NOT BETWEEN 0 AND 100
       OR p_is_public IS NULL
       OR (
           p_cover_image_path IS NOT NULL
           AND (
               p_cover_image_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
               OR split_part(p_cover_image_path, '/', 1) <> p_system_id::TEXT
           )
       ) THEN
        RETURN jsonb_build_object('status', 'invalid_details', 'system', NULL);
    END IF;

    v_access_result := private._update_game_system_access_settings(
        p_system_id, p_name, p_description, p_is_public, p_password
    );
    IF v_access_result->>'status' <> 'updated' THEN
        RETURN v_access_result;
    END IF;

    UPDATE public.game_systems
    SET play_mode = p_play_mode,
        tags = p_tags,
        cover_image_path = p_cover_image_path,
        cover_focus_x = p_cover_focus_x,
        cover_focus_y = p_cover_focus_y
    WHERE id = p_system_id
    RETURNING * INTO v_system;

    RETURN jsonb_build_object(
        'status', 'updated',
        'system', jsonb_build_object(
            'id', v_system.id,
            'slug', v_system.slug,
            'name', v_system.name,
            'description', v_system.description,
            'is_public', v_system.is_public,
            'cover_image_path', v_system.cover_image_path,
            'cover_focus_x', v_system.cover_focus_x,
            'cover_focus_y', v_system.cover_focus_y,
            'tags', to_jsonb(v_system.tags),
            'play_mode', v_system.play_mode
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.update_game_system_profile(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT[], TEXT, SMALLINT, SMALLINT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_game_system_profile(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT[], TEXT, SMALLINT, SMALLINT)
    TO authenticated;

-- Keep the password hash private while exposing only public system metadata.
GRANT SELECT (cover_image_path, cover_focus_x, cover_focus_y, tags, play_mode)
    ON TABLE public.game_systems TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'game-system-covers',
    'game-system-covers',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION private._can_manage_game_system_cover(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_system_id TEXT := split_part(p_object_name, '/', 1);
BEGIN
    IF p_object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$' THEN
        RETURN FALSE;
    END IF;
    RETURN private.is_platform_admin()
        OR private.has_system_role(v_system_id::UUID, ARRAY['owner']);
END;
$function$;
REVOKE ALL ON FUNCTION private._can_manage_game_system_cover(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._can_manage_game_system_cover(TEXT) TO authenticated;

DROP POLICY IF EXISTS game_system_covers_read_manager ON storage.objects;
CREATE POLICY game_system_covers_read_manager
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'game-system-covers' AND private._can_manage_game_system_cover(name));
DROP POLICY IF EXISTS game_system_covers_insert_manager ON storage.objects;
CREATE POLICY game_system_covers_insert_manager
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'game-system-covers' AND private._can_manage_game_system_cover(name));
DROP POLICY IF EXISTS game_system_covers_update_manager ON storage.objects;
CREATE POLICY game_system_covers_update_manager
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'game-system-covers' AND private._can_manage_game_system_cover(name))
    WITH CHECK (bucket_id = 'game-system-covers' AND private._can_manage_game_system_cover(name));
DROP POLICY IF EXISTS game_system_covers_delete_manager ON storage.objects;
CREATE POLICY game_system_covers_delete_manager
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'game-system-covers' AND private._can_manage_game_system_cover(name));

COMMIT;
