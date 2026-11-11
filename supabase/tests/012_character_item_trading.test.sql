BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('22000000-0000-4000-8000-000000000001', 'trade-stack-owner@example.test', '{"display_name":"Stack Owner"}'),
  ('22000000-0000-4000-8000-000000000002', 'trade-recipient@example.test', '{"display_name":"Trade Recipient"}'),
  ('22000000-0000-4000-8000-000000000003', 'trade-outsider@example.test', '{"display_name":"Trade Outsider"}');

INSERT INTO game_systems (id, slug, name, owner_user_id)
VALUES
  ('32000000-0000-4000-8000-000000000001', 'trade-stack-system', 'Trade Stack System', '22000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000002', 'trade-other-system', 'Trade Other System', '22000000-0000-4000-8000-000000000001');

INSERT INTO items (id, game_system_id, slug, name)
VALUES
  ('42000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'trade-sword', 'Trade Sword'),
  ('42000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'trade-potion', 'Trade Potion'),
  ('42000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000002', 'other-system-token', 'Other System Token');

INSERT INTO characters (id, user_id, game_system_id, character_name)
VALUES
  ('52000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Stack Keeper'),
  ('52000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'Trade Partner'),
  ('52000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 'Other System Partner');

SELECT has_column('public', 'character_inventory', 'id', 'inventory stacks have stable identifiers');
SELECT lives_ok(
  $$INSERT INTO character_inventory (id, character_id, item_id, quantity, metadata)
    VALUES
      ('62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 2, '{"enchantment":"ember"}'),
      ('62000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 1, '{"enchantment":"frost"}'),
      ('62000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 2, '{"enchantment":"storm"}')$$,
  'one character can hold different characteristic stacks of the same item'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM character_inventory
   WHERE character_id = '52000000-0000-4000-8000-000000000001'
     AND item_id = '42000000-0000-4000-8000-000000000001'),
  2,
  'distinct metadata remains in separate stacks'
);
SELECT lives_ok(
  $$INSERT INTO character_inventory (character_id, item_id, quantity, metadata)
    VALUES ('52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 3, '{"enchantment":"ember"}')
    ON CONFLICT (character_id, item_id, metadata)
    DO UPDATE SET quantity = character_inventory.quantity + EXCLUDED.quantity$$,
  'matching characteristic stacks can merge by item and metadata'
);
SELECT is(
  (SELECT quantity FROM character_inventory
   WHERE character_id = '52000000-0000-4000-8000-000000000001'
     AND item_id = '42000000-0000-4000-8000-000000000001'
     AND metadata = '{"enchantment":"ember"}'),
  5,
  'matching stack merge preserves the total quantity'
);

INSERT INTO character_inventory (id, character_id, item_id, quantity, metadata)
VALUES ('62000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002', 5, '{}');

CREATE TEMP TABLE trade_test_results (scenario TEXT PRIMARY KEY, result JSONB);
GRANT SELECT, INSERT ON pg_temp.trade_test_results TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
INSERT INTO trade_test_results (scenario, result)
SELECT 'accepted', public.create_trade_offer(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '[{"stack_id":"62000000-0000-4000-8000-000000000001","quantity":1}]'::JSONB,
  '[{"stack_id":"62000000-0000-4000-8000-000000000003","quantity":2}]'::JSONB
);
SELECT is((SELECT result ->> 'status' FROM trade_test_results WHERE scenario = 'accepted'), 'created', 'a player can create a reciprocal offer');
SELECT is(public.create_trade_offer(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '[{"stack_id":"62000000-0000-4000-8000-000000000001","quantity":1}]'::JSONB,
  '[]'::JSONB
) ->> 'status', 'self_trade', 'a player cannot send an offer to their own character');
SELECT is(public.create_trade_offer(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000003',
  '[{"stack_id":"62000000-0000-4000-8000-000000000001","quantity":1}]'::JSONB,
  '[]'::JSONB
) ->> 'status', 'invalid_system', 'an offer cannot cross game systems');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.respond_to_trade_offer(
  (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'accepted'),
  'accept'
) ->> 'status', 'accepted', 'accepting an offer transfers every line together');
RESET ROLE;

SELECT is(
  (SELECT quantity FROM character_inventory
   WHERE id = '62000000-0000-4000-8000-000000000001'),
  4,
  'the sender retains the unoffered quantity in the original variant stack'
);
SELECT is(
  (SELECT quantity FROM character_inventory
   WHERE character_id = '52000000-0000-4000-8000-000000000002'
     AND item_id = '42000000-0000-4000-8000-000000000001'
     AND metadata = '{"enchantment":"ember"}'),
  1,
  'the recipient receives the offered characteristics'
);
SELECT is(
  (SELECT quantity FROM character_inventory
   WHERE id = '62000000-0000-4000-8000-000000000003'),
  3,
  'the recipient retains the unoffered quantity'
);
SELECT is(
  (SELECT quantity FROM character_inventory
   WHERE character_id = '52000000-0000-4000-8000-000000000001'
     AND item_id = '42000000-0000-4000-8000-000000000002'
     AND metadata = '{}'),
  2,
  'the sender receives the reciprocal items'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
INSERT INTO trade_test_results (scenario, result)
SELECT 'partial', public.create_trade_offer(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '[{"stack_id":"62000000-0000-4000-8000-000000000004","quantity":1}]'::JSONB,
  '[]'::JSONB
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.respond_to_trade_offer(
  (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'partial'),
  'accept'
) ->> 'status', 'accepted', 'a partial stack offer can be accepted');
RESET ROLE;
SELECT is((SELECT quantity FROM character_inventory WHERE id = '62000000-0000-4000-8000-000000000004'), 1, 'a partial transfer keeps the remainder in the sender stack');
SELECT is((SELECT quantity FROM character_inventory WHERE character_id = '52000000-0000-4000-8000-000000000002' AND item_id = '42000000-0000-4000-8000-000000000001' AND metadata = '{"enchantment":"storm"}'), 1, 'a partial transfer preserves characteristics in the recipient stack');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
SELECT is(public.get_trade_characters('32000000-0000-4000-8000-000000000001') ->> 'status', 'ok', 'a player with an active character can discover same-system characters');
SELECT is(jsonb_array_length(public.get_trade_inventory('32000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002') -> 'stacks'), 3, 'a player can view only the selected character inventory through the trade RPC');
INSERT INTO trade_test_results (scenario, result)
SELECT 'invalidated', public.create_trade_offer(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '[{"stack_id":"62000000-0000-4000-8000-000000000002","quantity":1}]'::JSONB,
  '[{"stack_id":"62000000-0000-4000-8000-000000000003","quantity":1}]'::JSONB
);
INSERT INTO trade_test_results (scenario, result)
SELECT 'countered', public.create_trade_offer(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '[{"stack_id":"62000000-0000-4000-8000-000000000002","quantity":1}]'::JSONB,
  '[]'::JSONB
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
INSERT INTO trade_test_results (scenario, result)
SELECT 'counteroffer', public.counter_trade_offer(
  (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'countered'),
  '[{"stack_id":"62000000-0000-4000-8000-000000000003","quantity":1}]'::JSONB,
  '[{"stack_id":"62000000-0000-4000-8000-000000000002","quantity":1}]'::JSONB
);
SELECT is((SELECT result ->> 'status' FROM trade_test_results WHERE scenario = 'counteroffer'), 'created', 'the recipient can send a counteroffer');
RESET ROLE;
SELECT is((SELECT status FROM trade_offers WHERE id = (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'countered')), 'countered', 'a counteroffer closes the original offer');
SELECT is((
  SELECT sender_user_id = '22000000-0000-4000-8000-000000000002'::UUID
     AND recipient_user_id = '22000000-0000-4000-8000-000000000001'::UUID
     AND countered_from_offer_id = (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'countered')
  FROM trade_offers WHERE id = (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'counteroffer')
), TRUE, 'a counteroffer reverses the participants and keeps the history link');
SELECT ok((SELECT count(*) FROM notifications WHERE type = 'trade_offer_received') >= 2, 'trade offers create recipient notifications');

-- A characteristic change on either side invalidates the offer before debits occur.
UPDATE character_inventory SET metadata = '{"condition":"changed"}'
WHERE id = '62000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.respond_to_trade_offer((SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'invalidated'), 'accept') ->> 'status', 'invalidated', 'changed characteristics invalidate a pending offer');
RESET ROLE;
SELECT is((SELECT quantity FROM character_inventory WHERE id = '62000000-0000-4000-8000-000000000002'), 1, 'failed validation leaves the other offered stack untouched');

-- Competing offers do not reserve a stack, but only the first can transfer it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
INSERT INTO trade_test_results (scenario, result)
SELECT 'race_a', public.create_trade_offer('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', '[{"stack_id":"62000000-0000-4000-8000-000000000004","quantity":1}]'::JSONB, '[]'::JSONB);
INSERT INTO trade_test_results (scenario, result)
SELECT 'race_b', public.create_trade_offer('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', '[{"stack_id":"62000000-0000-4000-8000-000000000004","quantity":1}]'::JSONB, '[]'::JSONB);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.respond_to_trade_offer((SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'race_a'), 'accept') ->> 'status', 'accepted', 'the first offer using a stack can be accepted');
SELECT is(public.respond_to_trade_offer((SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'race_b'), 'accept') ->> 'status', 'invalidated', 'a second pending offer cannot spend the stack twice');
RESET ROLE;
SELECT is((SELECT count(*)::INTEGER FROM character_inventory WHERE id = '62000000-0000-4000-8000-000000000004'), 0, 'the depleted source stack is removed');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
INSERT INTO trade_test_results (scenario, result)
SELECT 'cancelled', public.create_trade_offer('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', '[{"stack_id":"62000000-0000-4000-8000-000000000002","quantity":1}]'::JSONB, '[]'::JSONB);
SELECT is(public.cancel_trade_offer((SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'cancelled')) ->> 'status', 'cancelled', 'the sender can cancel a pending offer');
INSERT INTO trade_test_results (scenario, result)
SELECT 'expired', public.create_trade_offer('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', '[{"stack_id":"62000000-0000-4000-8000-000000000002","quantity":1}]'::JSONB, '[]'::JSONB);
RESET ROLE;
UPDATE trade_offers
SET created_at = pg_catalog.clock_timestamp() - INTERVAL '15 days',
    expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second'
WHERE id = (SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'expired');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
SELECT is(public.respond_to_trade_offer((SELECT (result ->> 'offer_id')::UUID FROM trade_test_results WHERE scenario = 'expired'), 'accept') ->> 'status', 'expired', 'expired offers cannot be accepted');
RESET ROLE;
SELECT ok((SELECT count(*) FROM notifications WHERE type IN ('trade_offer_received', 'trade_offer_updated')) >= 8, 'trade lifecycle events create in-app notifications');

SELECT * FROM finish();
ROLLBACK;
