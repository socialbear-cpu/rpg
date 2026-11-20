BEGIN;
ALTER TABLE public.game_systems DROP CONSTRAINT IF EXISTS game_systems_play_mode_check;
ALTER TABLE public.game_systems ADD CONSTRAINT game_systems_play_mode_check CHECK (play_mode IN ('text', 'voice', 'hybrid'));
DO $migration$
DECLARE
    v_signature REGPROCEDURE;
    v_definition TEXT;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.create_game_system_with_sheet(text,text,jsonb)'::REGPROCEDURE,
        'public.create_game_system_with_metadata(text,text,jsonb,text,text[])'::REGPROCEDURE,
        'public.update_game_system_profile(uuid,text,text,boolean,text,text,text[],text,smallint,smallint)'::REGPROCEDURE
    ] LOOP
        v_definition := pg_catalog.pg_get_functiondef(v_signature);
        v_definition := pg_catalog.replace(v_definition, 'pg_catalog.char_length(v_description) > 500', 'pg_catalog.char_length(v_description) > 10000');
        v_definition := pg_catalog.replace(v_definition, 'p_play_mode NOT IN (''text'', ''voice'')', 'p_play_mode NOT IN (''text'', ''voice'', ''hybrid'')');
        EXECUTE v_definition;
    END LOOP;
END;
$migration$;
COMMIT;
