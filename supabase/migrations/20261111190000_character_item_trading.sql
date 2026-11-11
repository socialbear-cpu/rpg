-- Item stacks with distinct characteristics and asynchronous character trades.
BEGIN;

ALTER TABLE public.character_inventory
    ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.character_inventory
    DROP CONSTRAINT character_inventory_pkey;
ALTER TABLE public.character_inventory
    ADD CONSTRAINT character_inventory_pkey PRIMARY KEY (id);
ALTER TABLE public.character_inventory
    ADD CONSTRAINT character_inventory_character_item_metadata_key
    UNIQUE (character_id, item_id, metadata);
CREATE INDEX character_inventory_character_item_idx
    ON public.character_inventory (character_id, item_id);

CREATE TABLE public.trade_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE RESTRICT,
    sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    sender_character_id UUID NOT NULL,
    recipient_character_id UUID NOT NULL,
    countered_from_offer_id UUID REFERENCES public.trade_offers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'countered', 'expired', 'invalidated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
    responded_at TIMESTAMPTZ,
    UNIQUE (id, game_system_id),
    FOREIGN KEY (sender_character_id, game_system_id)
        REFERENCES public.characters(id, game_system_id) ON DELETE RESTRICT,
    FOREIGN KEY (recipient_character_id, game_system_id)
        REFERENCES public.characters(id, game_system_id) ON DELETE RESTRICT,
    CHECK (sender_user_id <> recipient_user_id),
    CHECK (sender_character_id <> recipient_character_id),
    CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX trade_offers_countered_from_uq
    ON public.trade_offers (countered_from_offer_id)
    WHERE countered_from_offer_id IS NOT NULL;
CREATE INDEX trade_offers_incoming_idx
    ON public.trade_offers (recipient_user_id, status, created_at DESC, id DESC);
CREATE INDEX trade_offers_sent_idx
    ON public.trade_offers (sender_user_id, status, created_at DESC, id DESC);

CREATE TABLE public.trade_offer_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL,
    game_system_id UUID NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('sender', 'recipient')),
    stack_id UUID NOT NULL,
    item_id UUID NOT NULL,
    item_name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    metadata_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (offer_id, game_system_id)
        REFERENCES public.trade_offers(id, game_system_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id, game_system_id)
        REFERENCES public.items(id, game_system_id) ON DELETE RESTRICT,
    UNIQUE (offer_id, side, stack_id)
);
CREATE INDEX trade_offer_lines_offer_idx
    ON public.trade_offer_lines (offer_id, side, id);

ALTER TABLE public.trade_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_offer_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trade_offers, public.trade_offer_lines
    FROM PUBLIC, anon, authenticated;

-- Existing login rewards also merge into the default-characteristic stack.
CREATE OR REPLACE FUNCTION private._claim_daily_login_reward(p_game_system_id UUID, p_character_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
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
    ) ON CONFLICT (user_id, game_system_id, local_claim_date) DO NOTHING
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
        'weekday', v_weekday, 'local_claim_date', v_local_date, 'timezone', v_timezone
    );
