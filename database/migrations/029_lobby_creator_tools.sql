BEGIN;

DROP POLICY campaigns_insert_own ON public.campaigns;
REVOKE INSERT ON TABLE public.campaigns FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.create_system_campaign_impl(
    p_game_system_id UUID,
    p_character_id UUID,
    p_name TEXT,
    p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_campaign_id UUID;
    v_created_at TIMESTAMPTZ;
    v_name TEXT := pg_catalog.regexp_replace(COALESCE(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
    v_description TEXT := pg_catalog.regexp_replace(COALESCE(p_description, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
BEGIN
    IF v_user_id IS NULL
       OR NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    IF char_length(v_name) NOT BETWEEN 1 AND 80
       OR char_length(v_description) > 2000 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;

    PERFORM 1
    FROM public.characters AS character
    WHERE character.id = p_character_id
      AND character.user_id = v_user_id
      AND character.game_system_id = p_game_system_id
      AND character.status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'character_not_found');
    END IF;

    INSERT INTO public.campaigns (game_system_id, owner_user_id, name, description)
    VALUES (p_game_system_id, v_user_id, v_name, NULLIF(v_description, ''))
    RETURNING id, created_at INTO v_campaign_id, v_created_at;

    INSERT INTO public.campaign_members (campaign_id, character_id, game_system_id, role)
    VALUES (v_campaign_id, p_character_id, p_game_system_id, 'game_master');

    RETURN jsonb_build_object(
        'status', 'created',
        'character_id', p_character_id,
        'campaign', jsonb_build_object(
            'id', v_campaign_id,
            'game_system_id', p_game_system_id,
            'name', v_name,
            'description', NULLIF(v_description, ''),
            'status', 'active',
            'created_at', v_created_at
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION private.create_system_campaign_impl(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_system_campaign_impl(UUID, UUID, TEXT, TEXT) TO authenticated;

CREATE FUNCTION public.create_system_campaign(
    p_game_system_id UUID,
    p_character_id UUID,
    p_name TEXT,
    p_description TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private.create_system_campaign_impl(
        p_game_system_id,
        p_character_id,
        p_name,
        p_description
    );
$function$;
REVOKE ALL ON FUNCTION public.create_system_campaign(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_system_campaign(UUID, UUID, TEXT, TEXT) TO authenticated;

ALTER TABLE public.game_system_events
    ADD COLUMN started_at TIMESTAMPTZ;
GRANT UPDATE (started_at, updated_at)
    ON TABLE public.game_system_events TO authenticated;

CREATE FUNCTION private.guard_system_event_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION 'A started system event cannot change its started_at timestamp'
            USING ERRCODE = '23514';
    END IF;

    IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL THEN
        NEW.started_at := clock_timestamp();
    END IF;

    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_system_event_started_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER game_system_events_guard_started_at
    BEFORE UPDATE OF started_at ON public.game_system_events
    FOR EACH ROW EXECUTE FUNCTION private.guard_system_event_started_at();

CREATE TABLE public.game_system_lobby_settings (
    game_system_id UUID PRIMARY KEY REFERENCES public.game_systems(id) ON DELETE CASCADE,
    section_order TEXT[] NOT NULL DEFAULT ARRAY[
        'system-presentation', 'matchmaking', 'store', 'campaign-chat', 'events', 'character-sheet'
    ],
    hidden_sections TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    welcome_title TEXT NOT NULL DEFAULT 'Bem-vindo à aventura',
    welcome_message TEXT NOT NULL DEFAULT 'Escolha onde sua próxima história começa.',
    accent_color TEXT NOT NULL DEFAULT '#8B5CF6',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT game_system_lobby_settings_section_order_check CHECK (
        array_ndims(section_order) = 1
        AND array_lower(section_order, 1) = 1
        AND cardinality(section_order) = 6
        AND section_order <@ ARRAY['system-presentation', 'matchmaking', 'store', 'campaign-chat', 'events', 'character-sheet']::TEXT[]
        AND ARRAY['system-presentation', 'matchmaking', 'store', 'campaign-chat', 'events', 'character-sheet']::TEXT[] <@ section_order
    ),
    CONSTRAINT game_system_lobby_settings_hidden_sections_check CHECK (
        hidden_sections <@ section_order
        AND (cardinality(hidden_sections) = 0 OR (array_ndims(hidden_sections) = 1 AND array_lower(hidden_sections, 1) = 1))
        AND cardinality(array_positions(hidden_sections, 'system-presentation')) <= 1
        AND cardinality(array_positions(hidden_sections, 'matchmaking')) <= 1
        AND cardinality(array_positions(hidden_sections, 'store')) <= 1
        AND cardinality(array_positions(hidden_sections, 'campaign-chat')) <= 1
        AND cardinality(array_positions(hidden_sections, 'events')) <= 1
        AND cardinality(array_positions(hidden_sections, 'character-sheet')) <= 1
    ),
    CHECK (welcome_title = pg_catalog.regexp_replace(welcome_title, '^[[:space:]]+|[[:space:]]+$', '', 'g')
        AND char_length(welcome_title) BETWEEN 1 AND 80),
    CHECK (welcome_message = pg_catalog.regexp_replace(welcome_message, '^[[:space:]]+|[[:space:]]+$', '', 'g')
        AND char_length(welcome_message) <= 240),
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

ALTER TABLE public.game_system_lobby_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_system_lobby_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.game_system_lobby_settings TO authenticated;

CREATE POLICY game_system_lobby_settings_read_members
    ON public.game_system_lobby_settings FOR SELECT TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner', 'mod', 'user']));
CREATE POLICY game_system_lobby_settings_insert_owner
    ON public.game_system_lobby_settings FOR INSERT TO authenticated
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));
CREATE POLICY game_system_lobby_settings_update_owner
    ON public.game_system_lobby_settings FOR UPDATE TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));

COMMIT;
