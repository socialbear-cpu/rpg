BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('91000000-0000-4000-8000-000000000001', 'xp-owner-a@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000002', 'xp-player-a@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000003', 'xp-owner-b@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000004', 'xp-player-b@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id, daily_login_timezone, daily_login_rewards_enabled)
VALUES
  ('92000000-0000-4000-8000-000000000001', 'xp-system-a', 'XP System A', '91000000-0000-4000-8000-000000000001', 'UTC', true),
  ('92000000-0000-4000-8000-000000000002', 'xp-system-b', 'XP System B', '91000000-0000-4000-8000-000000000003', 'UTC', true);

INSERT INTO public.characters (id, user_id, game_system_id, character_name)
VALUES
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'A-One'),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'A-Two'),
  ('93000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001', 'A-Other'),
  ('93000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'B-One');

INSERT INTO public.items (id, game_system_id, slug, name)
VALUES
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'xp-token-a', 'XP Token A'),
  ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'xp-token-b', 'XP Token B');

INSERT INTO public.daily_login_rewards (game_system_id, weekday, item_id, quantity)
SELECT '92000000-0000-4000-8000-000000000001', day, '94000000-0000-4000-8000-000000000001', 1
FROM generate_series(1, 7) AS day;
INSERT INTO public.daily_login_rewards (game_system_id, weekday, item_id, quantity)
SELECT '92000000-0000-4000-8000-000000000002', day, '94000000-0000-4000-8000-000000000002', 1
FROM generate_series(1, 7) AS day;

-- Existing systems receive the default threshold and three disabled built-in sources.
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}', true);
SELECT is(
  (public.get_game_system_xp_settings('92000000-0000-4000-8000-000000000001')->>'xp_per_level')::integer,
  100,
  'xp_settings_default_to_100'
);
SELECT is(
  (SELECT count(*)::integer FROM public.game_system_xp_sources
   WHERE game_system_id = '92000000-0000-4000-8000-000000000001'),
  3,
  'existing system gets each built-in xp source'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}', true);
SELECT is(
  public.set_game_system_xp_settings(
    '92000000-0000-4000-8000-000000000001',
    '{"xp_per_level":100,"sources":[
      {"source_type":"daily_login","name":"Login diário","award_amount":0,"is_enabled":false},
      {"source_type":"mission","name":"Missão","award_amount":0,"is_enabled":false},
      {"source_type":"fight","name":"Luta","award_amount":0,"is_enabled":false},
      {"source_type":"custom","name":"Treino","award_amount":50,"is_enabled":true}
    ]}'::jsonb
  )->>'status',
  'updated',
  'xp_settings_require_system_owner'
);
SELECT is(
  public.set_game_system_xp_settings(
    '92000000-0000-4000-8000-000000000002',
    '{"xp_per_level":100,"sources":[
      {"source_type":"daily_login","name":"Login diário","award_amount":25,"is_enabled":true},
      {"source_type":"mission","name":"Missão","award_amount":0,"is_enabled":false},
      {"source_type":"fight","name":"Luta","award_amount":0,"is_enabled":false}
    ]}'::jsonb
  )->>'status',
  'not_owner',
  'owner cannot edit xp rules in another system'
);
SELECT is(
  public.set_game_system_xp_settings(
    '92000000-0000-4000-8000-000000000001',
    '{"xp_per_level":100,"sources":[
      {"source_type":"daily_login","name":"Login diário","award_amount":0,"is_enabled":false},
      {"source_type":"mission","name":"Missão","award_amount":0,"is_enabled":false},
      {"source_type":"fight","name":"Luta","award_amount":0,"is_enabled":false},
      {"source_type":"custom","name":"Inválida","award_amount":0,"is_enabled":true}
    ]}'::jsonb
  )->>'status',
  'invalid_settings',
  'enabled source must grant a positive amount'
);
RESET ROLE;

