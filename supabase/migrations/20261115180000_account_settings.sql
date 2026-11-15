BEGIN;

ALTER TABLE public.user_profiles
    ADD COLUMN phone TEXT;

GRANT UPDATE (phone) ON TABLE public.user_profiles TO authenticated;

CREATE TABLE public.system_owner_transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'cancelled')),
    CHECK (requested_by <> target_user_id)
);

CREATE UNIQUE INDEX system_owner_transfer_requests_pending_system_uq
    ON public.system_owner_transfer_requests (game_system_id)
    WHERE status = 'pending';

ALTER TABLE public.system_owner_transfer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_owner_transfer_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_my_account_status()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT COALESCE((
        SELECT app_user.is_active
        FROM public.users AS app_user
        WHERE app_user.id = (SELECT auth.uid())
    ), FALSE);
$function$;
REVOKE ALL ON FUNCTION public.get_my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_status() TO authenticated;

CREATE FUNCTION public.get_my_account_settings()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT jsonb_build_object(
        'user_id', auth_user.id,
        'email', auth_user.email,
        'is_active', app_user.is_active,
        'profile', jsonb_build_object(
            'username', profile.username,
            'display_name', profile.display_name,
            'phone', profile.phone
        ),
        'owned_systems', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', system.id,
                'name', system.name,
                'pending_transfer_id', pending.id,
                'pending_target_user_id', pending.target_user_id,
                'pending_target_display_name', pending_profile.display_name,
                'candidates', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'user_id', candidate.user_id,
                        'display_name', candidate_profile.display_name
                    ) ORDER BY lower(candidate_profile.display_name))
                    FROM public.game_system_memberships AS candidate
                    JOIN public.user_profiles AS candidate_profile ON candidate_profile.user_id = candidate.user_id
                    JOIN public.users AS candidate_user ON candidate_user.id = candidate.user_id
                    WHERE candidate.game_system_id = system.id
                      AND candidate.user_id <> auth_user.id
                      AND candidate.role IN ('user', 'mod')
                      AND candidate_user.is_active
                ), '[]'::JSONB)
            ) ORDER BY lower(system.name))
            FROM public.game_systems AS system
            LEFT JOIN public.system_owner_transfer_requests AS pending
              ON pending.game_system_id = system.id AND pending.status = 'pending'
            LEFT JOIN public.user_profiles AS pending_profile
              ON pending_profile.user_id = pending.target_user_id
            WHERE system.owner_user_id = auth_user.id
        ), '[]'::JSONB),
        'incoming_transfers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', transfer.id,
                'system_id', system.id,
                'system_name', system.name,
                'from_display_name', requester_profile.display_name
            ) ORDER BY transfer.created_at)
            FROM public.system_owner_transfer_requests AS transfer
            JOIN public.game_systems AS system ON system.id = transfer.game_system_id
            JOIN public.user_profiles AS requester_profile ON requester_profile.user_id = transfer.requested_by
            WHERE transfer.target_user_id = auth_user.id
              AND transfer.status = 'pending'
              AND system.owner_user_id = transfer.requested_by
        ), '[]'::JSONB)
    )
    FROM auth.users AS auth_user
    JOIN public.users AS app_user ON app_user.id = auth_user.id
    JOIN public.user_profiles AS profile ON profile.user_id = auth_user.id
    WHERE auth_user.id = (SELECT auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.get_my_account_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_settings() TO authenticated;

CREATE FUNCTION public.update_my_account_profile(p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_profile public.user_profiles%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;

    UPDATE public.user_profiles AS profile
    SET display_name = CASE WHEN p_patch ? 'display_name' THEN p_patch->>'display_name' ELSE profile.display_name END,
        phone = CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE profile.phone END,
        avatar_url = CASE WHEN p_patch ? 'avatar_url' THEN p_patch->>'avatar_url' ELSE profile.avatar_url END,
        bio = CASE WHEN p_patch ? 'bio' THEN p_patch->>'bio' ELSE profile.bio END,
        updated_at = now()
    WHERE profile.user_id = v_user_id
    RETURNING profile.* INTO v_profile;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object(
        'status', 'updated',
        'profile', jsonb_build_object(
            'user_id', v_profile.user_id,
            'username', v_profile.username,
            'display_name', v_profile.display_name,
            'avatar_url', v_profile.avatar_url,
            'bio', v_profile.bio,
            'phone', v_profile.phone
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.update_my_account_profile(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_account_profile(JSONB) TO authenticated;

CREATE FUNCTION public.request_my_system_owner_transfer(p_system_id UUID, p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_request_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.game_systems
        WHERE id = p_system_id AND owner_user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.game_system_memberships AS membership
        JOIN public.users AS target_user ON target_user.id = membership.user_id
        WHERE membership.game_system_id = p_system_id
          AND membership.user_id = p_target_user_id
          AND membership.role IN ('user', 'mod')
          AND target_user.is_active
    ) THEN
        RETURN jsonb_build_object('status', 'invalid_member');
    END IF;

    INSERT INTO public.system_owner_transfer_requests (game_system_id, requested_by, target_user_id)
    VALUES (p_system_id, v_user_id, p_target_user_id)
    RETURNING id INTO v_request_id;
    RETURN jsonb_build_object('status', 'created', 'transfer_id', v_request_id);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'already_pending');
END;
$function$;
REVOKE ALL ON FUNCTION public.request_my_system_owner_transfer(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_my_system_owner_transfer(UUID, UUID) TO authenticated;

CREATE FUNCTION public.accept_system_owner_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
    v_transfer public.system_owner_transfer_requests%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;

    SELECT * INTO v_transfer
    FROM public.system_owner_transfer_requests
    WHERE id = p_transfer_id AND target_user_id = v_user_id AND status = 'pending'
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.game_systems
        WHERE id = v_transfer.game_system_id AND owner_user_id = v_transfer.requested_by
    ) THEN
        UPDATE public.system_owner_transfer_requests SET status = 'cancelled' WHERE id = v_transfer.id;
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    UPDATE public.game_systems
    SET owner_user_id = v_user_id, updated_at = now()
    WHERE id = v_transfer.game_system_id;
    UPDATE public.game_system_memberships
    SET role = 'user', updated_at = now()
    WHERE game_system_id = v_transfer.game_system_id
      AND user_id = v_transfer.requested_by;
    INSERT INTO public.game_system_memberships (user_id, game_system_id, role)
    VALUES (v_user_id, v_transfer.game_system_id, 'owner')
    ON CONFLICT (user_id, game_system_id)
    DO UPDATE SET role = 'owner', updated_at = now();
    UPDATE public.system_owner_transfer_requests
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_transfer.id;

    RETURN jsonb_build_object('status', 'accepted');
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_system_owner_transfer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_system_owner_transfer(UUID) TO authenticated;

CREATE FUNCTION public.cancel_system_owner_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;

    UPDATE public.system_owner_transfer_requests
    SET status = 'cancelled'
    WHERE id = p_transfer_id
      AND requested_by = v_user_id
      AND status = 'pending';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', 'cancelled');
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_system_owner_transfer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_system_owner_transfer(UUID) TO authenticated;

CREATE FUNCTION public.set_my_account_active(p_is_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;

    UPDATE public.users SET is_active = p_is_active, updated_at = now()
    WHERE id = v_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', CASE WHEN p_is_active THEN 'activated' ELSE 'deactivated' END);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_my_account_active(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_account_active(BOOLEAN) TO authenticated;

CREATE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;
    IF EXISTS (SELECT 1 FROM public.game_systems WHERE owner_user_id = v_user_id) THEN
        RETURN jsonb_build_object('status', 'owned_systems_remaining');
    END IF;

    DELETE FROM public.daily_login_claims
    WHERE user_id = v_user_id
       OR character_id IN (SELECT id FROM public.characters WHERE user_id = v_user_id);
    DELETE FROM public.trade_offer_lines
    WHERE offer_id IN (
        SELECT id FROM public.trade_offers
        WHERE sender_user_id = v_user_id OR recipient_user_id = v_user_id
    );
    DELETE FROM public.trade_offers
    WHERE sender_user_id = v_user_id OR recipient_user_id = v_user_id;
    DELETE FROM public.purchases WHERE user_id = v_user_id;
    DELETE FROM public.campaigns WHERE owner_user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;

    RETURN jsonb_build_object('status', 'deleted');
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMIT;
