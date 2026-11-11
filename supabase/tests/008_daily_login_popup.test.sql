BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(4);
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
('80000000-0000-4000-8000-000000000001', 'popup-a@example.test', '{}'),
('80000000-0000-4000-8000-000000000002', 'popup-b@example.test', '{}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);
SELECT ok(public.take_daily_login_popup(), 'first display is allowed');
SELECT ok(NOT public.take_daily_login_popup(), 'another session cannot display again today');
SELECT set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000002', true);
SELECT ok(public.take_daily_login_popup(), 'another account has an independent daily display');
RESET ROLE;
UPDATE public.daily_login_popup_views SET viewed_on = viewed_on - 1;
SET LOCAL ROLE authenticated;
SELECT ok(public.take_daily_login_popup(), 'the following day allows another display');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