END;
$function$;
REVOKE ALL ON FUNCTION private._claim_daily_login_reward(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._claim_daily_login_reward(UUID, UUID) TO authenticated;

CREATE FUNCTION private._trade_lines_valid(p_lines JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
    v_entry JSONB;
    v_stack_id UUID;
    v_quantity NUMERIC;
    v_seen UUID[] := ARRAY[]::UUID[];
BEGIN
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_lines) > 100 THEN
        RETURN FALSE;
    END IF;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_lines) AS line(value) LOOP
        IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
           OR NOT (v_entry ?& ARRAY['stack_id', 'quantity'])
           OR (v_entry - 'stack_id' - 'quantity') <> '{}'::JSONB
           OR jsonb_typeof(v_entry -> 'stack_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_entry -> 'quantity') IS DISTINCT FROM 'number' THEN
            RETURN FALSE;
        END IF;

        IF (v_entry ->> 'stack_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN FALSE;
        END IF;
        v_stack_id := (v_entry ->> 'stack_id')::UUID;
        v_quantity := (v_entry ->> 'quantity')::NUMERIC;
        IF v_quantity < 1 OR v_quantity > 2147483647 OR v_quantity <> trunc(v_quantity)
           OR v_stack_id = ANY(v_seen) THEN
            RETURN FALSE;
        END IF;
        v_seen := array_append(v_seen, v_stack_id);
    END LOOP;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$function$;
REVOKE ALL ON FUNCTION private._trade_lines_valid(JSONB) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private._validate_trade_lines(
    p_character_id UUID,
    p_game_system_id UUID,
    p_lines JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_entry JSONB;
    v_stack_id UUID;
    v_quantity INTEGER;
    v_available INTEGER;
BEGIN
    IF NOT private._trade_lines_valid(p_lines) THEN
        RETURN 'invalid_lines';
    END IF;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_lines) AS line(value) LOOP
        v_stack_id := (v_entry ->> 'stack_id')::UUID;
        v_quantity := (v_entry ->> 'quantity')::INTEGER;
        SELECT inventory.quantity INTO v_available
        FROM public.character_inventory AS inventory
        JOIN public.items AS item ON item.id = inventory.item_id
        WHERE inventory.id = v_stack_id
          AND inventory.character_id = p_character_id
          AND item.game_system_id = p_game_system_id;
        IF NOT FOUND THEN
            RETURN 'invalid_item';
        END IF;
        IF v_available < v_quantity THEN
            RETURN 'insufficient_items';
        END IF;
    END LOOP;
    RETURN 'valid';
END;
$function$;
REVOKE ALL ON FUNCTION private._validate_trade_lines(UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_trade_characters(p_game_system_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_characters JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.characters AS owned
        WHERE owned.user_id = v_user_id
          AND owned.game_system_id = p_game_system_id
          AND owned.status = 'active'
    ) THEN
        RETURN jsonb_build_object('status', 'no_active_character');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', character.id,
        'character_name', character.character_name,
        'owner_display_name', profile.display_name,
        'is_mine', character.user_id = v_user_id
    ) ORDER BY character.user_id = v_user_id DESC, character.character_name), '[]'::JSONB)
    INTO v_characters
    FROM public.characters AS character
    JOIN public.user_profiles AS profile ON profile.user_id = character.user_id
    WHERE character.game_system_id = p_game_system_id
      AND character.status = 'active';

    RETURN jsonb_build_object('status', 'ok', 'characters', v_characters);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_trade_characters(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trade_characters(UUID) TO authenticated;

CREATE FUNCTION public.get_trade_inventory(p_game_system_id UUID, p_character_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_character JSONB;
    v_stacks JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.characters AS owned
        WHERE owned.user_id = v_user_id
          AND owned.game_system_id = p_game_system_id
          AND owned.status = 'active'
    ) THEN
        RETURN jsonb_build_object('status', 'no_active_character');
    END IF;

    SELECT jsonb_build_object(
        'id', character.id,
        'character_name', character.character_name,
        'owner_display_name', profile.display_name,
        'is_mine', character.user_id = v_user_id
    ) INTO v_character
    FROM public.characters AS character
    JOIN public.user_profiles AS profile ON profile.user_id = character.user_id
    WHERE character.id = p_character_id
      AND character.game_system_id = p_game_system_id
      AND character.status = 'active';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'character_not_found');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'stack_id', inventory.id,
        'item_id', item.id,
        'item_name', item.name,
        'quantity', inventory.quantity,
        'metadata', inventory.metadata
    ) ORDER BY item.name, inventory.metadata::TEXT), '[]'::JSONB)
    INTO v_stacks
    FROM public.character_inventory AS inventory
    JOIN public.items AS item ON item.id = inventory.item_id
    WHERE inventory.character_id = p_character_id
      AND item.game_system_id = p_game_system_id;

    RETURN jsonb_build_object('status', 'ok', 'character', v_character, 'stacks', v_stacks);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_trade_inventory(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trade_inventory(UUID, UUID) TO authenticated;

CREATE FUNCTION private._insert_trade_offer(
    p_sender_character_id UUID,
    p_recipient_character_id UUID,
    p_sender_lines JSONB,
    p_recipient_lines JSONB,
    p_countered_from_offer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := (SELECT auth.uid());
    v_sender_user_id UUID;
    v_recipient_user_id UUID;
    v_sender_system_id UUID;
    v_recipient_system_id UUID;
    v_game_system_id UUID;
    v_offer_id UUID;
    v_entry JSONB;
    v_stack_id UUID;
    v_item_id UUID;
    v_item_name TEXT;
    v_metadata JSONB;
    v_line_status TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF jsonb_typeof(p_sender_lines) IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_recipient_lines) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_sender_lines) + jsonb_array_length(p_recipient_lines) = 0
       OR jsonb_array_length(p_sender_lines) + jsonb_array_length(p_recipient_lines) > 100 THEN
        RETURN jsonb_build_object('status', 'invalid_lines');
    END IF;
    IF NOT private._trade_lines_valid(p_sender_lines)
       OR NOT private._trade_lines_valid(p_recipient_lines) THEN
        RETURN jsonb_build_object('status', 'invalid_lines');
    END IF;

    SELECT character.user_id, character.game_system_id
    INTO v_sender_user_id, v_sender_system_id
    FROM public.characters AS character
    WHERE character.id = p_sender_character_id AND character.status = 'active';
    IF NOT FOUND OR v_sender_user_id <> v_actor_id THEN
        RETURN jsonb_build_object('status', 'invalid_character');
    END IF;

    SELECT character.user_id, character.game_system_id
    INTO v_recipient_user_id, v_recipient_system_id
    FROM public.characters AS character
    WHERE character.id = p_recipient_character_id AND character.status = 'active';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_character');
    END IF;
    IF v_sender_user_id = v_recipient_user_id THEN
        RETURN jsonb_build_object('status', 'self_trade');
    END IF;
    IF v_sender_system_id <> v_recipient_system_id THEN
        RETURN jsonb_build_object('status', 'invalid_system');
    END IF;
    v_game_system_id := v_sender_system_id;

    -- Lock both sides in one global order so an offer snapshot cannot race with a transfer.
    PERFORM inventory.id
    FROM public.character_inventory AS inventory
    WHERE inventory.id IN (
        SELECT (line.value ->> 'stack_id')::UUID
        FROM jsonb_array_elements(p_sender_lines || p_recipient_lines) AS line(value)
    )
    ORDER BY inventory.id
    FOR UPDATE;

    v_line_status := private._validate_trade_lines(p_sender_character_id, v_game_system_id, p_sender_lines);
    IF v_line_status <> 'valid' THEN
        RETURN jsonb_build_object('status', v_line_status);
    END IF;
    v_line_status := private._validate_trade_lines(p_recipient_character_id, v_game_system_id, p_recipient_lines);
    IF v_line_status <> 'valid' THEN
        RETURN jsonb_build_object('status', v_line_status);
    END IF;

    INSERT INTO public.trade_offers (
        game_system_id, sender_user_id, recipient_user_id,
        sender_character_id, recipient_character_id, countered_from_offer_id
    ) VALUES (
        v_game_system_id, v_sender_user_id, v_recipient_user_id,
        p_sender_character_id, p_recipient_character_id, p_countered_from_offer_id
    ) RETURNING id INTO v_offer_id;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_sender_lines) AS line(value) LOOP
        v_stack_id := (v_entry ->> 'stack_id')::UUID;
        SELECT inventory.item_id, item.name, inventory.metadata
        INTO v_item_id, v_item_name, v_metadata
        FROM public.character_inventory AS inventory
        JOIN public.items AS item ON item.id = inventory.item_id
        WHERE inventory.id = v_stack_id;
        INSERT INTO public.trade_offer_lines (
            offer_id, game_system_id, side, stack_id, item_id,
            item_name_snapshot, quantity, metadata_snapshot
        ) VALUES (
            v_offer_id, v_game_system_id, 'sender', v_stack_id, v_item_id,
            v_item_name, (v_entry ->> 'quantity')::INTEGER, v_metadata
        );
    END LOOP;

    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_recipient_lines) AS line(value) LOOP
        v_stack_id := (v_entry ->> 'stack_id')::UUID;
        SELECT inventory.item_id, item.name, inventory.metadata
        INTO v_item_id, v_item_name, v_metadata
        FROM public.character_inventory AS inventory
        JOIN public.items AS item ON item.id = inventory.item_id
        WHERE inventory.id = v_stack_id;
        INSERT INTO public.trade_offer_lines (
            offer_id, game_system_id, side, stack_id, item_id,
            item_name_snapshot, quantity, metadata_snapshot
        ) VALUES (
            v_offer_id, v_game_system_id, 'recipient', v_stack_id, v_item_id,
            v_item_name, (v_entry ->> 'quantity')::INTEGER, v_metadata
        );
    END LOOP;

    INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
    VALUES (
        v_recipient_user_id,
        v_game_system_id,
        'trade_offer_received',
        jsonb_build_object(
            'title', 'Nova oferta de troca',
            'body', 'Você recebeu uma nova oferta de troca.',
            'offer_id', v_offer_id,
            'status', 'pending'
        )
    );

    RETURN jsonb_build_object('status', 'created', 'offer_id', v_offer_id);
