BEGIN;

ALTER TABLE public.game_systems ADD COLUMN currency_name TEXT NOT NULL DEFAULT 'Créditos'
    CHECK (char_length(btrim(currency_name)) BETWEEN 1 AND 80);
ALTER TABLE public.daily_login_rewards ADD COLUMN currency_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (currency_amount >= 0);
ALTER TABLE public.daily_login_claims
    ADD COLUMN currency_awarded NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (currency_awarded >= 0),
    ADD COLUMN currency_name_snapshot TEXT NOT NULL DEFAULT 'Créditos';

CREATE TABLE public.character_wallets (
    character_id UUID PRIMARY KEY,
    game_system_id UUID NOT NULL,
    balance NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    FOREIGN KEY (character_id, game_system_id) REFERENCES public.characters(id, game_system_id) ON DELETE CASCADE,
    UNIQUE (character_id, game_system_id)
);
CREATE TABLE public.character_currency_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL,
    game_system_id UUID NOT NULL,
    amount NUMERIC(16,2) NOT NULL CHECK (amount <> 0),
    balance_after NUMERIC(16,2) NOT NULL CHECK (balance_after >= 0),
    source_type TEXT NOT NULL CHECK (btrim(source_type) <> ''),
    source_id UUID NOT NULL,
    currency_name_snapshot TEXT NOT NULL,
    item_id_snapshot UUID,
    item_name_snapshot TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (character_id, game_system_id) REFERENCES public.character_wallets(character_id, game_system_id) ON DELETE CASCADE,
    UNIQUE (source_type, source_id)
);
CREATE INDEX character_currency_ledger_character_idx ON public.character_currency_ledger(character_id, created_at DESC);
ALTER TABLE public.character_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_currency_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_wallets, public.character_currency_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.character_wallets, public.character_currency_ledger TO authenticated;
CREATE POLICY wallets_read_own ON public.character_wallets FOR SELECT TO authenticated
    USING (private.owns_character(character_id));
CREATE POLICY currency_ledger_read_own ON public.character_currency_ledger FOR SELECT TO authenticated
    USING (private.owns_character(character_id));

CREATE FUNCTION private.create_character_wallet() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
    INSERT INTO public.character_wallets(character_id,game_system_id) VALUES (NEW.id,NEW.game_system_id);
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.create_character_wallet() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER characters_create_wallet AFTER INSERT ON public.characters
    FOR EACH ROW EXECUTE FUNCTION private.create_character_wallet();
INSERT INTO public.character_wallets(character_id,game_system_id) SELECT id,game_system_id FROM public.characters;

-- Snapshots are written before the existing claim and XP triggers run.
CREATE FUNCTION private.snapshot_daily_login_currency() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
    SELECT reward.currency_amount, system.currency_name
    INTO NEW.currency_awarded, NEW.currency_name_snapshot
    FROM public.daily_login_rewards reward
    JOIN public.game_systems system ON system.id=reward.game_system_id
    WHERE reward.game_system_id=NEW.game_system_id AND reward.weekday=NEW.weekday;
    RETURN NEW;
END;
$function$;
CREATE FUNCTION private.grant_daily_login_currency() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_balance NUMERIC(16,2);
BEGIN
    IF NEW.currency_awarded > 0 THEN
        UPDATE public.character_wallets SET balance=balance+NEW.currency_awarded
        WHERE character_id=NEW.character_id RETURNING balance INTO v_balance;
        INSERT INTO public.character_currency_ledger(character_id,game_system_id,amount,balance_after,source_type,source_id,currency_name_snapshot,item_id_snapshot,item_name_snapshot)
        VALUES (NEW.character_id,NEW.game_system_id,NEW.currency_awarded,v_balance,'daily_login',NEW.id,NEW.currency_name_snapshot,NEW.item_id,NEW.item_name_snapshot);
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.snapshot_daily_login_currency(), private.grant_daily_login_currency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER daily_login_currency_snapshot BEFORE INSERT ON public.daily_login_claims
    FOR EACH ROW EXECUTE FUNCTION private.snapshot_daily_login_currency();
CREATE TRIGGER daily_login_currency_grant AFTER INSERT ON public.daily_login_claims
    FOR EACH ROW EXECUTE FUNCTION private.grant_daily_login_currency();

