BEGIN;

ALTER TABLE public.game_systems DROP CONSTRAINT IF EXISTS game_systems_play_mode_check;
ALTER TABLE public.game_systems
    ALTER COLUMN play_mode DROP DEFAULT,
    ALTER COLUMN play_mode TYPE TEXT[] USING ARRAY[play_mode]::TEXT[],
    ALTER COLUMN play_mode SET DEFAULT ARRAY['text']::TEXT[];

ALTER TABLE public.game_systems
    ADD CONSTRAINT game_systems_play_mode_check CHECK (
        cardinality(play_mode) BETWEEN 1 AND 2
        AND play_mode <@ ARRAY['text', 'voice']::TEXT[]
        AND (cardinality(play_mode) = 1 OR play_mode[1] <> play_mode[2])
    );

DO $migration$
DECLARE
    v_signature REGPROCEDURE;
    v_definition TEXT;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.create_game_system_with_metadata(text,text,jsonb,text,text[])'::REGPROCEDURE,
        'public.update_game_system_profile(uuid,text,text,boolean,text,text,text[],text,smallint,smallint)'::REGPROCEDURE
    ] LOOP
        v_definition := pg_catalog.pg_get_functiondef(v_signature);
        v_definition := pg_catalog.regexp_replace(v_definition, 'p_play_mode text,', 'p_play_mode text[],', 'gi');
        v_definition := pg_catalog.regexp_replace(
            v_definition,
            $$p_play_mode NOT IN \([^)]*\)$$,
            $$NOT (p_play_mode <@ ARRAY['text', 'voice']::TEXT[]) OR cardinality(p_play_mode) NOT BETWEEN 1 AND 2 OR cardinality(p_play_mode) <> cardinality(array_remove(p_play_mode, p_play_mode[1])) + 1$$,
            'g'
        );
        EXECUTE v_definition;
    END LOOP;
END;
$migration$;

REVOKE ALL ON FUNCTION public.create_game_system_with_metadata(TEXT, TEXT, JSONB, TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_game_system_with_metadata(TEXT, TEXT, JSONB, TEXT[], TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.update_game_system_profile(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT[], TEXT[], TEXT, SMALLINT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_game_system_profile(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT[], TEXT[], TEXT, SMALLINT, SMALLINT) TO authenticated;

DROP FUNCTION public.create_game_system_with_metadata(TEXT, TEXT, JSONB, TEXT, TEXT[]);
DROP FUNCTION public.update_game_system_profile(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT[], TEXT, SMALLINT, SMALLINT);

COMMIT;
