BEGIN;

CREATE OR REPLACE FUNCTION private.can_access_game_system(p_game_system_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
       AND (
           private.is_platform_admin()
           OR EXISTS (
               SELECT 1
               FROM public.game_systems AS system
               WHERE system.id = p_game_system_id
                 AND (
                     system.is_public
                     OR private.has_system_role(p_game_system_id, ARRAY['owner', 'mod', 'user'])
                 )
           )
       );
$function$;
REVOKE ALL ON FUNCTION private.can_access_game_system(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_game_system(UUID) TO authenticated;

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
    IF NOT private.has_system_role(p_system_id, ARRAY['owner']) THEN
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

-- Keep the bcrypt hash available only to the private SECURITY DEFINER functions.
REVOKE SELECT, UPDATE ON TABLE public.game_systems FROM authenticated;
GRANT SELECT (
    id, slug, name, description, is_active, created_at, updated_at, owner_user_id,
    daily_login_timezone, daily_login_rewards_enabled, currency_name, is_public
) ON TABLE public.game_systems TO authenticated;
GRANT UPDATE (
    name, description, daily_login_timezone, daily_login_rewards_enabled,
    currency_name, is_public, updated_at
) ON TABLE public.game_systems TO authenticated;

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
        'currency_awarded', (SELECT currency_awarded FROM public.daily_login_claims WHERE id = v_claim_id),
        'currency_name', (SELECT currency_name_snapshot FROM public.daily_login_claims WHERE id = v_claim_id)
    );
END;
$function$;

DROP POLICY IF EXISTS game_system_character_sheets_read_available ON public.game_system_character_sheets;
CREATE POLICY game_system_character_sheets_read_available
    ON public.game_system_character_sheets FOR SELECT TO authenticated
    USING (
        private.has_system_role(game_system_id, ARRAY['owner', 'mod', 'user'])
        OR EXISTS (
            SELECT 1 FROM public.game_systems AS system
            WHERE system.id = game_system_id
              AND system.is_active
              AND private.can_access_game_system(system.id)
        )
    );

CREATE OR REPLACE FUNCTION private.owns_character(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.characters AS character
           WHERE character.id = p_character_id
             AND character.user_id = (SELECT auth.uid())
             AND private.can_access_game_system(character.game_system_id)
       );
$function$;

CREATE OR REPLACE FUNCTION private.is_campaign_member(p_campaign_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.campaign_members AS member
           JOIN public.characters AS character ON character.id = member.character_id
           JOIN public.campaigns AS campaign ON campaign.id = member.campaign_id
           WHERE member.campaign_id = p_campaign_id
             AND character.user_id = (SELECT auth.uid())
             AND private.can_access_game_system(campaign.game_system_id)
       );
$function$;

DROP POLICY IF EXISTS characters_read_own ON public.characters;
CREATE POLICY characters_read_own
    ON public.characters FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS characters_insert_own ON public.characters;
CREATE POLICY characters_insert_own
    ON public.characters FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS characters_update_own ON public.characters;
CREATE POLICY characters_update_own
    ON public.characters FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id))
    WITH CHECK (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS characters_delete_own ON public.characters;
CREATE POLICY characters_delete_own
    ON public.characters FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));

DROP POLICY IF EXISTS abilities_read_system ON public.abilities;
CREATE POLICY abilities_read_system
    ON public.abilities FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active)
    );
DROP POLICY IF EXISTS items_read_system ON public.items;
CREATE POLICY items_read_system
    ON public.items FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active)
    );
DROP POLICY IF EXISTS achievements_read_available ON public.achievements;
CREATE POLICY achievements_read_available
    ON public.achievements FOR SELECT TO authenticated
    USING (
        game_system_id IS NULL
        OR (
            private.can_access_game_system(game_system_id)
            AND EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active)
        )
    );
DROP POLICY IF EXISTS products_read_system ON public.products;
CREATE POLICY products_read_system
    ON public.products FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active)
    );
