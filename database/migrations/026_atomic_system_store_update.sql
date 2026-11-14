BEGIN;

CREATE OR REPLACE FUNCTION private._replace_game_system_store(
    p_game_system_id UUID,
    p_currency_name TEXT,
    p_offers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_offer JSONB;
    v_store_product_id UUID;
    v_item_id UUID;
    v_product_id UUID;
    v_price NUMERIC(12,2);
    v_is_available BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.game_systems WHERE id = p_game_system_id) THEN
        RETURN jsonb_build_object('status', 'invalid_store');
    END IF;
    IF NOT private.is_platform_admin()
       AND NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN jsonb_build_object('status', 'not_owner');
    END IF;
    IF p_currency_name IS NULL OR char_length(btrim(p_currency_name)) NOT BETWEEN 1 AND 80
       OR jsonb_typeof(p_offers) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('status', 'invalid_store');
    END IF;

    -- Validate every field and reference before the first write.
    FOR v_offer IN SELECT value FROM jsonb_array_elements(p_offers) AS entry(value) LOOP
        IF jsonb_typeof(v_offer) IS DISTINCT FROM 'object'
           OR jsonb_typeof(v_offer->'item_id') IS DISTINCT FROM 'string'
           OR (v_offer->>'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR jsonb_typeof(v_offer->'price') IS DISTINCT FROM 'number'
           OR (v_offer->>'price') !~ '^[0-9]+(\.[0-9]{1,2})?$'
           OR (v_offer->>'price')::NUMERIC NOT BETWEEN 0 AND 9999999999.99
           OR jsonb_typeof(v_offer->'is_available') IS DISTINCT FROM 'boolean'
           OR (v_offer ? 'store_product_id' AND (
                jsonb_typeof(v_offer->'store_product_id') IS DISTINCT FROM 'string'
                OR (v_offer->>'store_product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           )) THEN
            RETURN jsonb_build_object('status', 'invalid_offers');
        END IF;
        v_item_id := (v_offer->>'item_id')::UUID;
        IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = v_item_id AND game_system_id = p_game_system_id) THEN
            RETURN jsonb_build_object('status', 'invalid_offers');
        END IF;
        IF v_offer ? 'store_product_id' THEN
            v_store_product_id := (v_offer->>'store_product_id')::UUID;
            IF NOT EXISTS (
                SELECT 1
                FROM public.store_products AS listing
                JOIN public.products AS product
                  ON product.id = listing.product_id AND product.game_system_id = listing.game_system_id
                WHERE listing.id = v_store_product_id
                  AND listing.game_system_id = p_game_system_id
                  AND product.item_id = v_item_id
                  AND product.ability_id IS NULL
            ) THEN
                RETURN jsonb_build_object('status', 'invalid_offers');
            END IF;
            IF (SELECT count(*) FROM jsonb_array_elements(p_offers) AS entry(value)
                WHERE entry.value->>'store_product_id' = v_store_product_id::TEXT) > 1 THEN
                RETURN jsonb_build_object('status', 'invalid_offers');
            END IF;
        END IF;
    END LOOP;

    UPDATE public.game_systems
    SET currency_name = btrim(p_currency_name), updated_at = now()
    WHERE id = p_game_system_id;

    UPDATE public.store_products AS listing
    SET is_available = false, updated_at = now()
    WHERE listing.game_system_id = p_game_system_id
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_offers) AS entry(value)
          WHERE entry.value->>'store_product_id' = listing.id::TEXT
      );

    FOR v_offer IN SELECT value FROM jsonb_array_elements(p_offers) AS entry(value) LOOP
        v_item_id := (v_offer->>'item_id')::UUID;
        v_price := (v_offer->>'price')::NUMERIC(12,2);
        v_is_available := (v_offer->>'is_available')::BOOLEAN;
        IF v_offer ? 'store_product_id' THEN
            v_store_product_id := (v_offer->>'store_product_id')::UUID;
            UPDATE public.store_products
            SET price = v_price, is_available = v_is_available, updated_at = now()
            WHERE id = v_store_product_id AND game_system_id = p_game_system_id;
        ELSE
            SELECT id INTO v_product_id
            FROM public.products
            WHERE game_system_id = p_game_system_id AND item_id = v_item_id AND ability_id IS NULL
            ORDER BY created_at
            LIMIT 1;
            IF v_product_id IS NULL THEN
                INSERT INTO public.products (game_system_id, item_id)
                VALUES (p_game_system_id, v_item_id)
                RETURNING id INTO v_product_id;
            END IF;
            INSERT INTO public.store_products (game_system_id, product_id, price, is_available)
            VALUES (p_game_system_id, v_product_id, v_price, v_is_available);
            v_product_id := NULL;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'updated');
END;
$function$;
REVOKE ALL ON FUNCTION private._replace_game_system_store(UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._replace_game_system_store(UUID, TEXT, JSONB)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_game_system_store(
    p_game_system_id UUID,
    p_currency_name TEXT,
    p_offers JSONB
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._replace_game_system_store($1, $2, $3);
$function$;
REVOKE ALL ON FUNCTION public.replace_game_system_store(UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_game_system_store(UUID, TEXT, JSONB)
    TO authenticated;

COMMIT;
