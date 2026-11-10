-- Use Supabase Auth as the identity provider instead of storing passwords here.
-- Existing public.users rows must already have matching auth.users IDs.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.users AS app_user
        LEFT JOIN auth.users AS auth_user ON auth_user.id = app_user.id
        WHERE auth_user.id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Cannot link public.users to auth.users: some existing user IDs have no matching Supabase Auth account. Map those accounts before retrying migration 003.';
    END IF;
END;
$$;

ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.users DROP COLUMN password_hash;
ALTER TABLE public.users
    ADD CONSTRAINT users_auth_user_fk
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE FUNCTION public.sync_auth_user_to_app_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    profile_display_name TEXT;
BEGIN
    profile_display_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(NEW.email, ''),
        NULLIF(NEW.phone, ''),
        'Player'
    );

    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    INSERT INTO public.user_profiles (user_id, display_name)
    VALUES (NEW.id, profile_display_name)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_or_updated
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_to_app_user();

-- Backfill users that were created in Supabase Auth before this migration.
INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO public.user_profiles (user_id, display_name)
SELECT
    id,
    COALESCE(
        NULLIF(raw_user_meta_data ->> 'display_name', ''),
        NULLIF(raw_user_meta_data ->> 'full_name', ''),
        NULLIF(email, ''),
        NULLIF(phone, ''),
        'Player'
    )
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
