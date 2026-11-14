BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'game_system_character_sheets', 'stores one character sheet definition per system');
SELECT has_function('public', 'create_game_system_with_metadata', ARRAY['text', 'text', 'jsonb', 'text', 'text[]'], 'creates a system and its sheet with required discovery metadata');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.game_systems AS system
    LEFT JOIN public.game_system_character_sheets AS sheet ON sheet.game_system_id = system.id
    WHERE sheet.game_system_id IS NULL
  ),
  'backfills an empty sheet for each legacy system'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('27000000-0000-4000-8000-000000000001', 'sheet-owner@example.test', '{}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '27000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"27000000-0000-4000-8000-000000000001"}', true);

SELECT is(
  public.create_game_system_with_metadata(
    'Sheet Test System',
    'System created from the character sheet flow',
    '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[{"key":"origin","label":"Origem","type":"short_text","required":true,"position":0,"width":"full","show_on_card":true}]}]}'::jsonb,
    'text',
    ARRAY[]::TEXT[]
  ) ->> 'status',
  'created',
  'creates a system with its ordered sheet and Owner membership'
);

SELECT is(
  (SELECT sheet.definition #>> '{steps,0,components,0,key}'
   FROM public.game_system_character_sheets AS sheet
   JOIN public.game_systems AS system ON system.id = sheet.game_system_id
   WHERE system.name = 'Sheet Test System'),
  'origin',
  'persists the submitted field definition'
);

SELECT is(
  (SELECT membership.role
   FROM public.game_system_memberships AS membership
   JOIN public.game_systems AS system ON system.id = membership.game_system_id
   WHERE system.name = 'Sheet Test System'
     AND membership.user_id = '27000000-0000-4000-8000-000000000001'),
  'owner',
  'system creator receives the Owner role'
);

SELECT throws_ok(
  $$SELECT public.create_game_system_with_metadata(
      'Invalid Sheet System', NULL,
      '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[{"key":"class","label":"Classe","type":"single_select","required":true,"position":0,"width":"full","show_on_card":true,"presentation":"select","options":[] }]}]}'::jsonb,
      'text', ARRAY[]::TEXT[]
    )$$,
  '22023', 'Invalid game system or character sheet',
  'rejects malformed sheet definitions through the RPC'
);

SELECT throws_ok(
  $$SELECT public.create_game_system_with_metadata(
      'Duplicate Normalized Options', NULL,
      '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[{"key":"class","label":"Classe","type":"single_select","required":true,"position":0,"width":"full","show_on_card":true,"presentation":"select","options":[{"label":"Mago"},{"label":" Mago "}]}]}]}'::jsonb,
      'text', ARRAY[]::TEXT[]
    )$$,
  '22023', 'Invalid game system or character sheet',
  'rejects select options that collide after trimming'
);

SELECT throws_ok(
  $$INSERT INTO public.game_system_character_sheets (game_system_id, definition)
    SELECT id, '[]'::jsonb FROM public.game_systems WHERE name = 'Sheet Test System'$$,
  '42501', NULL,
  'denies direct authenticated sheet writes'
);

SELECT throws_ok(
  $$SELECT public.create_game_system_with_sheet(
      'Missing Metadata System',
      NULL,
      '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::jsonb
    )$$,
  '42501', NULL,
  'denies legacy system creation that bypasses required metadata'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  $$SELECT public.create_game_system_with_metadata('Unauthenticated', NULL, '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::jsonb, 'text', ARRAY[]::TEXT[])$$,
  '42501', NULL,
  'rejects unauthenticated system creation'
);

SELECT * FROM finish();
ROLLBACK;