DROP POLICY IF EXISTS store_products_read_system ON public.store_products;
CREATE POLICY store_products_read_system
    ON public.store_products FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active)
    );

DROP POLICY IF EXISTS daily_login_rewards_read ON public.daily_login_rewards;
CREATE POLICY daily_login_rewards_read
    ON public.daily_login_rewards FOR SELECT TO authenticated
    USING (
        private.has_system_role(game_system_id, ARRAY['owner'])
        OR (
            private.can_access_game_system(game_system_id)
            AND EXISTS (
                SELECT 1 FROM public.game_systems AS system
                WHERE system.id = game_system_id
                  AND system.is_active
                  AND system.daily_login_rewards_enabled
            )
        )
    );
DROP POLICY IF EXISTS daily_login_own_claims_read ON public.daily_login_claims;
CREATE POLICY daily_login_own_claims_read
    ON public.daily_login_claims FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS daily_login_claims_read_admin ON public.daily_login_claims;
CREATE POLICY daily_login_claims_read_admin
    ON public.daily_login_claims FOR SELECT TO authenticated
    USING (private.is_platform_admin());

DROP POLICY IF EXISTS purchases_read_own ON public.purchases;
CREATE POLICY purchases_read_own
    ON public.purchases FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS purchase_items_read_own ON public.purchase_items;
CREATE POLICY purchase_items_read_own
    ON public.purchase_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.purchases AS purchase
        WHERE purchase.id = purchase_id
          AND purchase.user_id = (SELECT auth.uid())
          AND private.can_access_game_system(purchase.game_system_id)
    ));

DROP POLICY IF EXISTS campaigns_read_member_or_system_owner ON public.campaigns;
CREATE POLICY campaigns_read_member_or_system_owner
    ON public.campaigns FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND (
            owner_user_id = (SELECT auth.uid())
            OR private.has_system_role(game_system_id, ARRAY['owner'])
            OR private.is_campaign_member(id)
        )
    );
DROP POLICY IF EXISTS campaigns_insert_own ON public.campaigns;
CREATE POLICY campaigns_insert_own
    ON public.campaigns FOR INSERT TO authenticated
    WITH CHECK (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS campaigns_update_own ON public.campaigns;
CREATE POLICY campaigns_update_own
    ON public.campaigns FOR UPDATE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id))
    WITH CHECK (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
DROP POLICY IF EXISTS campaigns_delete_own ON public.campaigns;
CREATE POLICY campaigns_delete_own
    ON public.campaigns FOR DELETE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));

DROP POLICY IF EXISTS campaign_members_read_member_or_system_owner ON public.campaign_members;
CREATE POLICY campaign_members_read_member_or_system_owner
    ON public.campaign_members FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND (
            private.owns_character(character_id)
            OR private.has_system_role(game_system_id, ARRAY['owner'])
            OR EXISTS (
                SELECT 1 FROM public.campaigns AS campaign
                WHERE campaign.id = campaign_members.campaign_id
                  AND campaign.owner_user_id = (SELECT auth.uid())
            )
        )
    );
DROP POLICY IF EXISTS campaign_members_manage_campaign_owner ON public.campaign_members;
CREATE POLICY campaign_members_manage_campaign_owner
    ON public.campaign_members FOR ALL TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND EXISTS (SELECT 1 FROM public.campaigns AS campaign
                    WHERE campaign.id = campaign_members.campaign_id
                      AND campaign.owner_user_id = (SELECT auth.uid()))
    )
    WITH CHECK (
        private.can_access_game_system(game_system_id)
        AND EXISTS (SELECT 1 FROM public.campaigns AS campaign
                    WHERE campaign.id = campaign_members.campaign_id
                      AND campaign.owner_user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS chat_rooms_read_campaign_member_or_system_owner ON public.chat_rooms;
CREATE POLICY chat_rooms_read_campaign_member_or_system_owner
    ON public.chat_rooms FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = chat_rooms.campaign_id
              AND private.can_access_game_system(campaign.game_system_id)
              AND (
                  private.is_campaign_member(campaign.id)
                  OR private.has_system_role(campaign.game_system_id, ARRAY['owner'])
              )
        )
    );
