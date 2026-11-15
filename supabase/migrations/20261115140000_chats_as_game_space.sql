BEGIN;

-- Replace the campaign/room vocabulary with a single chat entity while keeping
-- the existing primary IDs, participants, and message content.
DROP POLICY IF EXISTS campaigns_platform_admin_all ON public.campaigns;
DROP POLICY IF EXISTS campaigns_read_member_or_system_owner ON public.campaigns;
DROP POLICY IF EXISTS campaigns_insert_own ON public.campaigns;
DROP POLICY IF EXISTS campaigns_update_own ON public.campaigns;
DROP POLICY IF EXISTS campaigns_delete_own ON public.campaigns;
DROP POLICY IF EXISTS campaign_members_platform_admin_all ON public.campaign_members;
DROP POLICY IF EXISTS campaign_members_read_member_or_system_owner ON public.campaign_members;
DROP POLICY IF EXISTS campaign_members_manage_campaign_owner ON public.campaign_members;
DROP POLICY IF EXISTS chat_rooms_platform_admin_all ON public.chat_rooms;
DROP POLICY IF EXISTS chat_rooms_read_campaign_member_or_system_owner ON public.chat_rooms;
DROP POLICY IF EXISTS chat_rooms_owner_manage ON public.chat_rooms;
DROP POLICY IF EXISTS chat_rooms_create_campaign_hosts ON public.chat_rooms;
DROP POLICY IF EXISTS messages_read_campaign_member_or_system_owner ON public.messages;
DROP POLICY IF EXISTS messages_insert_campaign_character ON public.messages;

DROP FUNCTION IF EXISTS public.create_system_campaign(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS private.create_system_campaign_impl(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS private.is_campaign_member(UUID);

ALTER TABLE public.campaigns RENAME TO chats;
ALTER TABLE public.campaign_members RENAME TO chat_members;
ALTER TABLE public.chat_members RENAME COLUMN campaign_id TO chat_id;
ALTER TABLE public.chat_rooms RENAME COLUMN campaign_id TO chat_id;
ALTER TABLE public.messages RENAME COLUMN campaign_id TO chat_id;

ALTER TABLE public.chats RENAME CONSTRAINT campaigns_pkey TO chats_pkey;
ALTER TABLE public.chats RENAME CONSTRAINT campaigns_game_system_id_fkey TO chats_game_system_id_fkey;
ALTER TABLE public.chats RENAME CONSTRAINT campaigns_owner_user_id_fkey TO chats_owner_user_id_fkey;
ALTER TABLE public.chats RENAME CONSTRAINT campaigns_id_game_system_id_key TO chats_id_game_system_id_key;
ALTER TABLE public.chats RENAME CONSTRAINT campaigns_status_check TO chats_status_check;
ALTER TABLE public.chat_members RENAME CONSTRAINT campaign_members_pkey TO chat_members_pkey;
ALTER TABLE public.chat_members RENAME CONSTRAINT campaign_members_campaign_id_game_system_id_fkey TO chat_members_chat_id_game_system_id_fkey;
ALTER TABLE public.chat_members RENAME CONSTRAINT campaign_members_character_id_game_system_id_fkey TO chat_members_character_id_game_system_id_fkey;
ALTER TABLE public.chat_members RENAME CONSTRAINT campaign_members_role_check TO chat_members_role_check;
ALTER TABLE public.messages RENAME CONSTRAINT messages_campaign_id_character_id_fkey TO messages_chat_id_character_id_fkey;

ALTER TABLE public.messages DROP COLUMN room_id;
DROP TABLE public.chat_rooms;
DROP INDEX IF EXISTS public.messages_room_created_idx;
CREATE INDEX messages_chat_created_idx ON public.messages (chat_id, created_at, id);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_chat_member(p_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.chat_members AS member
           JOIN public.characters AS character ON character.id = member.character_id
           JOIN public.chats AS chat ON chat.id = member.chat_id
           WHERE member.chat_id = p_chat_id
             AND character.user_id = (SELECT auth.uid())
             AND private.can_access_game_system(chat.game_system_id)
       );
$function$;
REVOKE ALL ON FUNCTION private.is_chat_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_chat_member(UUID) TO authenticated;

CREATE POLICY chats_platform_admin_all
    ON public.chats FOR ALL TO authenticated
    USING (private.is_platform_admin())
    WITH CHECK (private.is_platform_admin());
CREATE POLICY chats_read_member_or_system_owner
    ON public.chats FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND (
            owner_user_id = (SELECT auth.uid())
            OR private.has_system_role(game_system_id, ARRAY['owner'])
            OR private.is_chat_member(id)
        )
    );
CREATE POLICY chats_update_own
    ON public.chats FOR UPDATE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id))
    WITH CHECK (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));
