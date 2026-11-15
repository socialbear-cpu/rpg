ALTER TABLE public.items
    ADD COLUMN image_url TEXT,
    ADD CONSTRAINT items_image_url_https_check CHECK (
        image_url IS NULL
        OR (
            pg_catalog.char_length(image_url) BETWEEN 1 AND 2048
            AND image_url ~* '^https://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
        )
    );
