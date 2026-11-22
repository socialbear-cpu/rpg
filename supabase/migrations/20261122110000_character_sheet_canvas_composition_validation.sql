BEGIN;

CREATE OR REPLACE FUNCTION private._character_sheet_definition_without_composition_keys(p_definition JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT CASE WHEN pg_catalog.jsonb_typeof(p_definition->'steps') IS DISTINCT FROM 'array'
        THEN p_definition - 'layout_mode'
        ELSE pg_catalog.jsonb_set(
            p_definition - 'layout_mode',
            '{steps}',
            COALESCE((
                SELECT pg_catalog.jsonb_agg(
                    CASE WHEN pg_catalog.jsonb_typeof(step) = 'object' THEN
                        CASE WHEN pg_catalog.jsonb_typeof(step->'components') = 'array' THEN
                            pg_catalog.jsonb_set(
                                CASE WHEN step ? 'elements' THEN pg_catalog.jsonb_set(
                                    step,
                                    '{elements}',
                                    COALESCE((
                                        SELECT pg_catalog.jsonb_agg(element - 'composition_key' ORDER BY ordinal)
                                        FROM pg_catalog.jsonb_array_elements(step->'elements') WITH ORDINALITY AS item(element, ordinal)
                                    ), '[]'::JSONB),
                                    FALSE
                                ) ELSE step END,
                                '{components}',
                                COALESCE((
                                    SELECT pg_catalog.jsonb_agg(
                                        CASE
                                            WHEN pg_catalog.jsonb_typeof(component) = 'object'
                                                 AND component->>'type' = 'single_select'
                                                 AND component->>'presentation' = 'canvas'
                                            THEN component - 'composition_key'
                                            ELSE component
                                        END
                                        ORDER BY ordinal
                                    )
                                    FROM pg_catalog.jsonb_array_elements(step->'components') WITH ORDINALITY AS item(component, ordinal)
                                ), '[]'::JSONB),
                                FALSE
                            )
                        WHEN step ? 'elements' THEN pg_catalog.jsonb_set(
                            step,
                            '{elements}',
                            COALESCE((
                                SELECT pg_catalog.jsonb_agg(element - 'composition_key' ORDER BY ordinal)
                                FROM pg_catalog.jsonb_array_elements(step->'elements') WITH ORDINALITY AS item(element, ordinal)
                            ), '[]'::JSONB),
                            FALSE
                        )
                        ELSE step END
                    ELSE step END
                    ORDER BY step_ordinal
                )
                FROM pg_catalog.jsonb_array_elements(p_definition->'steps') WITH ORDINALITY AS item(step, step_ordinal)
            ), '[]'::JSONB),
            FALSE
        )
    END;
$function$;

COMMIT;