END;
$function$;
REVOKE ALL ON FUNCTION private._insert_trade_offer(UUID, UUID, JSONB, JSONB, UUID)
    FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_trade_offer(
    p_sender_character_id UUID,
    p_recipient_character_id UUID,
    p_sender_lines JSONB,
    p_recipient_lines JSONB
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT private._insert_trade_offer($1, $2, $3, $4, NULL);
$function$;
REVOKE ALL ON FUNCTION public.create_trade_offer(UUID, UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trade_offer(UUID, UUID, JSONB, JSONB) TO authenticated;

CREATE FUNCTION public.counter_trade_offer(
    p_offer_id UUID,
    p_sender_lines JSONB,
    p_recipient_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_offer public.trade_offers%ROWTYPE;
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    SELECT * INTO v_offer
    FROM public.trade_offers AS offer
    WHERE offer.id = p_offer_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_offer.recipient_user_id <> v_user_id THEN
        RETURN jsonb_build_object('status', 'not_recipient');
    END IF;
    IF v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'not_pending');
    END IF;
    IF v_offer.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.trade_offers SET status = 'expired', responded_at = pg_catalog.clock_timestamp()
        WHERE id = v_offer.id;
        RETURN jsonb_build_object('status', 'expired');
    END IF;

    v_result := private._insert_trade_offer(
        v_offer.recipient_character_id,
        v_offer.sender_character_id,
        p_sender_lines,
        p_recipient_lines,
        v_offer.id
    );
    IF v_result ->> 'status' <> 'created' THEN
        RETURN v_result;
    END IF;

    UPDATE public.trade_offers
    SET status = 'countered', responded_at = pg_catalog.clock_timestamp()
    WHERE id = v_offer.id;
    RETURN v_result || jsonb_build_object('countered_offer_id', v_offer.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.counter_trade_offer(UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.counter_trade_offer(UUID, JSONB, JSONB) TO authenticated;

CREATE FUNCTION public.get_trade_offers(
    p_box TEXT,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_offers JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_box IS NULL OR p_box NOT IN ('incoming', 'sent', 'history')
       OR p_limit NOT BETWEEN 1 AND 100
       OR p_offset < 0 THEN
        RETURN jsonb_build_object('status', 'invalid_query');
    END IF;

    UPDATE public.trade_offers
    SET status = 'expired', responded_at = pg_catalog.clock_timestamp()
    WHERE status = 'pending'
      AND expires_at <= pg_catalog.clock_timestamp()
      AND (sender_user_id = v_user_id OR recipient_user_id = v_user_id);

    SELECT COALESCE(jsonb_agg(offer_json ORDER BY created_at DESC, id DESC), '[]'::JSONB)
    INTO v_offers
    FROM (
        SELECT offer.created_at, offer.id, jsonb_build_object(
            'id', offer.id,
            'game_system_id', offer.game_system_id,
            'status', offer.status,
            'created_at', offer.created_at,
            'expires_at', offer.expires_at,
            'responded_at', offer.responded_at,
            'countered_from_offer_id', offer.countered_from_offer_id,
            'sender_character', jsonb_build_object(
                'id', sender_character.id,
                'character_name', sender_character.character_name,
                'owner_display_name', sender_profile.display_name
            ),
            'recipient_character', jsonb_build_object(
                'id', recipient_character.id,
                'character_name', recipient_character.character_name,
                'owner_display_name', recipient_profile.display_name
            ),
            'sender_lines', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'stack_id', line.stack_id,
                    'item_id', line.item_id,
                    'item_name', line.item_name_snapshot,
                    'quantity', line.quantity,
                    'metadata', line.metadata_snapshot
                ) ORDER BY line.id)
                FROM public.trade_offer_lines AS line
                WHERE line.offer_id = offer.id AND line.side = 'sender'
            ), '[]'::JSONB),
            'recipient_lines', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'stack_id', line.stack_id,
                    'item_id', line.item_id,
                    'item_name', line.item_name_snapshot,
                    'quantity', line.quantity,
                    'metadata', line.metadata_snapshot
                ) ORDER BY line.id)
                FROM public.trade_offer_lines AS line
                WHERE line.offer_id = offer.id AND line.side = 'recipient'
            ), '[]'::JSONB)
        ) AS offer_json
        FROM public.trade_offers AS offer
        JOIN public.characters AS sender_character ON sender_character.id = offer.sender_character_id
        JOIN public.user_profiles AS sender_profile ON sender_profile.user_id = offer.sender_user_id
        JOIN public.characters AS recipient_character ON recipient_character.id = offer.recipient_character_id
        JOIN public.user_profiles AS recipient_profile ON recipient_profile.user_id = offer.recipient_user_id
        WHERE (p_box = 'incoming' AND offer.recipient_user_id = v_user_id AND offer.status = 'pending')
           OR (p_box = 'sent' AND offer.sender_user_id = v_user_id AND offer.status = 'pending')
           OR (p_box = 'history' AND (offer.sender_user_id = v_user_id OR offer.recipient_user_id = v_user_id)
               AND offer.status <> 'pending')
        ORDER BY offer.created_at DESC, offer.id DESC
        LIMIT p_limit OFFSET p_offset
    ) AS offers;

    RETURN jsonb_build_object('status', 'ok', 'offers', v_offers, 'limit', p_limit, 'offset', p_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_trade_offers(TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trade_offers(TEXT, INTEGER, INTEGER) TO authenticated;

CREATE FUNCTION public.respond_to_trade_offer(p_offer_id UUID, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_offer public.trade_offers%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    SELECT * INTO v_offer
    FROM public.trade_offers AS offer
    WHERE offer.id = p_offer_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_offer.recipient_user_id <> v_user_id THEN
        RETURN jsonb_build_object('status', 'not_recipient');
    END IF;
    IF v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'not_pending');
    END IF;
    IF v_offer.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.trade_offers SET status = 'expired', responded_at = pg_catalog.clock_timestamp()
        WHERE id = v_offer.id;
        RETURN jsonb_build_object('status', 'expired');
    END IF;
    IF p_action IS NULL OR p_action NOT IN ('accept', 'decline') THEN
        RETURN jsonb_build_object('status', 'invalid_action');
    END IF;

    IF p_action = 'decline' THEN
        UPDATE public.trade_offers SET status = 'declined', responded_at = pg_catalog.clock_timestamp()
        WHERE id = v_offer.id;
        INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
        VALUES (
            v_offer.sender_user_id, v_offer.game_system_id, 'trade_offer_updated',
            jsonb_build_object('title', 'Oferta recusada', 'body', 'Sua oferta de troca foi recusada.', 'offer_id', v_offer.id, 'status', 'declined')
        );
        RETURN jsonb_build_object('status', 'declined', 'offer_id', v_offer.id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.characters AS character
        WHERE character.id = v_offer.sender_character_id
          AND character.user_id = v_offer.sender_user_id
          AND character.game_system_id = v_offer.game_system_id
          AND character.status = 'active'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.characters AS character
        WHERE character.id = v_offer.recipient_character_id
          AND character.user_id = v_offer.recipient_user_id
          AND character.game_system_id = v_offer.game_system_id
          AND character.status = 'active'
    ) THEN
        UPDATE public.trade_offers SET status = 'invalidated', responded_at = pg_catalog.clock_timestamp()
        WHERE id = v_offer.id;
        INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
        VALUES (
            v_offer.sender_user_id, v_offer.game_system_id, 'trade_offer_updated',
            jsonb_build_object('title', 'Oferta indisponível', 'body', 'Um dos personagens não está mais disponível para esta troca.', 'offer_id', v_offer.id, 'status', 'invalidated')
        );
        RETURN jsonb_build_object('status', 'invalidated', 'offer_id', v_offer.id);
    END IF;

    PERFORM inventory.id
    FROM public.character_inventory AS inventory
    JOIN public.trade_offer_lines AS line ON line.stack_id = inventory.id
    WHERE line.offer_id = v_offer.id
    ORDER BY inventory.id
    FOR UPDATE OF inventory;

    IF EXISTS (
        SELECT 1
        FROM public.trade_offer_lines AS line
        LEFT JOIN public.character_inventory AS inventory ON inventory.id = line.stack_id
        WHERE line.offer_id = v_offer.id
          AND (
              inventory.id IS NULL
              OR inventory.character_id IS DISTINCT FROM CASE line.side
                    WHEN 'sender' THEN v_offer.sender_character_id
                    ELSE v_offer.recipient_character_id
                 END
              OR inventory.item_id IS DISTINCT FROM line.item_id
              OR inventory.metadata IS DISTINCT FROM line.metadata_snapshot
              OR inventory.quantity < line.quantity
          )
    ) THEN
        UPDATE public.trade_offers SET status = 'invalidated', responded_at = pg_catalog.clock_timestamp()
        WHERE id = v_offer.id;
        INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
        VALUES (
            v_offer.sender_user_id, v_offer.game_system_id, 'trade_offer_updated',
            jsonb_build_object('title', 'Oferta indisponível', 'body', 'Um ou mais itens mudaram desde o envio da oferta.', 'offer_id', v_offer.id, 'status', 'invalidated')
        );
        RETURN jsonb_build_object('status', 'invalidated', 'offer_id', v_offer.id);
    END IF;

    DELETE FROM public.character_inventory AS inventory
    USING public.trade_offer_lines AS line
    WHERE line.offer_id = v_offer.id
      AND line.stack_id = inventory.id
      AND inventory.quantity = line.quantity;
    UPDATE public.character_inventory AS inventory
    SET quantity = inventory.quantity - line.quantity
    FROM public.trade_offer_lines AS line
    WHERE line.offer_id = v_offer.id
      AND line.stack_id = inventory.id
      AND inventory.quantity > line.quantity;

    INSERT INTO public.character_inventory (character_id, item_id, quantity, metadata)
    SELECT CASE line.side
               WHEN 'sender' THEN v_offer.recipient_character_id
               ELSE v_offer.sender_character_id
           END,
           line.item_id,
           line.quantity,
           line.metadata_snapshot
    FROM public.trade_offer_lines AS line
    WHERE line.offer_id = v_offer.id
    ON CONFLICT (character_id, item_id, metadata)
    DO UPDATE SET quantity = public.character_inventory.quantity + EXCLUDED.quantity;

    UPDATE public.trade_offers SET status = 'accepted', responded_at = pg_catalog.clock_timestamp()
    WHERE id = v_offer.id;
    INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
    VALUES (
        v_offer.sender_user_id, v_offer.game_system_id, 'trade_offer_updated',
        jsonb_build_object('title', 'Oferta aceita', 'body', 'Sua oferta de troca foi aceita.', 'offer_id', v_offer.id, 'status', 'accepted')
    );
    RETURN jsonb_build_object('status', 'accepted', 'offer_id', v_offer.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.respond_to_trade_offer(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_trade_offer(UUID, TEXT) TO authenticated;

CREATE FUNCTION public.cancel_trade_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_offer public.trade_offers%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    SELECT * INTO v_offer FROM public.trade_offers AS offer WHERE offer.id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_offer.sender_user_id <> v_user_id THEN
        RETURN jsonb_build_object('status', 'not_sender');
    END IF;
    IF v_offer.status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'not_pending');
    END IF;
    IF v_offer.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.trade_offers SET status = 'expired', responded_at = pg_catalog.clock_timestamp()
        WHERE id = v_offer.id;
        RETURN jsonb_build_object('status', 'expired');
    END IF;

    UPDATE public.trade_offers SET status = 'cancelled', responded_at = pg_catalog.clock_timestamp()
    WHERE id = v_offer.id;
    INSERT INTO public.notifications (recipient_user_id, game_system_id, type, payload)
    VALUES (
        v_offer.recipient_user_id, v_offer.game_system_id, 'trade_offer_updated',
        jsonb_build_object('title', 'Oferta cancelada', 'body', 'Uma oferta de troca foi cancelada.', 'offer_id', v_offer.id, 'status', 'cancelled')
    );
    RETURN jsonb_build_object('status', 'cancelled', 'offer_id', v_offer.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_trade_offer(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_trade_offer(UUID) TO authenticated;

COMMIT;
