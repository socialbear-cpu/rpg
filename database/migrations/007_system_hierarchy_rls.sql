-- Adds the role-based RLS policies omitted from the initial hierarchy migration.
BEGIN;

CREATE OR REPLACE FUNCTION private.owns_character(p_character_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.characters AS character
           WHERE character.id = p_character_id
             AND character.user_id = (SELECT auth.uid())
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
           WHERE member.campaign_id = p_campaign_id
             AND character.user_id = (SELECT auth.uid())
       );
$function$;

REVOKE ALL ON FUNCTION private.owns_character(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_campaign_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owns_character(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_campaign_member(UUID) TO authenticated;

-- Expose app tables only through row policies. Admins have global app-data
-- access; normal accounts receive only the scoped policies defined below.
DO $function$
DECLARE
    v_table_name TEXT;
BEGIN
    FOREACH v_table_name IN ARRAY ARRAY[
        'users', 'user_profiles', 'game_systems', 'game_system_memberships',
        'characters', 'abilities', 'items', 'achievements', 'user_achievements',
        'character_achievements', 'character_abilities', 'character_inventory',
        'products', 'store_products', 'purchases', 'purchase_items', 'campaigns',
        'campaign_members', 'chat_rooms', 'messages', 'daily_login_rewards',
        'daily_login_claims'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin())',
            v_table_name || '_platform_admin_all', v_table_name
        );
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_profile_system_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NOT private.is_platform_admin()
       AND (OLD.user_id IS DISTINCT FROM NEW.user_id
            OR OLD.created_at IS DISTINCT FROM NEW.created_at
            OR OLD.updated_at IS DISTINCT FROM NEW.updated_at) THEN
        RAISE EXCEPTION 'Only a platform admin can update protected profile fields'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_profile_system_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER user_profiles_guard_system_fields
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION private.guard_profile_system_fields();

CREATE POLICY game_systems_read_available
    ON public.game_systems FOR SELECT TO authenticated
    USING (is_active OR private.has_system_role(id, ARRAY['owner', 'mod', 'user']));
CREATE POLICY game_systems_create_as_owner
    ON public.game_systems FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND owner_user_id = (SELECT auth.uid()));
CREATE POLICY game_systems_owner_update
    ON public.game_systems FOR UPDATE TO authenticated
    USING (private.has_system_role(id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(id, ARRAY['owner']));
CREATE POLICY game_systems_owner_delete
    ON public.game_systems FOR DELETE TO authenticated
    USING (private.has_system_role(id, ARRAY['owner']));

CREATE POLICY characters_read_own
    ON public.characters FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
CREATE POLICY characters_insert_own
    ON public.characters FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY characters_update_own
    ON public.characters FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY characters_delete_own
    ON public.characters FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY abilities_read_system
    ON public.abilities FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active));
CREATE POLICY abilities_owner_manage
    ON public.abilities FOR ALL TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));
CREATE POLICY items_read_system
    ON public.items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active));
CREATE POLICY items_owner_manage
    ON public.items FOR ALL TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));
CREATE POLICY achievements_read_available
    ON public.achievements FOR SELECT TO authenticated
    USING (game_system_id IS NULL OR EXISTS (
        SELECT 1 FROM public.game_systems AS system
        WHERE system.id = game_system_id AND system.is_active
    ));
CREATE POLICY achievements_owner_manage
    ON public.achievements FOR ALL TO authenticated
    USING (game_system_id IS NOT NULL AND private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (game_system_id IS NOT NULL AND private.has_system_role(game_system_id, ARRAY['owner']));

CREATE POLICY user_achievements_read_own
    ON public.user_achievements FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
CREATE POLICY character_achievements_read_own
    ON public.character_achievements FOR SELECT TO authenticated
    USING (private.owns_character(character_id));
CREATE POLICY character_abilities_read_own
    ON public.character_abilities FOR SELECT TO authenticated
    USING (private.owns_character(character_id));
CREATE POLICY character_inventory_read_own
    ON public.character_inventory FOR SELECT TO authenticated
    USING (private.owns_character(character_id));

CREATE POLICY products_read_system
    ON public.products FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active));
