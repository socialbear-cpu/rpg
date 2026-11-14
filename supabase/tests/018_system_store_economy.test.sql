BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('91000000-0000-4000-8000-000000000001', 'xp-owner-a@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000002', 'xp-player-a@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000003', 'xp-owner-b@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000004', 'xp-player-b@example.test', '{}'),
  ('91000000-0000-4000-8000-000000000005', 'xp-platform-admin@example.test', '{}');

INSERT INTO private.platform_admins (user_id)
VALUES ('91000000-0000-4000-8000-000000000005');

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


SELECT has_column('public','game_systems','currency_name','currency name exists');
SELECT has_table('public','character_wallets','wallet exists');
SELECT has_table('public','character_currency_ledger','ledger exists');
SELECT ok(NOT has_table_privilege('authenticated','public.character_wallets','INSERT'), 'authenticated has no INSERT privilege on character wallets');
SELECT ok(NOT has_table_privilege('authenticated','public.character_currency_ledger','INSERT'), 'authenticated has no INSERT privilege on currency ledger');
INSERT INTO products(id,game_system_id,item_id) VALUES ('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001');
INSERT INTO store_products(id,game_system_id,product_id,price) VALUES ('96000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',10);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$UPDATE game_systems SET currency_name='Gold' WHERE id='92000000-0000-4000-8000-000000000001'$$,'owner configures currency');
SELECT lives_ok($$UPDATE store_products SET price=12 WHERE id='96000000-0000-4000-8000-000000000001'$$,'owner configures offer');
SELECT is((SELECT price FROM store_products WHERE id='96000000-0000-4000-8000-000000000001'),12::numeric,'owner offer price persists');
UPDATE store_products SET price=10 WHERE id='96000000-0000-4000-8000-000000000001';
SELECT is(set_daily_login_reward_schedule('92000000-0000-4000-8000-000000000001', (SELECT jsonb_agg(jsonb_build_object('weekday',d,'item_id','94000000-0000-4000-8000-000000000001','quantity',1,'currency_amount',-1)) FROM generate_series(1,7) d),true)->>'status','invalid_calendar','negative daily money rejected');
SELECT is(set_daily_login_reward_schedule('92000000-0000-4000-8000-000000000001', (SELECT jsonb_agg(jsonb_build_object('weekday',d,'item_id','94000000-0000-4000-8000-000000000001','quantity',1)) FROM generate_series(1,7) d),true)->>'status','updated','old calendar payload remains supported');
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
SELECT is(
  replace_game_system_store(
    '92000000-0000-4000-8000-000000000001',
    'Gold',
    '[{"store_product_id":"96000000-0000-4000-8000-000000000001","item_id":"94000000-0000-4000-8000-000000000001","price":10,"is_available":true}]'::jsonb
  )->>'status',
  'updated',
  'platform Admin can replace a system store'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
SELECT is(
  replace_game_system_store(
    '92000000-0000-4000-8000-000000000001',
    'Stolen',
    '[{"store_product_id":"96000000-0000-4000-8000-000000000001","item_id":"94000000-0000-4000-8000-000000000001","price":0,"is_available":true}]'::jsonb
  )->>'status',
  'not_owner',
  'a regular player cannot replace a system store'
);
SELECT is((SELECT currency_name FROM public.game_systems WHERE id='92000000-0000-4000-8000-000000000001'),'Gold','rejected store replacement leaves currency unchanged');
SELECT is((SELECT price FROM public.store_products WHERE id='96000000-0000-4000-8000-000000000001'),10::numeric,'rejected store replacement leaves offer price unchanged');
UPDATE game_systems SET currency_name='Stolen' WHERE id='92000000-0000-4000-8000-000000000001';
UPDATE store_products SET price=0 WHERE id='96000000-0000-4000-8000-000000000001';
SELECT is((SELECT currency_name FROM game_systems WHERE id='92000000-0000-4000-8000-000000000001'),'Gold','player cannot change currency');
SELECT is((SELECT price FROM store_products WHERE id='96000000-0000-4000-8000-000000000001'),10::numeric,'player cannot change offer');
SELECT is((SELECT count(*) FROM character_wallets),3::bigint,'wallet reads scoped to controlled characters');
SELECT is(claim_daily_login_reward('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')->>'currency_awarded','0.00','zero currency still grants item');
SELECT is(claim_daily_login_reward('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')->>'status','already_claimed','duplicate claim rejected');
SELECT is((SELECT quantity FROM character_inventory WHERE character_id='93000000-0000-4000-8000-000000000001'),1,'duplicate claim does not duplicate item');
SELECT is(purchase_store_product('93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',1)->>'status','insufficient_funds','insufficient funds rejected');
SELECT is((SELECT count(*) FROM purchases),0::bigint,'failed purchase leaves history unchanged');
SELECT is(purchase_store_product('93000000-0000-4000-8000-000000000004','96000000-0000-4000-8000-000000000001',1)->>'status','system_mismatch','cross-system purchase rejected');
SELECT is(purchase_store_product('93000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000001',1)->>'status','invalid_character','foreign character rejected');
RESET ROLE;
UPDATE character_wallets SET balance=25 WHERE character_id='93000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(purchase_store_product('93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',2)->>'status','purchased','purchase succeeds');
SELECT is((SELECT balance FROM character_wallets WHERE character_id='93000000-0000-4000-8000-000000000001'),5::numeric,'wallet debited');
SELECT is((SELECT quantity FROM character_inventory WHERE character_id='93000000-0000-4000-8000-000000000001'),3,'items delivered atomically');
SELECT is((SELECT amount FROM character_currency_ledger),(-20)::numeric,'ledger records debit');
SELECT is((SELECT currency_code FROM purchases),'Gold','currency snapshot preserved');
SELECT is((SELECT product_name FROM purchase_items),'XP Token A','item name snapshot preserved');
SELECT throws_ok($$UPDATE character_wallets SET balance=999$$,'42501',NULL,'clients cannot mint currency');
SELECT throws_ok(
  $$INSERT INTO character_wallets(character_id,game_system_id,balance)
    VALUES ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',999)$$,
  '42501',NULL,'clients cannot create wallets or mint an opening balance'
);
SELECT throws_ok(
  $$INSERT INTO character_currency_ledger(character_id,game_system_id,amount,balance_after,source_type,source_id,currency_name_snapshot)
    VALUES ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',999,999,'purchase','97000000-0000-4000-8000-000000000001','Credits')$$,
  '42501',NULL,'clients cannot forge currency ledger entries'
);
RESET ROLE;
UPDATE daily_login_rewards SET currency_amount=7 WHERE game_system_id='92000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT is(claim_daily_login_reward('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000004')->>'currency_awarded','7.00','daily money awarded');
SELECT is((SELECT balance FROM character_wallets WHERE character_id='93000000-0000-4000-8000-000000000004'),7::numeric,'daily money reaches selected wallet');
SELECT is(claim_daily_login_reward('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000004')->>'status','already_claimed','currency claim cannot repeat');
SELECT is((SELECT balance FROM character_wallets WHERE character_id='93000000-0000-4000-8000-000000000004'),7::numeric,'duplicate claim does not duplicate currency');
SELECT is((SELECT count(*) FROM character_currency_ledger WHERE source_type='daily_login'),1::bigint,'daily currency logged once');
SELECT is(purchase_store_product('93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',0)->>'status','invalid_quantity','zero quantity rejected');
SELECT is(set_daily_login_reward_schedule('92000000-0000-4000-8000-000000000001','[]',true)->>'status','not_owner','player cannot configure daily money');
SELECT throws_ok($$DELETE FROM character_currency_ledger$$,'42501',NULL,'ledger cannot be deleted by client');
RESET ROLE;
UPDATE character_inventory SET quantity=2147483647 WHERE character_id='93000000-0000-4000-8000-000000000001';
UPDATE character_wallets SET balance=25 WHERE character_id='93000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT purchase_store_product('93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',1)$$,'22003',NULL,'delivery failure aborts entire purchase');
SELECT is((SELECT balance FROM character_wallets WHERE character_id='93000000-0000-4000-8000-000000000001'),25::numeric,'delivery failure rolls back debit');
SELECT is((SELECT count(*) FROM purchases),1::bigint,'delivery failure rolls back purchase history');
SELECT is((SELECT count(*) FROM character_currency_ledger WHERE source_type='purchase'),1::bigint,'delivery failure rolls back ledger');
RESET ROLE;
CREATE FUNCTION pg_temp.fail_store_offer_update() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'Injected store update failure';
END;
$function$;
CREATE TRIGGER test_fail_store_offer_update
BEFORE UPDATE ON public.store_products
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_store_offer_update();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
SELECT throws_ok(
  $$SELECT replace_game_system_store('92000000-0000-4000-8000-000000000001','Silver','[{"store_product_id":"96000000-0000-4000-8000-000000000001","item_id":"94000000-0000-4000-8000-000000000001","price":11,"is_available":true}]'::jsonb)$$,
  'P0001','Injected store update failure','store replacement reports an injected write failure'
);
SELECT is((SELECT currency_name FROM public.game_systems WHERE id='92000000-0000-4000-8000-000000000001'),'Gold','failed store replacement rolls back currency');
SELECT is((SELECT price FROM public.store_products WHERE id='96000000-0000-4000-8000-000000000001'),10::numeric,'failed store replacement rolls back offer changes');
RESET ROLE;
DROP TRIGGER test_fail_store_offer_update ON public.store_products;
SELECT * FROM finish();
ROLLBACK;