CREATE POLICY chats_delete_own
    ON public.chats FOR DELETE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()) AND private.can_access_game_system(game_system_id));

CREATE POLICY chat_members_platform_admin_all
    ON public.chat_members FOR ALL TO authenticated
    USING (private.is_platform_admin())
    WITH CHECK (private.is_platform_admin());
CREATE POLICY chat_members_read_member_or_system_owner
    ON public.chat_members FOR SELECT TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND (
            private.owns_character(character_id)
            OR private.has_system_role(game_system_id, ARRAY['owner'])
            OR EXISTS (
                SELECT 1 FROM public.chats AS chat
                WHERE chat.id = chat_members.chat_id
                  AND chat.owner_user_id = (SELECT auth.uid())
            )
        )
    );
CREATE POLICY chat_members_manage_chat_owner
    ON public.chat_members FOR ALL TO authenticated
    USING (
        private.can_access_game_system(game_system_id)
        AND EXISTS (
            SELECT 1 FROM public.chats AS chat
            WHERE chat.id = chat_members.chat_id
              AND chat.owner_user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        private.can_access_game_system(game_system_id)
        AND EXISTS (
            SELECT 1 FROM public.chats AS chat
            WHERE chat.id = chat_members.chat_id
              AND chat.owner_user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY messages_read_chat_member_or_system_owner
    ON public.messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.chats AS chat
            WHERE chat.id = messages.chat_id
              AND private.can_access_game_system(chat.game_system_id)
              AND (
                  private.is_chat_member(chat.id)
                  OR private.has_system_role(chat.game_system_id, ARRAY['owner'])
              )
        )
    );
CREATE POLICY messages_insert_chat_character
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        private.owns_character(character_id)
        AND private.is_chat_member(chat_id)
        AND EXISTS (
            SELECT 1 FROM public.chats AS chat
            WHERE chat.id = messages.chat_id
              AND private.can_access_game_system(chat.game_system_id)
        )
    );

