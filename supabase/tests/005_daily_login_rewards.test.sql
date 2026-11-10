BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'daily-owner-a@example.test', '{"display_name":"Owner A"}'),
  ('20000000-0000-4000-8000-000000000002', 'daily-player@example.test', '{"display_name":"Player"}'),
  ('20000000-0000-4000-8000-000000000003', 'daily-owner-b@example.test', '{"display_name":"Owner B"}'),
  ('20000000-0000-4000-8000-000000000004', 'daily-other-player@example.test', '{"display_name":"Other Player"}');

INSERT INTO game_systems (id, slug, name, owner_user_id, daily_login_timezone)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'daily-a', 'Daily System A', '20000000-0000-4000-8000-000000000001', 'UTC'),
  ('30000000-0000-4000-8000-000000000002', 'daily-b', 'Daily System B', '20000000-0000-4000-8000-000000000003', 'UTC');

INSERT INTO items (id, game_system_id, slug, name)
VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'daily-token', 'Daily Token'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'other-token', 'Other Token');

INSERT INTO characters (id, user_id, game_system_id, character_name)
VALUES
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Player A'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'Other Player A'),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Player B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}', true);
SELECT throws_ok(
  $$UPDATE public.game_systems
    SET owner_user_id = '20000000-0000-4000-8000-000000000002'
    WHERE id = '30000000-0000-4000-8000-000000000001'$$,
  '42501',
  'Only a trusted operator can change a system owner',
  'authenticated users cannot assign themselves as system owner'
);
SELECT is(
  public.set_daily_login_reward_schedule(
    '30000000-0000-4000-8000-000000000001',
    '[
      {"weekday":1,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3},
      {"weekday":2,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3},
      {"weekday":3,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3},
      {"weekday":4,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3},
      {"weekday":5,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3},
      {"weekday":6,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3},
      {"weekday":7,"item_id":"40000000-0000-4000-8000-000000000001","quantity":3}
    ]'::jsonb,
    true
  ) ->> 'status',
  'updated',
  'system owner can configure and activate a complete weekly calendar'
);
SELECT is(
  public.set_daily_login_reward_schedule(
    '30000000-0000-4000-8000-000000000002',
    '[
      {"weekday":1,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1},
      {"weekday":2,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1},
      {"weekday":3,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1},
      {"weekday":4,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1},
      {"weekday":5,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1},
      {"weekday":6,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1},
      {"weekday":7,"item_id":"40000000-0000-4000-8000-000000000002","quantity":1}
    ]'::jsonb,
    true
  ) ->> 'status',
  'not_owner',
  'an owner cannot configure another system'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002"}', true);
SELECT is(
  public.get_daily_login_reward_state('30000000-0000-4000-8000-000000000001') ->> 'status',
  'available',
  'every player sees the current shared system reward before claiming'
);
SELECT is(
  public.get_daily_login_reward_state('30000000-0000-4000-8000-000000000001') #>> '{reward,quantity}',
  '3',
  'the current calendar day exposes the configured item quantity'
);
SELECT is(
  public.claim_daily_login_reward('30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001') ->> 'status',
  'claimed',
  'player claims the shared reward for today on their character in this system'
);
SELECT is(
  public.get_daily_login_reward_state('30000000-0000-4000-8000-000000000001') ->> 'status',
  'already_claimed',
  'calendar state reflects the account claim after delivery'
);
SELECT is(
  public.claim_daily_login_reward('30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001') ->> 'status',
  'already_claimed',
  'repeated claim for the same account, system and local date is rejected'
);
SELECT is(
  public.claim_daily_login_reward('30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002') ->> 'status',
  'invalid_character',
  'player cannot receive a reward on another account character'
);
SELECT is(
  public.claim_daily_login_reward('30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003') ->> 'status',
  'invalid_character',
  'player cannot receive a system reward on a character from another system'
);
SELECT is(
  public.claim_daily_login_reward('30000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003') ->> 'status',
  'calendar_unavailable',
  'system without a configured active calendar cannot be claimed'
);
SELECT is(
  (SELECT quantity FROM character_inventory
   WHERE character_id = '50000000-0000-4000-8000-000000000001'
     AND item_id = '40000000-0000-4000-8000-000000000001'),
  3,
  'a successful claim adds the configured quantity exactly once'
);
SELECT is(
  (SELECT count(*)::integer FROM daily_login_claims
   WHERE user_id = '20000000-0000-4000-8000-000000000002'
     AND game_system_id = '30000000-0000-4000-8000-000000000001'),
  1,
  'claim history stores exactly one successful claim'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
