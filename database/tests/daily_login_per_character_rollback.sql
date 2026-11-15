-- Run against a database with an active configured daily reward and an existing character.
BEGIN;
DO $test$
DECLARE
  v_user UUID; v_system UUID; v_first UUID; v_second UUID;
  v_result JSONB; v_expected NUMERIC; v_balance NUMERIC;
BEGIN
  SELECT c.user_id, c.game_system_id INTO STRICT v_user, v_system
  FROM public.characters c JOIN public.game_systems s ON s.id=c.game_system_id
  WHERE c.status='active' AND s.is_active AND s.daily_login_rewards_enabled
  LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  INSERT INTO public.characters (user_id, game_system_id, character_name)
  VALUES (v_user,v_system,'Daily reward rollback test A') RETURNING id INTO v_first;
  INSERT INTO public.characters (user_id, game_system_id, character_name)
  VALUES (v_user,v_system,'Daily reward rollback test B') RETURNING id INTO v_second;
  v_result := public.claim_daily_login_reward(v_system,v_first);
  IF v_result->>'status' <> 'claimed' THEN RAISE EXCEPTION 'First claim failed: %', v_result; END IF;
  v_expected := (v_result->>'currency_awarded')::numeric;
  SELECT balance INTO v_balance FROM public.character_wallets WHERE character_id=v_first;
  IF v_balance IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'First wallet mismatch'; END IF;
  v_result := public.get_daily_login_reward_state(v_system);
  IF v_result->>'status' <> 'available' OR NOT ((v_result->'claimed_character_ids') ? v_first::text)
    OR ((v_result->'claimed_character_ids') ? v_second::text)
  THEN RAISE EXCEPTION 'Second character not available: %', v_result; END IF;
  v_result := public.claim_daily_login_reward(v_system,v_second);
  IF v_result->>'status' <> 'claimed' THEN RAISE EXCEPTION 'Second claim failed: %',v_result; END IF;
  SELECT balance INTO v_balance FROM public.character_wallets WHERE character_id=v_second;
  IF v_balance IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'Second wallet mismatch'; END IF;
  v_result := public.claim_daily_login_reward(v_system,v_first);
  IF v_result->>'status' <> 'already_claimed' THEN RAISE EXCEPTION 'Duplicate claim accepted'; END IF;
  SELECT balance INTO v_balance FROM public.character_wallets WHERE character_id=v_first;
  IF v_balance IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'Duplicate credit'; END IF;
END;
$test$;
ROLLBACK;