-- Two independent custom sources may use the same name in separate systems.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000003"}', true);
SELECT is(
  public.set_game_system_xp_settings(
    '92000000-0000-4000-8000-000000000002',
    '{"xp_per_level":100,"sources":[
      {"source_type":"daily_login","name":"Login diário","award_amount":25,"is_enabled":true},
      {"source_type":"mission","name":"Missão","award_amount":0,"is_enabled":false},
      {"source_type":"fight","name":"Luta","award_amount":0,"is_enabled":false},
      {"source_type":"custom","name":"Treino","award_amount":10,"is_enabled":true}
    ]}'::jsonb
  )->>'status',
  'updated',
  'custom_sources_are_system_scoped'
);
RESET ROLE;

-- Trusted event grants are positive, idempotent, and preserve source snapshots.
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000002"}', true);
SELECT is(
  private.grant_character_xp(
    '93000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.game_system_xp_sources WHERE game_system_id = '92000000-0000-4000-8000-000000000001' AND source_type = 'custom'),
    'practice-1'
  ),
  50,
  'enabled custom source grants its configured amount'
);
SELECT is(
  private.grant_character_xp(
    '93000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.game_system_xp_sources WHERE game_system_id = '92000000-0000-4000-8000-000000000001' AND source_type = 'custom'),
    'practice-2'
  ),
  50,
  'second grant for the same character is independent'
);
SELECT is(
  private.grant_character_xp(
    '93000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.game_system_xp_sources WHERE game_system_id = '92000000-0000-4000-8000-000000000001' AND source_type = 'custom'),
    'practice-2'
  ),
  0,
  'repeated event key is idempotent'
);
SELECT is(
  private.grant_character_xp(
    '93000000-0000-4000-8000-000000000004',
    (SELECT id FROM public.game_system_xp_sources WHERE game_system_id = '92000000-0000-4000-8000-000000000001' AND source_type = 'custom'),
    'cross-system'
  ),
  0,
  'xp source cannot grant to a character from another system'
);
SELECT is(
  (public.get_character_xp_summary('93000000-0000-4000-8000-000000000001')->>'total_xp')::integer,
  100,
  'xp_summary_is_character_scoped'
);
SELECT is(
  (public.get_character_xp_summary('93000000-0000-4000-8000-000000000001')->>'level')::integer,
  2,
  'xp_level_advances_at_threshold'
);
UPDATE public.game_system_xp_sources SET name = 'Treino atualizado', award_amount = 75
WHERE game_system_id = '92000000-0000-4000-8000-000000000001' AND source_type = 'custom';
SELECT is(
  (SELECT source_name_snapshot FROM public.character_xp_ledger
   WHERE character_id = '93000000-0000-4000-8000-000000000001' ORDER BY created_at LIMIT 1),
  'Treino',
  'editing source does not rewrite xp history'
);
SELECT is(
  (public.get_character_xp_summary('93000000-0000-4000-8000-000000000002')->>'total_xp')::integer,
  0,
  'xp summary is separate for each character'
);
SELECT ok(
  public.get_character_xp_summary('93000000-0000-4000-8000-000000000003') IS NULL,
  'player cannot read xp for another users character'
);

-- The optional daily-login source is awarded with the existing item claim.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000002"}', true);
SELECT is(
  public.claim_daily_login_reward('92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001')->>'xp_awarded',
  '0',
  'daily_login_xp_is_optional'
);
SELECT is(
  public.claim_daily_login_reward('92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000004')->>'xp_awarded',
  '25',
  'enabled daily login source adds xp to the selected character'
);
SELECT is(
  public.claim_daily_login_reward('92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000004')->>'status',
  'already_claimed',
  'daily_login_xp_is_granted_once'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.character_xp_ledger
   WHERE source_type_snapshot = 'daily_login' AND character_id = '93000000-0000-4000-8000-000000000004'),
  1,
  'one daily login claim creates exactly one xp ledger row'
);

SELECT * FROM finish();
ROLLBACK;
