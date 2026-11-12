BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('29000000-0000-4000-8000-000000000001', 'conditional-sheet-owner@example.test', '{}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"29000000-0000-4000-8000-000000000001"}', true);

SELECT ok(
  private.is_valid_character_sheet_definition(
    '{"version":1,"steps":[{"key":"origin","label":"Origem","position":0,"components":[{"key":"origin","label":"Origem","type":"single_select","required":true,"position":0,"width":"full","show_on_card":false,"presentation":"select","options":[{"label":"Cidade","value":"city"},{"label":"Floresta","value":"forest"}]}]},{"key":"choices","label":"Escolhas","position":1,"condition":{"logic":"any","rules":[{"component_key":"origin","operator":"equals","value":"city"},{"component_key":"origin","operator":"equals","value":"forest"}]},"components":[{"key":"interests","label":"Interesses","type":"single_select","required":true,"position":0,"width":"full","show_on_card":false,"presentation":"canvas","selection_mode":"multiple","options":[{"label":"Mapas","value":"maps","image_url":"https://cdn.example/maps.jpg","x":5,"y":5,"width":40,"height":45,"rotation":-5,"condition":{"logic":"all","rules":[{"component_key":"origin","operator":"is_filled"}]}},{"label":"Guildas","value":"guilds","x":55,"y":5,"width":40,"height":45,"rotation":0}]}]}]}'
    ::jsonb
  ),
  'accepts positioned multi-select options and conditions'
);

SELECT ok(
  NOT private.is_valid_character_sheet_definition(
    '{"version":1,"steps":[{"key":"choices","label":"Escolhas","position":0,"components":[{"key":"interests","label":"Interesses","type":"single_select","required":true,"position":0,"width":"full","show_on_card":false,"presentation":"select","options":[{"label":"Mapas","value":"same"},{"label":"Guildas","value":"same"}]}]}]}'
    ::jsonb
  ),
  'rejects duplicate stable option values'
);

SELECT ok(
  NOT private.is_valid_character_sheet_definition(
    '{"version":1,"steps":[{"key":"choices","label":"Escolhas","position":0,"components":[{"key":"interests","label":"Interesses","type":"single_select","required":true,"position":0,"width":"full","show_on_card":false,"presentation":"select","condition":{"logic":"all","rules":[{"component_key":"origin","operator":"is_filled"}]},"options":[{"label":"Mapas"}]},{"key":"origin","label":"Origem","type":"short_text","required":true,"position":1,"width":"full","show_on_card":false}]}]}'
    ::jsonb
  ),
  'rejects conditions that reference later components'
);

SELECT is(
  public.create_game_system_with_sheet(
    'Conditional Sheet Test',
    NULL,
    '{"version":1,"steps":[{"key":"origin","label":"Origem","position":0,"components":[{"key":"origin","label":"Origem","type":"short_text","required":true,"position":0,"width":"full","show_on_card":false}]},{"key":"choices","label":"Escolhas","position":1,"condition":{"logic":"all","rules":[{"component_key":"origin","operator":"is_filled"}]},"components":[{"key":"interests","label":"Interesses","type":"single_select","required":true,"position":0,"width":"full","show_on_card":false,"presentation":"canvas","selection_mode":"multiple","options":[{"label":"Mapas","value":"maps","x":5,"y":5,"width":40,"height":40,"rotation":0}]}]}]}'::jsonb
  )->>'status',
  'created',
  'creates a system with conditional multi-select options'
);

SELECT * FROM finish();
ROLLBACK;
