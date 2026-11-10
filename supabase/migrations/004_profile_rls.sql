-- The Auth trigger owns profile creation. Data API clients can read their
-- profile and edit only its public-facing fields.
BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.users FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (id, email, is_active, created_at, updated_at)
    ON TABLE public.users FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (user_id, display_name, avatar_url, bio, created_at, updated_at)
    ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, bio)
    ON TABLE public.user_profiles TO authenticated;

CREATE POLICY user_profiles_select_own
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) IS NOT NULL
        AND user_id = (SELECT auth.uid())
    );

CREATE POLICY user_profiles_update_own
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) IS NOT NULL
        AND user_id = (SELECT auth.uid())
    )
    WITH CHECK (
        (SELECT auth.uid()) IS NOT NULL
        AND user_id = (SELECT auth.uid())
    );

COMMIT;
