BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'game_system_character_sheets', 'stores one character sheet definition per system');
SELECT has_function('public', 'create_game_system_with_sheet', ARRAY['text', 'text', 'jsonb'], 'creates a system and its sheet atomically');
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
  public.create_game_system_with_sheet(
    'Sheet Test System',
    'System created from the character sheet flow',
    '[{"key":"origin","label":"Origem","type":"short_text","required":true,"position":0,"show_on_card":true}]'::jsonb
  ) ->> 'status',
  'created',
  'creates a system with its ordered sheet and Owner membership'
);

SELECT is(
  (SELECT sheet.fields #>> '{0,key}'
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
  $$SELECT public.create_game_system_with_sheet(
      'Invalid Sheet System', NULL,
      '[{"key":"class","label":"Classe","type":"single_select","required":true,"position":0,"show_on_card":true,"options":[]}]'::jsonb
    )$$,
  '22023', 'Invalid game system or character sheet',
  'rejects malformed sheet definitions through the RPC'
);

SELECT throws_ok(
  $$INSERT INTO public.game_system_character_sheets (game_system_id, fields)
    SELECT id, '[]'::jsonb FROM public.game_systems WHERE name = 'Sheet Test System'$$,
  '42501', NULL,
  'denies direct authenticated sheet writes'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  $$SELECT public.create_game_system_with_sheet('Unauthenticated', NULL, '[]'::jsonb)$$,
  '42501', NULL,
  'rejects unauthenticated system creation'
);

SELECT * FROM finish();
ROLLBACK;
