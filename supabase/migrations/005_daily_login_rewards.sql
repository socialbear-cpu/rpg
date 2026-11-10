-- Owner-managed, per-system weekly login reward calendars.
-- PostgreSQL 13+; the claim operation is transactional and derives identity
-- from the authenticated Supabase JWT rather than caller-supplied account data.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.game_systems
    ADD COLUMN owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN daily_login_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    ADD COLUMN daily_login_rewards_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.game_systems.owner_user_id IS
    'User allowed to manage this system''s daily login rewards; assign through trusted operator tooling.';
COMMENT ON COLUMN public.game_systems.daily_login_timezone IS
    'IANA timezone used to determine the shared weekly reward day and claim date.';

CREATE FUNCTION private.prevent_untrusted_daily_login_owner_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
       AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Only a trusted operator can change a system owner'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.prevent_untrusted_daily_login_owner_change()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER game_systems_protect_daily_login_owner
    BEFORE UPDATE OF owner_user_id ON public.game_systems
    FOR EACH ROW
    EXECUTE FUNCTION private.prevent_untrusted_daily_login_owner_change();

CREATE TABLE public.daily_login_rewards (
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    item_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (game_system_id, weekday),
    FOREIGN KEY (item_id, game_system_id)
        REFERENCES public.items(id, game_system_id) ON DELETE RESTRICT
);

CREATE TABLE public.daily_login_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE RESTRICT,
    character_id UUID NOT NULL,
    item_id UUID NOT NULL,
    item_name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    local_claim_date DATE NOT NULL,
    timezone_name TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, game_system_id, local_claim_date),
    FOREIGN KEY (character_id, game_system_id)
        REFERENCES public.characters(id, game_system_id) ON DELETE RESTRICT,
    FOREIGN KEY (item_id, game_system_id)
        REFERENCES public.items(id, game_system_id) ON DELETE RESTRICT
);

CREATE INDEX daily_login_claims_system_date_idx
    ON public.daily_login_claims(game_system_id, local_claim_date DESC);
CREATE INDEX daily_login_claims_user_idx
    ON public.daily_login_claims(user_id, claimed_at DESC);

ALTER TABLE public.daily_login_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_login_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_login_rewards_read
    ON public.daily_login_rewards FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.game_systems AS system
        WHERE system.id = daily_login_rewards.game_system_id
          AND ((system.is_active AND system.daily_login_rewards_enabled)
               OR system.owner_user_id = (SELECT auth.uid()))
    ));

CREATE POLICY daily_login_own_claims_read
    ON public.daily_login_claims FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.daily_login_rewards, public.daily_login_claims
    FROM anon, authenticated;
GRANT SELECT ON TABLE public.daily_login_rewards, public.daily_login_claims
    TO authenticated;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION private._set_daily_login_reward_schedule(
    p_game_system_id UUID,
    p_rewards JSONB,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_row_count INTEGER;
    v_weekday_count INTEGER;
    v_min_weekday INTEGER;
    v_max_weekday INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.game_systems AS system
        WHERE system.id = p_game_system_id
          AND system.owner_user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;

    IF jsonb_typeof(p_rewards) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;
    IF jsonb_array_length(p_rewards) <> 7 THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;

    SELECT count(*), count(DISTINCT reward.weekday), min(reward.weekday), max(reward.weekday)
    INTO v_row_count, v_weekday_count, v_min_weekday, v_max_weekday
    FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER);

    IF v_row_count <> 7 OR v_weekday_count <> 7
       OR v_min_weekday <> 1 OR v_max_weekday <> 7 THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER)
        LEFT JOIN public.items AS item
          ON item.id = reward.item_id
         AND item.game_system_id = p_game_system_id
        WHERE reward.weekday IS NULL
           OR reward.item_id IS NULL
           OR reward.quantity IS NULL
           OR reward.quantity NOT BETWEEN 1 AND 1000000
           OR item.id IS NULL
    ) THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;

    DELETE FROM public.daily_login_rewards
    WHERE game_system_id = p_game_system_id;

    INSERT INTO public.daily_login_rewards (game_system_id, weekday, item_id, quantity)
    SELECT p_game_system_id, reward.weekday, reward.item_id, reward.quantity
    FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER);

    UPDATE public.game_systems
    SET daily_login_rewards_enabled = p_is_active,
        updated_at = now()
    WHERE id = p_game_system_id;

    RETURN jsonb_build_object('status', 'updated');
END;
$function$;