CREATE POLICY products_owner_manage
    ON public.products FOR ALL TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));
CREATE POLICY store_products_read_system
    ON public.store_products FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.game_systems AS system WHERE system.id = game_system_id AND system.is_active));
CREATE POLICY store_products_owner_manage
    ON public.store_products FOR ALL TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));

CREATE POLICY purchases_read_own
    ON public.purchases FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
CREATE POLICY purchase_items_read_own
    ON public.purchase_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.purchases AS purchase
        WHERE purchase.id = purchase_id AND purchase.user_id = (SELECT auth.uid())
    ));

CREATE POLICY campaigns_read_member_or_system_owner
    ON public.campaigns FOR SELECT TO authenticated
    USING (
        owner_user_id = (SELECT auth.uid())
        OR private.has_system_role(game_system_id, ARRAY['owner'])
        OR private.is_campaign_member(id)
    );
CREATE POLICY campaigns_insert_own
    ON public.campaigns FOR INSERT TO authenticated
    WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY campaigns_update_own
    ON public.campaigns FOR UPDATE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()))
    WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY campaigns_delete_own
    ON public.campaigns FOR DELETE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()));
CREATE POLICY campaign_members_read_member_or_system_owner
    ON public.campaign_members FOR SELECT TO authenticated
    USING (
        private.owns_character(character_id)
        OR private.has_system_role(game_system_id, ARRAY['owner'])
        OR EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = campaign_members.campaign_id AND campaign.owner_user_id = (SELECT auth.uid())
        )
    );
CREATE POLICY campaign_members_manage_campaign_owner
    ON public.campaign_members FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.campaigns AS campaign
        WHERE campaign.id = campaign_members.campaign_id AND campaign.owner_user_id = (SELECT auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.campaigns AS campaign
        WHERE campaign.id = campaign_members.campaign_id AND campaign.owner_user_id = (SELECT auth.uid())
    ));

CREATE POLICY chat_rooms_read_campaign_member_or_system_owner
    ON public.chat_rooms FOR SELECT TO authenticated
    USING (
        private.is_campaign_member(campaign_id)
        OR EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = chat_rooms.campaign_id
              AND private.has_system_role(campaign.game_system_id, ARRAY['owner'])
        )
    );
CREATE POLICY chat_rooms_owner_manage
    ON public.chat_rooms FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.campaigns AS campaign
        WHERE campaign.id = chat_rooms.campaign_id
          AND private.has_system_role(campaign.game_system_id, ARRAY['owner'])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.campaigns AS campaign
        WHERE campaign.id = chat_rooms.campaign_id
          AND private.has_system_role(campaign.game_system_id, ARRAY['owner'])
    ));

CREATE POLICY messages_read_campaign_member_or_system_owner
    ON public.messages FOR SELECT TO authenticated
    USING (
        private.is_campaign_member(campaign_id)
        OR EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = messages.campaign_id
              AND private.has_system_role(campaign.game_system_id, ARRAY['owner'])
        )
    );
CREATE POLICY messages_insert_campaign_character
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        private.owns_character(character_id)
        AND private.is_campaign_member(campaign_id)
    );
CREATE POLICY messages_update_own_character
    ON public.messages FOR UPDATE TO authenticated
    USING (private.owns_character(character_id))
    WITH CHECK (private.owns_character(character_id));
CREATE POLICY messages_delete_own_character
    ON public.messages FOR DELETE TO authenticated
    USING (private.owns_character(character_id));

CREATE POLICY daily_login_claims_read_admin
    ON public.daily_login_claims FOR SELECT TO authenticated
    USING (private.is_platform_admin());


COMMIT;

