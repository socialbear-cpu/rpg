BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('28000000-0000-4000-8000-000000000001', 'visual-sheet-owner@example.test', '{}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"28000000-0000-4000-8000-000000000001"}', true);

SELECT ok(
  private.is_valid_character_sheet_definition(
    '{"version":1,"steps":[{"key":"identity","label":"Identidade","position":0,"components":[],"elements":[{"key":"portrait","type":"image","image_url":"https://cdn.example/portrait.jpg","description":"Retrato","x":60,"y":5,"width":30,"height":40,"rotation":0},{"key":"heading","type":"text","text":"Ficha","x":5,"y":5,"width":30,"height":15,"rotation":-5}]}]}'::jsonb
  ),
  'accepts positioned images and text'
);

SELECT ok(
  NOT private.is_valid_character_sheet_definition(
    '{"version":1,"steps":[{"key":"identity","label":"Identidade","position":0,"components":[],"elements":[{"key":"portrait","type":"image","image_url":"http://cdn.example/portrait.jpg","x":80,"y":5,"width":30,"height":40,"rotation":0}]}]}'::jsonb
  ),
  'rejects unsafe image URLs and elements outside the page'
);

SELECT is(
  public.create_game_system_with_sheet(
    'Visual Sheet Test',
    NULL,
    '{"version":1,"steps":[{"key":"identity","label":"Identidade","position":0,"components":[],"elements":[{"key":"portrait","type":"image","image_url":"https://cdn.example/portrait.jpg","description":"Retrato","x":60,"y":5,"width":30,"height":40,"rotation":0}]}]}'::jsonb
  )->>'status',
  'created',
  'creates a system whose sheet contains positioned visual elements'
);

SELECT ok(
  public.update_game_system_character_sheet(
    (SELECT id FROM public.game_systems WHERE name = 'Visual Sheet Test'),
    '{"version":1,"steps":[{"key":"identity","label":"Identidade","position":0,"components":[],"elements":[{"key":"heading","type":"text","text":"Ficha atualizada","x":5,"y":5,"width":30,"height":15,"rotation":0}]}]}'::jsonb
  )->'definition' @> '{"steps":[{"elements":[{"key":"heading","type":"text","text":"Ficha atualizada"}]}]}'::jsonb,
  'allows the system owner to update positioned visual elements'
);

SELECT * FROM finish();
ROLLBACK;
