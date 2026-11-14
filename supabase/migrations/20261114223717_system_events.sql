BEGIN;

CREATE TABLE public.game_system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id UUID NOT NULL REFERENCES public.game_systems(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    CHECK (description IS NULL OR char_length(description) <= 2000),
    CHECK (ends_at > starts_at)
);
CREATE INDEX game_system_events_system_start_idx
    ON public.game_system_events (game_system_id, starts_at, id);

ALTER TABLE public.game_system_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_system_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.game_system_events TO authenticated;
GRANT INSERT (game_system_id, title, description, starts_at, ends_at)
    ON TABLE public.game_system_events TO authenticated;
GRANT UPDATE (title, description, starts_at, ends_at, updated_at)
    ON TABLE public.game_system_events TO authenticated;

CREATE POLICY game_system_events_read_members
    ON public.game_system_events FOR SELECT TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner', 'mod', 'user']));
CREATE POLICY game_system_events_owner_insert
    ON public.game_system_events FOR INSERT TO authenticated
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));
CREATE POLICY game_system_events_owner_update
    ON public.game_system_events FOR UPDATE TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']))
    WITH CHECK (private.has_system_role(game_system_id, ARRAY['owner']));
CREATE POLICY game_system_events_owner_delete
    ON public.game_system_events FOR DELETE TO authenticated
    USING (private.has_system_role(game_system_id, ARRAY['owner']));

COMMIT;
