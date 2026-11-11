-- Per-system XP rules and an immutable, per-character XP ledger.
-- PostgreSQL 13+; only positive grants are stored. Event integrations use
-- the private grant function from their own transactional database functions.
BEGIN;

CREATE TABLE public.game_system_xp_settings (
    game_system_id UUID PRIMARY KEY REFERENCES public.game_systems(id) ON DELETE CASCADE,
    xp_per_level INTEGER NOT NULL DEFAULT 100
        CHECK (xp_per_level BETWEEN 1 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.game_system_xp_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('daily_login', 'mission', 'fight', 'custom')),
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    award_amount INTEGER NOT NULL DEFAULT 0 CHECK (award_amount BETWEEN 0 AND 1000000),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, game_system_id),
    CHECK (NOT is_enabled OR award_amount > 0)
);
CREATE UNIQUE INDEX game_system_xp_sources_builtin_uq
    ON public.game_system_xp_sources (game_system_id, source_type)
    WHERE source_type <> 'custom';
CREATE UNIQUE INDEX game_system_xp_sources_custom_name_uq
    ON public.game_system_xp_sources (game_system_id, lower(name))
    WHERE source_type = 'custom';

CREATE TABLE public.character_xp_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id UUID NOT NULL,
    character_id UUID NOT NULL,
    source_id UUID NOT NULL,
    source_type_snapshot TEXT NOT NULL CHECK (source_type_snapshot IN ('daily_login', 'mission', 'fight', 'custom')),
    source_name_snapshot TEXT NOT NULL CHECK (length(btrim(source_name_snapshot)) BETWEEN 1 AND 80),
    event_key TEXT NOT NULL CHECK (length(btrim(event_key)) BETWEEN 1 AND 200),
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (character_id, game_system_id)
        REFERENCES public.characters(id, game_system_id) ON DELETE CASCADE,
    FOREIGN KEY (source_id, game_system_id)
        REFERENCES public.game_system_xp_sources(id, game_system_id) ON DELETE RESTRICT,
    UNIQUE (game_system_id, source_id, event_key)
);
CREATE INDEX character_xp_ledger_character_created_idx
    ON public.character_xp_ledger (character_id, created_at DESC);

ALTER TABLE public.game_system_xp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_system_xp_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_xp_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_system_xp_settings, public.game_system_xp_sources, public.character_xp_ledger
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.character_xp_ledger TO authenticated;
CREATE POLICY character_xp_ledger_read_own
    ON public.character_xp_ledger FOR SELECT TO authenticated
    USING (private.owns_character(character_id));

-- Existing systems get defaults; future systems receive the same configuration.
INSERT INTO public.game_system_xp_settings (game_system_id)
SELECT id FROM public.game_systems
ON CONFLICT (game_system_id) DO NOTHING;

INSERT INTO public.game_system_xp_sources (game_system_id, source_type, name)
SELECT system.id, source.source_type, source.name
FROM public.game_systems AS system
CROSS JOIN (VALUES
    ('daily_login', 'Login diário'),
    ('mission', 'Missão'),
    ('fight', 'Luta')
) AS source(source_type, name)
ON CONFLICT DO NOTHING;

CREATE FUNCTION private.create_game_system_xp_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    INSERT INTO public.game_system_xp_settings (game_system_id)
    VALUES (NEW.id)
    ON CONFLICT (game_system_id) DO NOTHING;

    INSERT INTO public.game_system_xp_sources (game_system_id, source_type, name)
    VALUES
        (NEW.id, 'daily_login', 'Login diário'),
        (NEW.id, 'mission', 'Missão'),
        (NEW.id, 'fight', 'Luta')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.create_game_system_xp_defaults() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER game_systems_create_xp_defaults
    AFTER INSERT ON public.game_systems
    FOR EACH ROW EXECUTE FUNCTION private.create_game_system_xp_defaults();

