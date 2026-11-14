BEGIN;

CREATE FUNCTION private._manage_game_system_lifecycle(p_system_id UUID, p_action TEXT)
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
        SET is_active = (p_action = 'activate'),
            updated_at = now()
        WHERE id = p_system_id;
        RETURN jsonb_build_object(
            'status', CASE WHEN p_action = 'archive' THEN 'archived' ELSE 'activated' END,
            'is_active', p_action = 'activate'
        );
    END IF;

    DELETE FROM public.notifications
    WHERE game_system_id = p_system_id;
    DELETE FROM public.character_xp_ledger
    WHERE game_system_id = p_system_id;
    DELETE FROM public.daily_login_claims
    WHERE game_system_id = p_system_id;
    DELETE FROM public.trade_offer_lines
    WHERE game_system_id = p_system_id;
    DELETE FROM public.trade_offers
    WHERE game_system_id = p_system_id;
    DELETE FROM public.purchase_items
    WHERE game_system_id = p_system_id;
    DELETE FROM public.purchases
    WHERE game_system_id = p_system_id;
    DELETE FROM public.daily_login_rewards
    WHERE game_system_id = p_system_id;
    DELETE FROM public.store_products
    WHERE game_system_id = p_system_id;
    DELETE FROM public.products
    WHERE game_system_id = p_system_id;
    DELETE FROM public.character_inventory
    WHERE character_id IN (
        SELECT game_character.id
        FROM public.characters AS game_character
        WHERE game_character.game_system_id = p_system_id
    );
    DELETE FROM public.campaigns
    WHERE game_system_id = p_system_id;
    DELETE FROM public.characters
    WHERE game_system_id = p_system_id;
    DELETE FROM public.items
    WHERE game_system_id = p_system_id;
    DELETE FROM public.abilities
    WHERE game_system_id = p_system_id;
    DELETE FROM public.game_systems
    WHERE id = p_system_id;

    RETURN jsonb_build_object('status', 'deleted');
END;
$function$;
REVOKE ALL ON FUNCTION private._manage_game_system_lifecycle(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._manage_game_system_lifecycle(UUID, TEXT)
    TO authenticated;

CREATE FUNCTION public.manage_game_system_lifecycle(p_system_id UUID, p_action TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._manage_game_system_lifecycle($1, $2);
$function$;
REVOKE ALL ON FUNCTION public.manage_game_system_lifecycle(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_game_system_lifecycle(UUID, TEXT)
    TO authenticated;

COMMIT;
