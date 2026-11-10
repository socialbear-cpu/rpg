-- Global platform administrators and per-game-system roles.
-- PostgreSQL 13+; roles are data enforced by private helpers and RLS/RPCs.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.platform_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
REVOKE ALL ON TABLE private.platform_admins FROM PUBLIC, anon, authenticated;

CREATE TABLE public.game_system_memberships (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'mod', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_system_id)
);
CREATE INDEX game_system_memberships_system_role_idx
    ON public.game_system_memberships (game_system_id, role);

-- Preserve existing owners and enroll existing system characters as basic users.
INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
SELECT owner_user_id, id, 'owner'
FROM public.game_systems
WHERE owner_user_id IS NOT NULL
ON CONFLICT (user_id, game_system_id) DO UPDATE SET role = 'owner';

INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
SELECT DISTINCT character.user_id, character.game_system_id, 'user'
FROM public.characters AS character
ON CONFLICT (user_id, game_system_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM private.platform_admins AS admin
        WHERE admin.user_id = (SELECT auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION private.has_system_role(
    p_game_system_id UUID,
    p_roles TEXT[]
)
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
               FROM public.game_system_memberships AS membership
               WHERE membership.user_id = (SELECT auth.uid())
                 AND membership.game_system_id = p_game_system_id
                 AND membership.role = ANY (p_roles)
           )
       );
$function$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_system_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_system_role(UUID, TEXT[]) TO authenticated;

-- Every user-created system gets its authenticated creator as its Owner.
-- Trusted operator inserts can retain an explicitly supplied legacy owner.
CREATE OR REPLACE FUNCTION private.set_game_system_creator_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NOT NULL THEN
        NEW.owner_user_id := (SELECT auth.uid());
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.create_game_system_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_owner_id UUID := COALESCE((SELECT auth.uid()), NEW.owner_user_id);
BEGIN
    IF v_owner_id IS NOT NULL THEN
        INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
        VALUES (v_owner_id, NEW.id, 'owner')
        ON CONFLICT (user_id, game_system_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER game_systems_set_creator_owner
    BEFORE INSERT ON public.game_systems
    FOR EACH ROW EXECUTE FUNCTION private.set_game_system_creator_owner();
CREATE TRIGGER game_systems_create_owner_membership
    AFTER INSERT ON public.game_systems
    FOR EACH ROW EXECUTE FUNCTION private.create_game_system_owner_membership();

REVOKE ALL ON FUNCTION private.set_game_system_creator_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_game_system_owner_membership() FROM PUBLIC, anon, authenticated;

-- Creating a character establishes basic membership, but cannot overwrite an
-- existing Owner or Mod assignment. Ignore service-side and mismatched inserts.
CREATE OR REPLACE FUNCTION private.create_character_system_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NOT NULL
       AND NEW.user_id = (SELECT auth.uid()) THEN
        INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
        VALUES (NEW.user_id, NEW.game_system_id, 'user')
        ON CONFLICT (user_id, game_system_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER characters_create_system_membership
    AFTER INSERT ON public.characters
    FOR EACH ROW EXECUTE FUNCTION private.create_character_system_membership();
REVOKE ALL ON FUNCTION private.create_character_system_membership() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.game_system_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_system_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.game_system_memberships TO authenticated;
CREATE POLICY game_system_memberships_select_own
    ON public.game_system_memberships FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR private.is_platform_admin());

CREATE OR REPLACE FUNCTION private._set_system_moderator(
    p_game_system_id UUID,
    p_user_id UUID,
    p_is_moderator BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id UUID := (SELECT auth.uid());
    v_target_role TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    IF NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;

    SELECT membership.role
    INTO v_target_role
    FROM public.game_system_memberships AS membership
    WHERE membership.user_id = p_user_id
      AND membership.game_system_id = p_game_system_id
    FOR UPDATE;

    IF NOT FOUND OR v_target_role NOT IN ('user', 'mod') THEN
        RETURN jsonb_build_object('status', 'invalid_member');
    END IF;

    UPDATE public.game_system_memberships
    SET role = CASE WHEN p_is_moderator THEN 'mod' ELSE 'user' END,
        updated_at = now()
    WHERE user_id = p_user_id
      AND game_system_id = p_game_system_id;

    RETURN jsonb_build_object('status', 'updated');
END;
$function$;
REVOKE ALL ON FUNCTION private._set_system_moderator(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._set_system_moderator(UUID, UUID, BOOLEAN)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.set_system_moderator(
    p_game_system_id UUID,
    p_user_id UUID,
    p_is_moderator BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._set_system_moderator($1, $2, $3);
$function$;
REVOKE ALL ON FUNCTION public.set_system_moderator(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_moderator(UUID, UUID, BOOLEAN)
    TO authenticated;

CREATE OR REPLACE FUNCTION private._get_my_system_memberships()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT jsonb_build_object(
        'is_platform_admin', private.is_platform_admin(),
        'memberships', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'game_system_id', membership.game_system_id,
                'game_system_name', system.name,
                'role', membership.role
            ) ORDER BY system.name)
            FROM public.game_system_memberships AS membership
            JOIN public.game_systems AS system ON system.id = membership.game_system_id
            WHERE membership.user_id = (SELECT auth.uid())
        ), '[]'::jsonb)
    );
$function$;
REVOKE ALL ON FUNCTION private._get_my_system_memberships() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._get_my_system_memberships() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_system_memberships()
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._get_my_system_memberships();
$function$;
REVOKE ALL ON FUNCTION public.get_my_system_memberships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_system_memberships() TO authenticated;

DROP POLICY IF EXISTS daily_login_rewards_read ON public.daily_login_rewards;
CREATE POLICY daily_login_rewards_read
    ON public.daily_login_rewards FOR SELECT TO authenticated
    USING (
        private.has_system_role(game_system_id, ARRAY['owner'])
        OR EXISTS (
            SELECT 1 FROM public.game_systems AS system
            WHERE system.id = daily_login_rewards.game_system_id
              AND system.is_active
              AND system.daily_login_rewards_enabled
        )
    );

-- Keep the existing daily-login feature aligned with the new source of truth.
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
    v_user_id UUID := (SELECT auth.uid());
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
        WHERE reward.weekday IS NULL OR reward.item_id IS NULL OR reward.quantity IS NULL
           OR reward.quantity NOT BETWEEN 1 AND 1000000 OR item.id IS NULL
    ) THEN
        RETURN jsonb_build_object('status', 'invalid_calendar');
    END IF;

    DELETE FROM public.daily_login_rewards WHERE game_system_id = p_game_system_id;
    INSERT INTO public.daily_login_rewards (game_system_id, weekday, item_id, quantity)
    SELECT p_game_system_id, reward.weekday, reward.item_id, reward.quantity
    FROM jsonb_to_recordset(p_rewards) AS reward(weekday INTEGER, item_id UUID, quantity INTEGER);
    UPDATE public.game_systems
    SET daily_login_rewards_enabled = p_is_active, updated_at = now()
    WHERE id = p_game_system_id;
    RETURN jsonb_build_object('status', 'updated');
END;
$function$;

COMMIT;