CREATE FUNCTION private.create_system_chat_impl(
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
    v_chat_id UUID;
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

    INSERT INTO public.chats (game_system_id, owner_user_id, name, description)
    VALUES (p_game_system_id, v_user_id, v_name, NULLIF(v_description, ''))
    RETURNING id, created_at INTO v_chat_id, v_created_at;

    INSERT INTO public.chat_members (chat_id, character_id, game_system_id, role)
    VALUES (v_chat_id, p_character_id, p_game_system_id, 'game_master');

    RETURN jsonb_build_object(
        'status', 'created',
        'character_id', p_character_id,
        'chat', jsonb_build_object(
            'id', v_chat_id,
            'game_system_id', p_game_system_id,
            'name', v_name,
            'description', NULLIF(v_description, ''),
            'status', 'active',
            'created_at', v_created_at
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION private.create_system_chat_impl(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_system_chat_impl(UUID, UUID, TEXT, TEXT) TO authenticated;

CREATE FUNCTION public.create_system_chat(
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
    SELECT private.create_system_chat_impl(
        p_game_system_id,
        p_character_id,
        p_name,
        p_description
    );
$function$;
REVOKE ALL ON FUNCTION public.create_system_chat(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_system_chat(UUID, UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION private._manage_game_system_lifecycle(p_system_id UUID, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_action IS NULL OR p_action NOT IN ('archive', 'activate', 'delete') THEN
        RETURN jsonb_build_object('status', 'invalid_action');
    END IF;
    IF NOT private.has_system_role(p_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;

    PERFORM 1
    FROM public.game_systems
    WHERE id = p_system_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF p_action IN ('archive', 'activate') THEN
        UPDATE public.game_systems
        SET is_active = (p_action = 'activate'), updated_at = now()
        WHERE id = p_system_id;
        RETURN jsonb_build_object(
            'status', CASE WHEN p_action = 'archive' THEN 'archived' ELSE 'activated' END,
            'is_active', p_action = 'activate'
        );
    END IF;

    DELETE FROM public.notifications WHERE game_system_id = p_system_id;
    DELETE FROM public.character_xp_ledger WHERE game_system_id = p_system_id;
    DELETE FROM public.daily_login_claims WHERE game_system_id = p_system_id;
    DELETE FROM public.trade_offer_lines WHERE game_system_id = p_system_id;
    DELETE FROM public.trade_offers WHERE game_system_id = p_system_id;
    DELETE FROM public.purchase_items WHERE game_system_id = p_system_id;
    DELETE FROM public.purchases WHERE game_system_id = p_system_id;
    DELETE FROM public.daily_login_rewards WHERE game_system_id = p_system_id;
    DELETE FROM public.store_products WHERE game_system_id = p_system_id;
    DELETE FROM public.products WHERE game_system_id = p_system_id;
    DELETE FROM public.character_inventory
    WHERE character_id IN (
        SELECT game_character.id FROM public.characters AS game_character
        WHERE game_character.game_system_id = p_system_id
    );
    DELETE FROM public.chats WHERE game_system_id = p_system_id;
    DELETE FROM public.characters WHERE game_system_id = p_system_id;
    DELETE FROM public.items WHERE game_system_id = p_system_id;
    DELETE FROM public.abilities WHERE game_system_id = p_system_id;
    DELETE FROM public.game_systems WHERE id = p_system_id;

    RETURN jsonb_build_object('status', 'deleted');
END;
$function$;

ALTER TABLE public.game_system_lobby_settings
    DROP CONSTRAINT game_system_lobby_settings_section_order_check,
    DROP CONSTRAINT game_system_lobby_settings_hidden_sections_check;
ALTER TABLE public.game_system_lobby_settings
    ALTER COLUMN section_order SET DEFAULT ARRAY[
        'system-presentation', 'matchmaking', 'store', 'chat', 'events', 'character-sheet'
    ]::TEXT[];
UPDATE public.game_system_lobby_settings AS settings
SET section_order = ARRAY(
        SELECT CASE WHEN section = 'campaign-chat' THEN 'chat' ELSE section END
        FROM unnest(settings.section_order) WITH ORDINALITY AS sections(section, position)
        ORDER BY position
    ),
    hidden_sections = ARRAY(
        SELECT CASE WHEN section = 'campaign-chat' THEN 'chat' ELSE section END
        FROM unnest(settings.hidden_sections) WITH ORDINALITY AS sections(section, position)
        ORDER BY position
    );
ALTER TABLE public.game_system_lobby_settings
    ADD CONSTRAINT game_system_lobby_settings_section_order_check CHECK (
        array_ndims(section_order) = 1
        AND array_lower(section_order, 1) = 1
        AND cardinality(section_order) = 6
        AND section_order <@ ARRAY['system-presentation', 'matchmaking', 'store', 'chat', 'events', 'character-sheet']::TEXT[]
        AND ARRAY['system-presentation', 'matchmaking', 'store', 'chat', 'events', 'character-sheet']::TEXT[] <@ section_order
    ),
    ADD CONSTRAINT game_system_lobby_settings_hidden_sections_check CHECK (
        hidden_sections <@ section_order
        AND (cardinality(hidden_sections) = 0 OR (array_ndims(hidden_sections) = 1 AND array_lower(hidden_sections, 1) = 1))
        AND cardinality(array_positions(hidden_sections, 'system-presentation')) <= 1
        AND cardinality(array_positions(hidden_sections, 'matchmaking')) <= 1
        AND cardinality(array_positions(hidden_sections, 'store')) <= 1
        AND cardinality(array_positions(hidden_sections, 'chat')) <= 1
        AND cardinality(array_positions(hidden_sections, 'events')) <= 1
        AND cardinality(array_positions(hidden_sections, 'character-sheet')) <= 1
    );

COMMIT;