CREATE FUNCTION private._get_game_system_xp_settings(p_game_system_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;

    SELECT jsonb_build_object(
        'game_system_id', settings.game_system_id,
        'xp_per_level', settings.xp_per_level,
        'sources', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', source.id,
                'name', source.name,
                'source_type', source.source_type,
                'award_amount', source.award_amount,
                'is_enabled', source.is_enabled
            ) ORDER BY CASE source.source_type
                WHEN 'daily_login' THEN 1 WHEN 'mission' THEN 2 WHEN 'fight' THEN 3 ELSE 4 END,
                source.name
            )
            FROM public.game_system_xp_sources AS source
            WHERE source.game_system_id = settings.game_system_id
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM public.game_system_xp_settings AS settings
    WHERE settings.game_system_id = p_game_system_id;

    RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private._get_game_system_xp_settings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._get_game_system_xp_settings(UUID) TO authenticated;

CREATE FUNCTION private._set_game_system_xp_settings(p_game_system_id UUID, p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_xp_per_level INTEGER;
    v_source JSONB;
    v_source_type TEXT;
    v_source_name TEXT;
    v_amount INTEGER;
    v_enabled BOOLEAN;
    v_source_id UUID;
    v_existing_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;

    IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
       OR NOT (p_settings ?& ARRAY['xp_per_level', 'sources'])
       OR p_settings - ARRAY['xp_per_level', 'sources'] <> '{}'::jsonb
       OR jsonb_typeof(p_settings->'sources') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_settings->'xp_per_level') IS DISTINCT FROM 'number'
       OR (p_settings->>'xp_per_level') !~ '^[0-9]+$' THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END IF;

    BEGIN
        v_xp_per_level := (p_settings->>'xp_per_level')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END;
    IF v_xp_per_level NOT BETWEEN 1 AND 1000000 THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END IF;

    IF jsonb_array_length(p_settings->'sources') < 3
       OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
            WHERE jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
               OR NOT (entry.value ?& ARRAY['source_type', 'name', 'award_amount', 'is_enabled'])
               OR entry.value - ARRAY['id', 'source_type', 'name', 'award_amount', 'is_enabled'] <> '{}'::jsonb
               OR jsonb_typeof(entry.value->'source_type') IS DISTINCT FROM 'string'
               OR jsonb_typeof(entry.value->'name') IS DISTINCT FROM 'string'
               OR length(btrim(entry.value->>'name')) NOT BETWEEN 1 AND 80
               OR jsonb_typeof(entry.value->'award_amount') IS DISTINCT FROM 'number'
               OR (entry.value->>'award_amount') !~ '^[0-9]+$'
               OR jsonb_typeof(entry.value->'is_enabled') IS DISTINCT FROM 'boolean'
               OR (entry.value ? 'id' AND (
                    jsonb_typeof(entry.value->'id') IS DISTINCT FROM 'string'
                    OR (entry.value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               ))
               OR entry.value->>'source_type' NOT IN ('daily_login', 'mission', 'fight', 'custom')
       ) THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
        WHERE (entry.value->>'award_amount')::NUMERIC NOT BETWEEN 0 AND 1000000
           OR ((entry.value->>'is_enabled')::BOOLEAN AND (entry.value->>'award_amount')::NUMERIC = 0)
    ) THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
        WHERE entry.value ? 'id'
          AND NOT EXISTS (
              SELECT 1 FROM public.game_system_xp_sources AS source
              WHERE source.id = (entry.value->>'id')::UUID
                AND source.game_system_id = p_game_system_id
                AND source.source_type = entry.value->>'source_type'
          )
    ) OR (SELECT count(*) FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
          WHERE entry.value ? 'id') <>
         (SELECT count(DISTINCT (entry.value->>'id')::UUID)
          FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
          WHERE entry.value ? 'id') THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END IF;

    IF (SELECT count(*) FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
        WHERE entry.value->>'source_type' = 'daily_login') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
           WHERE entry.value->>'source_type' = 'mission') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
           WHERE entry.value->>'source_type' = 'fight') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
           WHERE entry.value->>'source_type' <> 'custom') <> 3
       OR (SELECT count(*) FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
           WHERE entry.value->>'source_type' = 'custom') <>
          (SELECT count(DISTINCT lower(entry.value->>'name'))
           FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
           WHERE entry.value->>'source_type' = 'custom') THEN
        RETURN jsonb_build_object('status', 'invalid_settings');
    END IF;

    UPDATE public.game_system_xp_settings
    SET xp_per_level = v_xp_per_level, updated_at = now()
    WHERE game_system_id = p_game_system_id;

    UPDATE public.game_system_xp_sources
    SET is_enabled = FALSE, updated_at = now()
    WHERE game_system_id = p_game_system_id AND source_type = 'custom';

    FOR v_source IN SELECT value FROM jsonb_array_elements(p_settings->'sources') AS entry(value)
    LOOP
        v_source_type := v_source->>'source_type';
        v_source_name := btrim(v_source->>'name');
        v_amount := (v_source->>'award_amount')::INTEGER;
        v_enabled := (v_source->>'is_enabled')::BOOLEAN;

        IF v_source_type <> 'custom' THEN
            UPDATE public.game_system_xp_sources
            SET name = v_source_name,
                award_amount = v_amount,
                is_enabled = v_enabled,
                updated_at = now()
            WHERE game_system_id = p_game_system_id AND source_type = v_source_type;
        ELSE
            v_source_id := NULL;
            IF v_source ? 'id' THEN
                v_source_id := (v_source->>'id')::UUID;
                UPDATE public.game_system_xp_sources
                SET name = v_source_name,
                    award_amount = v_amount,
                    is_enabled = v_enabled,
                    updated_at = now()
                WHERE id = v_source_id
                  AND game_system_id = p_game_system_id
                  AND source_type = 'custom';
                IF NOT FOUND THEN
                    RETURN jsonb_build_object('status', 'invalid_settings');
                END IF;
            ELSE
                SELECT id INTO v_existing_id
                FROM public.game_system_xp_sources
                WHERE game_system_id = p_game_system_id
                  AND source_type = 'custom'
                  AND lower(name) = lower(v_source_name);
                IF FOUND THEN
                    UPDATE public.game_system_xp_sources
                    SET name = v_source_name,
                        award_amount = v_amount,
                        is_enabled = v_enabled,
                        updated_at = now()
                    WHERE id = v_existing_id;
                ELSE
                    INSERT INTO public.game_system_xp_sources (
                        game_system_id, source_type, name, award_amount, is_enabled
                    ) VALUES (
                        p_game_system_id, 'custom', v_source_name, v_amount, v_enabled
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'updated');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'invalid_settings');
END;
$function$;
REVOKE ALL ON FUNCTION private._set_game_system_xp_settings(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._set_game_system_xp_settings(UUID, JSONB) TO authenticated;

CREATE FUNCTION private.grant_character_xp(
    p_character_id UUID,
    p_source_id UUID,
    p_event_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_game_system_id UUID;
    v_character_system_id UUID;
    v_source_type TEXT;
    v_source_name TEXT;
    v_amount INTEGER;
    v_inserted INTEGER;
BEGIN
    IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 1 AND 200 THEN
        RETURN 0;
    END IF;

    SELECT source.game_system_id, source.source_type, source.name, source.award_amount
    INTO v_game_system_id, v_source_type, v_source_name, v_amount
    FROM public.game_system_xp_sources AS source
    WHERE source.id = p_source_id AND source.is_enabled;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    SELECT character.game_system_id INTO v_character_system_id
    FROM public.characters AS character
    WHERE character.id = p_character_id AND character.status = 'active';
    IF NOT FOUND OR v_character_system_id <> v_game_system_id THEN
        RETURN 0;
    END IF;

    INSERT INTO public.character_xp_ledger (
        game_system_id, character_id, source_id, source_type_snapshot,
        source_name_snapshot, event_key, amount
    ) VALUES (
        v_game_system_id, p_character_id, p_source_id, v_source_type,
        v_source_name, btrim(p_event_key), v_amount
    )
    ON CONFLICT (game_system_id, source_id, event_key) DO NOTHING
    RETURNING amount INTO v_inserted;

    RETURN COALESCE(v_inserted, 0);
END;
$function$;
REVOKE ALL ON FUNCTION private.grant_character_xp(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private._get_character_xp_summary(p_character_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_game_system_id UUID;
    v_xp_per_level INTEGER;
    v_total_xp BIGINT;
    v_history JSONB;
BEGIN
    SELECT character.game_system_id INTO v_game_system_id
    FROM public.characters AS character
    WHERE character.id = p_character_id AND character.user_id = auth.uid();
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT settings.xp_per_level INTO v_xp_per_level
    FROM public.game_system_xp_settings AS settings
    WHERE settings.game_system_id = v_game_system_id;
    v_xp_per_level := COALESCE(v_xp_per_level, 100);

    SELECT COALESCE(sum(ledger.amount), 0)::BIGINT INTO v_total_xp
    FROM public.character_xp_ledger AS ledger
    WHERE ledger.character_id = p_character_id;

    SELECT COALESCE(jsonb_agg(history.entry ORDER BY history.created_at DESC), '[]'::jsonb)
    INTO v_history
    FROM (
        SELECT jsonb_build_object(
            'id', ledger.id,
            'source_type', ledger.source_type_snapshot,
            'source_name', ledger.source_name_snapshot,
            'amount', ledger.amount,
            'created_at', ledger.created_at
        ) AS entry, ledger.created_at
        FROM public.character_xp_ledger AS ledger
        WHERE ledger.character_id = p_character_id
        ORDER BY ledger.created_at DESC, ledger.id DESC
        LIMIT 50
    ) AS history;

    RETURN jsonb_build_object(
        'character_id', p_character_id,
        'game_system_id', v_game_system_id,
        'total_xp', v_total_xp,
        'level', floor(v_total_xp::NUMERIC / v_xp_per_level)::INTEGER + 1,
        'xp_in_level', mod(v_total_xp, v_xp_per_level)::INTEGER,
        'xp_to_next_level', v_xp_per_level - mod(v_total_xp, v_xp_per_level)::INTEGER,
        'history', v_history
    );
END;
$function$;
REVOKE ALL ON FUNCTION private._get_character_xp_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._get_character_xp_summary(UUID) TO authenticated;

CREATE FUNCTION public.get_game_system_xp_settings(p_game_system_id UUID)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._get_game_system_xp_settings($1);
$function$;
CREATE FUNCTION public.set_game_system_xp_settings(p_game_system_id UUID, p_settings JSONB)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._set_game_system_xp_settings($1, $2);
$function$;
CREATE FUNCTION public.get_character_xp_summary(p_character_id UUID)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._get_character_xp_summary($1);
$function$;
REVOKE ALL ON FUNCTION public.get_game_system_xp_settings(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_game_system_xp_settings(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_character_xp_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_system_xp_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_game_system_xp_settings(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_character_xp_summary(UUID) TO authenticated;

CREATE FUNCTION private.grant_daily_login_xp_after_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_source_id UUID;
BEGIN
    SELECT source.id INTO v_source_id
    FROM public.game_system_xp_sources AS source
    WHERE source.game_system_id = NEW.game_system_id
      AND source.source_type = 'daily_login'
      AND source.is_enabled;
    IF FOUND THEN
        PERFORM private.grant_character_xp(NEW.character_id, v_source_id, NEW.id::TEXT);
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.grant_daily_login_xp_after_claim() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER daily_login_claims_grant_xp
    AFTER INSERT ON public.daily_login_claims
    FOR EACH ROW EXECUTE FUNCTION private.grant_daily_login_xp_after_claim();

CREATE OR REPLACE FUNCTION public.claim_daily_login_reward(p_game_system_id UUID, p_character_id UUID)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $function$
    WITH claim_result AS (
        SELECT private._claim_daily_login_reward($1, $2) AS result
    )
    SELECT CASE WHEN claim_result.result->>'status' = 'claimed'
        THEN claim_result.result || jsonb_build_object(
            'xp_awarded', COALESCE((
                SELECT ledger.amount
                FROM public.character_xp_ledger AS ledger
                WHERE ledger.character_id = $2
                  AND ledger.game_system_id = $1
                  AND ledger.source_type_snapshot = 'daily_login'
                  AND ledger.event_key = claim_result.result->>'claim_id'
            ), 0)
        )
        ELSE claim_result.result
    END
    FROM claim_result;
$function$;
REVOKE ALL ON FUNCTION public.claim_daily_login_reward(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(UUID, UUID) TO authenticated;

COMMIT;
