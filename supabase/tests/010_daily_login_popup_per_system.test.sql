BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(4);
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('81000000-0000-4000-8000-000000000001', 'popup-system@example.test', '{}');
INSERT INTO public.game_systems (id, slug, name, daily_login_rewards_enabled) VALUES
('82000000-0000-4000-8000-000000000001', 'popup-system-a', 'A', true),
('82000000-0000-4000-8000-000000000002', 'popup-system-b', 'B', true);
INSERT INTO public.characters (user_id, game_system_id, character_name) VALUES
('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'A'),
('81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002', 'B');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
SELECT ok(public.take_daily_login_popup('82000000-0000-4000-8000-000000000001'), 'first entry into A opens popup');
SELECT ok(NOT public.take_daily_login_popup('82000000-0000-4000-8000-000000000001'), 'reentry into A does not open popup');
SELECT ok(public.take_daily_login_popup('82000000-0000-4000-8000-000000000002'), 'entry into B opens popup independently');
RESET ROLE;
UPDATE public.daily_login_system_popup_views SET viewed_on = viewed_on - 1;
SET LOCAL ROLE authenticated;
SELECT ok(public.take_daily_login_popup('82000000-0000-4000-8000-000000000001'), 'new day permits A again');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
