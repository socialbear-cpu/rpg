BEGIN;

GRANT SELECT (currency_image_url), UPDATE (currency_image_url)
    ON public.game_systems TO authenticated;

COMMIT;
