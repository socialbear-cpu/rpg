BEGIN;

ALTER TABLE public.game_systems
    ADD COLUMN currency_image_url TEXT,
    ADD CONSTRAINT game_systems_currency_image_url_https_check CHECK (
        currency_image_url IS NULL
        OR (
            pg_catalog.char_length(currency_image_url) BETWEEN 1 AND 2048
            AND currency_image_url ~* '^https://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
        )
    );

CREATE OR REPLACE FUNCTION private._set_game_system_store_offer_field(
    p_game_system_id UUID,
    p_item_id UUID,
    p_field TEXT,
    p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_item_name TEXT;
    v_product_id UUID;
    v_store_product_id UUID;
    v_price NUMERIC(12,2);
    v_is_available BOOLEAN;
    v_listing_found BOOLEAN;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.game_systems WHERE id = p_game_system_id) THEN
        RETURN pg_catalog.jsonb_build_object('status', 'invalid_store');
    END IF;
    IF NOT private.is_platform_admin()
       AND NOT private.has_system_role(p_game_system_id, ARRAY['owner']) THEN
        RETURN pg_catalog.jsonb_build_object('status', 'not_owner');
    END IF;
    IF p_field IS NULL OR p_field NOT IN ('price', 'is_available') THEN
        RETURN pg_catalog.jsonb_build_object('status', 'invalid_field');
    END IF;
    IF p_field = 'price' THEN
        IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'number'
           OR p_value::TEXT !~ '^[0-9]+(\.[0-9]{1,2})?$'
           OR (p_value::TEXT)::NUMERIC NOT BETWEEN 0 AND 9999999999.99 THEN
            RETURN pg_catalog.jsonb_build_object('status', 'invalid_value');
        END IF;
        v_price := (p_value::TEXT)::NUMERIC(12,2);
    ELSE
        IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'boolean' THEN
            RETURN pg_catalog.jsonb_build_object('status', 'invalid_value');
        END IF;
        v_is_available := (p_value::TEXT)::BOOLEAN;
    END IF;

    SELECT item.name INTO v_item_name
    FROM public.items AS item
    WHERE item.id = p_item_id AND item.game_system_id = p_game_system_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('status', 'invalid_item');
    END IF;

    SELECT listing.id, listing.product_id, listing.price, listing.is_available
      INTO v_store_product_id, v_product_id, v_price, v_is_available
    FROM public.store_products AS listing
    JOIN public.products AS product
      ON product.id = listing.product_id AND product.game_system_id = listing.game_system_id
    WHERE listing.game_system_id = p_game_system_id
      AND product.item_id = p_item_id
      AND product.ability_id IS NULL
    ORDER BY listing.created_at
    LIMIT 1;
    v_listing_found := FOUND;

    IF v_listing_found THEN
        IF p_field = 'price' THEN
            v_price := (p_value::TEXT)::NUMERIC(12,2);
            UPDATE public.store_products
            SET price = v_price, updated_at = now()
            WHERE id = v_store_product_id;
        ELSE
            v_is_available := (p_value::TEXT)::BOOLEAN;
            UPDATE public.store_products
            SET is_available = v_is_available, updated_at = now()
            WHERE id = v_store_product_id;
        END IF;
    ELSE
        IF p_field = 'is_available' THEN
            RETURN pg_catalog.jsonb_build_object('status', 'offer_not_found');
        END IF;
        v_price := (p_value::TEXT)::NUMERIC(12,2);
        SELECT product.id INTO v_product_id
        FROM public.products AS product
        WHERE product.game_system_id = p_game_system_id
          AND product.item_id = p_item_id
          AND product.ability_id IS NULL
        ORDER BY product.created_at
        LIMIT 1;
        IF v_product_id IS NULL THEN
            INSERT INTO public.products (game_system_id, item_id)
            VALUES (p_game_system_id, p_item_id)
            RETURNING id INTO v_product_id;
        END IF;
        v_is_available := TRUE;
        INSERT INTO public.store_products (game_system_id, product_id, price, is_available)
        VALUES (p_game_system_id, v_product_id, v_price, v_is_available)
        RETURNING id INTO v_store_product_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'updated',
        'store_product_id', v_store_product_id,
        'item_id', p_item_id,
        'item_name', v_item_name,
        'price', v_price,
        'is_available', v_is_available
    );
END;
$function$;

REVOKE ALL ON FUNCTION private._set_game_system_store_offer_field(UUID, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private._set_game_system_store_offer_field(UUID, UUID, TEXT, JSONB)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.set_game_system_store_offer_field(
    p_game_system_id UUID,
    p_item_id UUID,
    p_field TEXT,
    p_value JSONB
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT private._set_game_system_store_offer_field($1, $2, $3, $4);
$function$;

REVOKE ALL ON FUNCTION public.set_game_system_store_offer_field(UUID, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_game_system_store_offer_field(UUID, UUID, TEXT, JSONB)
    TO authenticated;

COMMIT;