CREATE FUNCTION public.purchase_store_product(p_character_id UUID,p_store_product_id UUID,p_quantity INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
    v_character public.characters%ROWTYPE;
    v_offer public.store_products%ROWTYPE;
    v_item public.items%ROWTYPE;
    v_currency TEXT;
    v_balance NUMERIC(16,2);
    v_amount NUMERIC;
    v_purchase_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
    IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000000 THEN
        RETURN jsonb_build_object('status','invalid_quantity');
    END IF;
    SELECT * INTO v_character FROM public.characters
    WHERE id=p_character_id AND user_id=auth.uid() AND status='active' FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid_character'); END IF;
    SELECT currency_name INTO v_currency FROM public.game_systems
    WHERE id=v_character.game_system_id AND is_active FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','system_unavailable'); END IF;
    SELECT * INTO v_offer FROM public.store_products WHERE id=p_store_product_id FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','offer_unavailable'); END IF;
    IF v_offer.game_system_id <> v_character.game_system_id THEN
        RETURN jsonb_build_object('status','system_mismatch');
    END IF;
    IF NOT v_offer.is_available THEN RETURN jsonb_build_object('status','offer_unavailable'); END IF;
    SELECT item.* INTO v_item FROM public.products product JOIN public.items item
        ON item.id=product.item_id AND item.game_system_id=product.game_system_id
    WHERE product.id=v_offer.product_id AND product.game_system_id=v_character.game_system_id
    FOR SHARE OF product,item;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','offer_unavailable'); END IF;
    SELECT balance INTO v_balance FROM public.character_wallets WHERE character_id=p_character_id FOR UPDATE;
    v_amount := v_offer.price*p_quantity;
    -- NUMERIC(12,2) purchase history bounds also bound the total charge.
    IF v_amount > 9999999999.99 THEN RETURN jsonb_build_object('status','invalid_quantity'); END IF;
    IF v_balance < v_amount THEN
        RETURN jsonb_build_object('status','insufficient_funds','balance',v_balance);
    END IF;
    UPDATE public.character_wallets SET balance=balance-v_amount WHERE character_id=p_character_id
    RETURNING balance INTO v_balance;
    INSERT INTO public.purchases(user_id,game_system_id,character_id,total_amount,currency_code)
    VALUES (auth.uid(),v_character.game_system_id,p_character_id,v_amount,v_currency) RETURNING id INTO v_purchase_id;
    INSERT INTO public.purchase_items(purchase_id,store_product_id,game_system_id,quantity,unit_price,product_name)
    VALUES(v_purchase_id,p_store_product_id,v_character.game_system_id,p_quantity,v_offer.price,v_item.name);
    INSERT INTO public.character_inventory(character_id,item_id,quantity) VALUES(p_character_id,v_item.id,p_quantity)
    ON CONFLICT(character_id,item_id,metadata) DO UPDATE SET quantity=public.character_inventory.quantity+EXCLUDED.quantity;
    IF v_amount > 0 THEN
        INSERT INTO public.character_currency_ledger(character_id,game_system_id,amount,balance_after,source_type,source_id,currency_name_snapshot,item_id_snapshot,item_name_snapshot)
        VALUES(p_character_id,v_character.game_system_id,-v_amount,v_balance,'purchase',v_purchase_id,v_currency,v_item.id,v_item.name);
    END IF;
    RETURN jsonb_build_object('status','purchased','balance',v_balance,'purchase_id',v_purchase_id,
        'item_id',v_item.id,'item_name',v_item.name,'quantity',p_quantity,'amount_charged',v_amount,'currency_name',v_currency);
END;
$function$;
REVOKE ALL ON FUNCTION public.purchase_store_product(UUID,UUID,INTEGER) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchase_store_product(UUID,UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION private._set_daily_login_reward_schedule(
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

    IF NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
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
    FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER, currency_amount NUMERIC);

    IF v_row_count <> 7 OR v_weekday_count <> 7
       OR v_min_weekday <> 1 OR v_max_weekday <> 7 THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER, currency_amount NUMERIC)
        LEFT JOIN public.items AS item
          ON item.id = reward.item_id
         AND item.game_system_id = p_game_system_id
        WHERE reward.weekday IS NULL
           OR reward.item_id IS NULL
           OR reward.quantity IS NULL
           OR reward.quantity NOT BETWEEN 1 AND 1000000
           OR COALESCE(reward.currency_amount, 0) < 0
           OR COALESCE(reward.currency_amount, 0) > 9999999999.99
           OR COALESCE(reward.currency_amount, 0) <> round(COALESCE(reward.currency_amount, 0), 2)
           OR item.id IS NULL
    ) THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;

    DELETE FROM public.daily_login_rewards
    WHERE game_system_id = p_game_system_id;

    INSERT INTO public.daily_login_rewards (game_system_id, weekday, item_id, quantity, currency_amount)
    SELECT p_game_system_id, reward.weekday, reward.item_id, reward.quantity, COALESCE(reward.currency_amount, 0)
    FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER, currency_amount NUMERIC);

    UPDATE public.game_systems
    SET daily_login_rewards_enabled = p_is_active,
        updated_at = now()
    WHERE id = p_game_system_id;

    RETURN jsonb_build_object('status', 'updated');
END;
$function$;

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
        'weekday', v_weekday, 'local_claim_date', v_local_date, 'timezone', v_timezone,
        'currency_awarded', (SELECT currency_awarded FROM public.daily_login_claims WHERE id=v_claim_id),
        'currency_name', (SELECT currency_name_snapshot FROM public.daily_login_claims WHERE id=v_claim_id)
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


COMMIT;
