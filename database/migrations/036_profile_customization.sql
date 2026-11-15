ALTER TABLE public.user_profiles
    ADD COLUMN banner_url TEXT,
    ADD COLUMN status TEXT,
    ADD COLUMN interests TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_banner_url_length CHECK (banner_url IS NULL OR length(banner_url) <= 2048),
    ADD CONSTRAINT user_profiles_status_length CHECK (status IS NULL OR length(status) <= 120),
    ADD CONSTRAINT user_profiles_interests_count CHECK (cardinality(interests) <= 12);

CREATE OR REPLACE FUNCTION public.update_my_account_profile(p_patch JSONB)
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
    IF p_patch ? 'phone'
        AND NOT private._has_recent_email_sign_in() THEN
        RETURN jsonb_build_object('status', 'email_confirmation_required');
    END IF;

    IF p_patch ? 'interests' THEN
        IF jsonb_typeof(p_patch->'interests') <> 'array' THEN
            RETURN jsonb_build_object('status', 'invalid_patch');
        END IF;
        IF jsonb_array_length(p_patch->'interests') > 12
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(p_patch->'interests') AS interest(value)
                WHERE length(trim(interest.value)) NOT BETWEEN 1 AND 40
            ) THEN
            RETURN jsonb_build_object('status', 'invalid_patch');
        END IF;
    END IF;

    UPDATE public.user_profiles AS profile
    SET display_name = CASE WHEN p_patch ? 'display_name' THEN p_patch->>'display_name' ELSE profile.display_name END,
        phone = CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE profile.phone END,
        avatar_url = CASE WHEN p_patch ? 'avatar_url' THEN p_patch->>'avatar_url' ELSE profile.avatar_url END,
        banner_url = CASE WHEN p_patch ? 'banner_url' THEN p_patch->>'banner_url' ELSE profile.banner_url END,
        bio = CASE WHEN p_patch ? 'bio' THEN p_patch->>'bio' ELSE profile.bio END,
        status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE profile.status END,
        interests = CASE WHEN p_patch ? 'interests'
            THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'interests'))
            ELSE profile.interests END,
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
            'banner_url', v_profile.banner_url,
            'bio', v_profile.bio,
            'status', v_profile.status,
            'interests', to_jsonb(v_profile.interests),
            'phone', v_profile.phone
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_account_profile(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_account_profile(JSONB) TO authenticated;