DROP POLICY IF EXISTS chat_rooms_owner_manage ON public.chat_rooms;
CREATE POLICY chat_rooms_owner_manage
    ON public.chat_rooms FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.campaigns AS campaign
        WHERE campaign.id = chat_rooms.campaign_id
          AND private.can_access_game_system(campaign.game_system_id)
          AND private.has_system_role(campaign.game_system_id, ARRAY['owner'])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.campaigns AS campaign
        WHERE campaign.id = chat_rooms.campaign_id
          AND private.can_access_game_system(campaign.game_system_id)
          AND private.has_system_role(campaign.game_system_id, ARRAY['owner'])
    ));

DROP POLICY IF EXISTS messages_read_campaign_member_or_system_owner ON public.messages;
CREATE POLICY messages_read_campaign_member_or_system_owner
    ON public.messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = messages.campaign_id
              AND private.can_access_game_system(campaign.game_system_id)
              AND (
                  private.is_campaign_member(campaign.id)
                  OR private.has_system_role(campaign.game_system_id, ARRAY['owner'])
              )
        )
    );
DROP POLICY IF EXISTS messages_insert_campaign_character ON public.messages;
CREATE POLICY messages_insert_campaign_character
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        private.owns_character(character_id)
        AND private.is_campaign_member(campaign_id)
        AND EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = messages.campaign_id
              AND private.can_access_game_system(campaign.game_system_id)
        )
    );
DROP POLICY IF EXISTS messages_update_own_character ON public.messages;
CREATE POLICY messages_update_own_character
    ON public.messages FOR UPDATE TO authenticated
    USING (private.owns_character(character_id))
    WITH CHECK (private.owns_character(character_id));
DROP POLICY IF EXISTS messages_delete_own_character ON public.messages;
CREATE POLICY messages_delete_own_character
    ON public.messages FOR DELETE TO authenticated
    USING (private.owns_character(character_id));

CREATE OR REPLACE FUNCTION private._take_daily_login_popup(p_game_system_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_timezone TEXT;
    v_day DATE;
    v_inserted UUID;
BEGIN
    IF v_user IS NULL OR NOT private.can_access_game_system(p_game_system_id) THEN
        RETURN FALSE;
    END IF;
    SELECT daily_login_timezone INTO v_timezone
    FROM public.game_systems
    WHERE id = p_game_system_id AND is_active AND daily_login_rewards_enabled;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.characters
        WHERE user_id = v_user AND game_system_id = p_game_system_id AND status = 'active'
    ) THEN RETURN FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_timezone) THEN
        RETURN FALSE;
    END IF;
    v_day := (clock_timestamp() AT TIME ZONE v_timezone)::DATE;
    INSERT INTO public.daily_login_system_popup_views (user_id, game_system_id, viewed_on)
    VALUES (v_user, p_game_system_id, v_day)
    ON CONFLICT (user_id, game_system_id) DO UPDATE SET viewed_on = EXCLUDED.viewed_on
    WHERE daily_login_system_popup_views.viewed_on < EXCLUDED.viewed_on
    RETURNING user_id INTO v_inserted;
    RETURN v_inserted IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION private._get_character_xp_summary(p_character_id UUID)
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
    WHERE character.id = p_character_id
      AND character.user_id = auth.uid()
      AND private.can_access_game_system(character.game_system_id);
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT settings.xp_per_level INTO v_xp_per_level
    FROM public.game_system_xp_settings AS settings
    WHERE settings.game_system_id = v_game_system_id;
    v_xp_per_level := COALESCE(v_xp_per_level, 100);

    SELECT COALESCE(sum(ledger.amount), 0)::BIGINT INTO v_total_xp
    FROM public.character_xp_ledger AS ledger
    WHERE ledger.character_id = p_character_id;

    SELECT COALESCE(jsonb_agg(history.entry ORDER BY history.created_at DESC), '[]'::JSONB)
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

COMMIT;
