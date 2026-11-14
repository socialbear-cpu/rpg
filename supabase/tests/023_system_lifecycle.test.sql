BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
    ('c1000000-0000-4000-8000-000000000001', 'lifecycle-owner@example.test', '{}'),
    ('c1000000-0000-4000-8000-000000000002', 'lifecycle-player@example.test', '{}');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('c2000000-0000-4000-8000-000000000001', 'lifecycle-test-system', 'Lifecycle Test System', 'c1000000-0000-4000-8000-000000000001');
INSERT INTO public.characters (id, user_id, game_system_id, character_name)
VALUES
    ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Test Character'),
    ('c3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Owner Character');
INSERT INTO public.campaigns (id, game_system_id, owner_user_id, name)
VALUES ('c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Test Campaign');
INSERT INTO public.abilities (id, game_system_id, slug, name)
VALUES ('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'test-ability', 'Test Ability');
INSERT INTO public.items (id, game_system_id, slug, name, grants_ability_id)
VALUES ('c6000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'test-item', 'Test Item', 'c5000000-0000-4000-8000-000000000001');
INSERT INTO public.daily_login_rewards (game_system_id, weekday, item_id, quantity)
VALUES ('c2000000-0000-4000-8000-000000000001', 1, 'c6000000-0000-4000-8000-000000000001', 1);
INSERT INTO public.character_inventory (character_id, item_id, quantity)
VALUES ('c3000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 2);
INSERT INTO public.products (id, game_system_id, item_id)
VALUES ('c7000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001');
INSERT INTO public.store_products (id, game_system_id, product_id, price)
VALUES ('c8000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 1);
INSERT INTO public.purchases (id, user_id, game_system_id, character_id, total_amount)
VALUES ('c9000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 1);
INSERT INTO public.purchase_items (purchase_id, store_product_id, game_system_id, quantity, unit_price, product_name)
VALUES ('c9000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 1, 1, 'Test Item');
INSERT INTO public.daily_login_claims (
    user_id, game_system_id, character_id, item_id, item_name_snapshot,
    quantity, weekday, local_claim_date, timezone_name
)
VALUES (
    'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    'Test Item', 1, 1, '2026-01-01', 'UTC'
);
INSERT INTO public.trade_offers (
    id, game_system_id, sender_user_id, recipient_user_id, sender_character_id, recipient_character_id
)
VALUES (
    'ca000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002'
);
INSERT INTO public.trade_offer_lines (
    offer_id, game_system_id, side, stack_id, item_id, item_name_snapshot, quantity, metadata_snapshot
)
VALUES (
    'ca000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'sender', 'cb000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    'Test Item', 1, '{}'::JSONB
);
INSERT INTO public.character_xp_ledger (
    game_system_id, character_id, source_id, source_type_snapshot, source_name_snapshot, event_key, amount
)
SELECT 'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
       source.id, source.source_type, source.name, 'lifecycle-test', 1
FROM public.game_system_xp_sources AS source
WHERE source.game_system_id = 'c2000000-0000-4000-8000-000000000001'
LIMIT 1;

SELECT has_function('public', 'manage_game_system_lifecycle', ARRAY['uuid', 'text'], 'exposes the authenticated system lifecycle operation');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}', true);

SELECT is(
    public.manage_game_system_lifecycle('c2000000-0000-4000-8000-000000000001', 'archive')->>'status',
    'archived',
    'Owner can deactivate a system without deleting it'
);
SELECT is(
    (SELECT is_active FROM public.game_systems WHERE id = 'c2000000-0000-4000-8000-000000000001'),
    FALSE,
    'deactivation persists the inactive state'
);
SELECT is(
    public.manage_game_system_lifecycle('c2000000-0000-4000-8000-000000000001', NULL)->>'status',
    'invalid_action',
    'a missing lifecycle action cannot fall through to permanent deletion'
);
SELECT is(
    public.manage_game_system_lifecycle('c2000000-0000-4000-8000-000000000001', 'activate')->>'status',
    'activated',
    'Owner can reactivate an archived system'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000002"}', true);
SELECT is(
    public.manage_game_system_lifecycle('c2000000-0000-4000-8000-000000000001', 'delete')->>'status',
    'not_owner',
    'non-owners cannot deactivate or delete a system'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}', true);
SELECT is(
    public.manage_game_system_lifecycle('c2000000-0000-4000-8000-000000000001', 'delete')->>'status',
    'deleted',
    'Owner can permanently delete a system with dependent characters and campaigns'
);
RESET ROLE;
SELECT ok(
    NOT EXISTS (SELECT 1 FROM public.game_systems WHERE id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.characters WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.campaigns WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.daily_login_claims WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.daily_login_rewards WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.trade_offers WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.trade_offer_lines WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.purchases WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.purchase_items WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.character_xp_ledger WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.store_products WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.products WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.items WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001')
    AND NOT EXISTS (SELECT 1 FROM public.abilities WHERE game_system_id = 'c2000000-0000-4000-8000-000000000001'),
    'permanent deletion removes the system and its dependent data, including restrictive references'
);

SELECT * FROM finish();
ROLLBACK;
