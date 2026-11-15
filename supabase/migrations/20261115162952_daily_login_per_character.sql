BEGIN;
ALTER TABLE public.daily_login_claims DROP CONSTRAINT daily_login_claims_user_id_game_system_id_local_claim_date_key;
ALTER TABLE public.daily_login_claims ADD CONSTRAINT daily_login_claims_character_system_date_key UNIQUE (character_id, game_system_id, local_claim_date);

CREATE OR REPLACE FUNCTION private._claim_daily_login_reward(p_game_system_id UUID, p_character_id UUID)
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
    IF NOT private.can_access_game_system(p_game_system_id) THEN
        RETURN jsonb_build_object('status', 'system_unavailable');
    END IF;

    SELECT system.is_active, system.daily_login_rewards_enabled, system.daily_login_timezone
    INTO v_system_active, v_rewards_enabled, v_timezone
    FROM public.game_systems AS system
    WHERE system.id = p_game_system_id;
    IF NOT FOUND OR NOT v_system_active THEN
        RETURN jsonb_build_object('status', 'system_unavailable');
    END IF;
    IF NOT v_rewards_enabled OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_timezone_names AS tz WHERE tz.name = v_timezone
    ) THEN
        RETURN jsonb_build_object('status', 'calendar_unavailable');
    END IF;

    v_local_now := pg_catalog.timezone(v_timezone, pg_catalog.clock_timestamp());
    v_local_date := v_local_now::DATE;
    v_weekday := extract(isodow FROM v_local_now)::SMALLINT;

    SELECT reward.item_id, item.name, reward.quantity
    INTO v_item_id, v_item_name, v_quantity
    FROM public.daily_login_rewards AS reward
    JOIN public.items AS item ON item.id = reward.item_id
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
    ) ON CONFLICT (character_id, game_system_id, local_claim_date) DO NOTHING
    RETURNING id INTO v_claim_id;
    IF v_claim_id IS NULL THEN
        RETURN jsonb_build_object('status', 'already_claimed');
    END IF;

    INSERT INTO public.character_inventory (character_id, item_id, quantity, metadata)
    VALUES (p_character_id, v_item_id, v_quantity, '{}'::JSONB)
    ON CONFLICT (character_id, item_id, metadata)
    DO UPDATE SET quantity = public.character_inventory.quantity + EXCLUDED.quantity;

    RETURN jsonb_build_object(
        'status', 'claimed', 'claim_id', v_claim_id,
        'game_system_id', p_game_system_id, 'character_id', p_character_id,
        'item_id', v_item_id, 'item_name', v_item_name, 'quantity', v_quantity,
        'weekday', v_weekday, 'local_claim_date', v_local_date, 'timezone', v_timezone,
        'currency_awarded', (SELECT currency_awarded FROM public.daily_login_claims WHERE id = v_claim_id),
        'currency_name', (SELECT currency_name_snapshot FROM public.daily_login_claims WHERE id = v_claim_id)
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_daily_login_reward_state(p_game_system_id UUID)
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
    v_claimed_ids JSONB;
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
        'quantity', reward.quantity,
        'currency_amount', reward.currency_amount
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
        'currency_awarded', claim.currency_awarded,
        'currency_name_snapshot', claim.currency_name_snapshot,
        'weekday', claim.weekday,
        'local_claim_date', claim.local_claim_date,
        'claimed_at', claim.claimed_at
    )
    INTO v_claim
    FROM public.daily_login_claims AS claim
    WHERE claim.user_id = v_user_id
      AND claim.game_system_id = p_game_system_id
      AND claim.local_claim_date = v_local_date
    ORDER BY claim.claimed_at DESC LIMIT 1;

    SELECT COALESCE(jsonb_agg(character_id), '[]'::jsonb) INTO v_claimed_ids
    FROM public.daily_login_claims WHERE user_id = v_user_id
      AND game_system_id = p_game_system_id AND local_claim_date = v_local_date;

    RETURN jsonb_build_object(
        'status', CASE
            WHEN NOT v_rewards_enabled OR v_reward IS NULL THEN 'calendar_unavailable'
            WHEN NOT EXISTS (SELECT 1 FROM public.characters ch WHERE ch.user_id = v_user_id
                AND ch.game_system_id = p_game_system_id AND ch.status = 'active'
                AND NOT (v_claimed_ids ? ch.id::text)) THEN 'already_claimed'
            ELSE 'available'
        END,
        'game_system_id', p_game_system_id,
        'weekday', v_weekday,
        'local_date', v_local_date,
        'timezone', v_timezone,
        'reward', v_reward,
        'claimed_character_ids', v_claimed_ids,
        'claim', v_claim
    );
END;
$function$;

COMMIT;