CREATE FUNCTION private._claim_daily_login_reward(
    p_game_system_id UUID,
    p_character_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_system_active BOOLEAN;
    v_rewards_enabled BOOLEAN;
    v_timezone TEXT;
    v_local_now TIMESTAMP WITHOUT TIME ZONE;
    v_local_date DATE;
    v_weekday SMALLINT;
    v_item_id UUID;
    v_item_name TEXT;
    v_quantity INTEGER;
    v_claim_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    SELECT system.is_active, system.daily_login_rewards_enabled, system.daily_login_timezone
    INTO v_system_active, v_rewards_enabled, v_timezone
    FROM public.game_systems AS system
    WHERE system.id = p_game_system_id;

    IF NOT FOUND OR NOT v_system_active THEN
        RETURN jsonb_build_object('status', 'system_unavailable');
    END IF;
    IF NOT v_rewards_enabled THEN
        RETURN jsonb_build_object('status', 'calendar_unavailable');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS tz WHERE tz.name = v_timezone) THEN
        RETURN jsonb_build_object('status', 'calendar_unavailable');
    END IF;

    v_local_now := pg_catalog.timezone(v_timezone, pg_catalog.clock_timestamp());
    v_local_date := v_local_now::DATE;
    v_weekday := extract(isodow FROM v_local_now)::SMALLINT;

    SELECT reward.item_id, item.name, reward.quantity
    INTO v_item_id, v_item_name, v_quantity
    FROM public.daily_login_rewards AS reward
    JOIN public.items AS item
      ON item.id = reward.item_id
     AND item.game_system_id = reward.game_system_id
    WHERE reward.game_system_id = p_game_system_id
      AND reward.weekday = v_weekday;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'calendar_unavailable');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.characters AS character
        WHERE character.id = p_character_id
          AND character.user_id = v_user_id
          AND character.game_system_id = p_game_system_id
          AND character.status = 'active'
    ) THEN
        RETURN jsonb_build_object('status', 'invalid_character');
    END IF;

    INSERT INTO public.daily_login_claims (
        user_id, game_system_id, character_id, item_id, item_name_snapshot,
        quantity, weekday, local_claim_date, timezone_name
    ) VALUES (
        v_user_id, p_game_system_id, p_character_id, v_item_id, v_item_name,
        v_quantity, v_weekday, v_local_date, v_timezone
    )
    ON CONFLICT (user_id, game_system_id, local_claim_date) DO NOTHING
    RETURNING id INTO v_claim_id;

    IF v_claim_id IS NULL THEN
        RETURN jsonb_build_object('status', 'already_claimed');
    END IF;

    INSERT INTO public.character_inventory (character_id, item_id, quantity)
    VALUES (p_character_id, v_item_id, v_quantity)
    ON CONFLICT (character_id, item_id)
    DO UPDATE SET quantity = public.character_inventory.quantity + EXCLUDED.quantity;

    RETURN jsonb_build_object(
        'status', 'claimed',
        'claim_id', v_claim_id,
        'game_system_id', p_game_system_id,
        'character_id', p_character_id,
        'item_id', v_item_id,
        'item_name', v_item_name,
        'quantity', v_quantity,
        'weekday', v_weekday,
        'local_claim_date', v_local_date,
        'timezone', v_timezone
    );
END;
$function$;

CREATE FUNCTION public.get_daily_login_reward_state(p_game_system_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_system_active BOOLEAN;
    v_rewards_enabled BOOLEAN;
    v_timezone TEXT;
    v_local_now TIMESTAMP WITHOUT TIME ZONE;
    v_local_date DATE;
    v_weekday SMALLINT;
    v_reward JSONB;
    v_claim JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    SELECT system.is_active, system.daily_login_rewards_enabled, system.daily_login_timezone
    INTO v_system_active, v_rewards_enabled, v_timezone
    FROM public.game_systems AS system
    WHERE system.id = p_game_system_id;

    IF NOT FOUND OR NOT v_system_active THEN
        RETURN jsonb_build_object('status', 'system_unavailable');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS tz WHERE tz.name = v_timezone) THEN
        RETURN jsonb_build_object('status', 'calendar_unavailable');
    END IF;

    v_local_now := pg_catalog.timezone(v_timezone, pg_catalog.clock_timestamp());
    v_local_date := v_local_now::DATE;
    v_weekday := extract(isodow FROM v_local_now)::SMALLINT;

    SELECT jsonb_build_object(
        'weekday', reward.weekday,
        'item_id', reward.item_id,
        'item_name', item.name,
        'quantity', reward.quantity
    )
    INTO v_reward
    FROM public.daily_login_rewards AS reward
    JOIN public.items AS item
      ON item.id = reward.item_id
     AND item.game_system_id = reward.game_system_id
    WHERE reward.game_system_id = p_game_system_id
      AND reward.weekday = v_weekday;

    SELECT jsonb_build_object(
        'id', claim.id,
        'character_id', claim.character_id,
        'item_id', claim.item_id,
        'item_name_snapshot', claim.item_name_snapshot,
        'quantity', claim.quantity,
        'weekday', claim.weekday,
        'local_claim_date', claim.local_claim_date,
        'claimed_at', claim.claimed_at
    )
    INTO v_claim
    FROM public.daily_login_claims AS claim
    WHERE claim.user_id = v_user_id
      AND claim.game_system_id = p_game_system_id
      AND claim.local_claim_date = v_local_date;

    RETURN jsonb_build_object(
        'status', CASE
            WHEN NOT v_rewards_enabled OR v_reward IS NULL THEN 'calendar_unavailable'
            WHEN v_claim IS NOT NULL THEN 'already_claimed'
            ELSE 'available'
        END,
        'game_system_id', p_game_system_id,
        'weekday', v_weekday,
        'local_date', v_local_date,
        'timezone', v_timezone,
        'reward', v_reward,
        'claim', v_claim
    );
END;
$function$;

REVOKE ALL ON FUNCTION private._set_daily_login_reward_schedule(UUID, JSONB, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private._claim_daily_login_reward(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._set_daily_login_reward_schedule(UUID, JSONB, BOOLEAN)
    TO authenticated;
GRANT EXECUTE ON FUNCTION private._claim_daily_login_reward(UUID, UUID)
    TO authenticated;

CREATE FUNCTION public.set_daily_login_reward_schedule(
    p_game_system_id UUID,
    p_rewards JSONB,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._set_daily_login_reward_schedule($1, $2, $3);
$function$;

CREATE FUNCTION public.claim_daily_login_reward(
    p_game_system_id UUID,
    p_character_id UUID
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._claim_daily_login_reward($1, $2);
$function$;

REVOKE ALL ON FUNCTION public.set_daily_login_reward_schedule(UUID, JSONB, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_daily_login_reward(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_daily_login_reward_state(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_daily_login_reward_schedule(UUID, JSONB, BOOLEAN)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(UUID, UUID)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_login_reward_state(UUID)
    TO authenticated;

COMMIT;
