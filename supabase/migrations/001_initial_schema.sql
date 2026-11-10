-- Initial PostgreSQL schema for a multi-system RPG platform.
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in).

BEGIN;

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE user_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name    TEXT NOT NULL,
    avatar_url      TEXT,
    bio             TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_systems (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE characters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_system_id  UUID NOT NULL REFERENCES game_systems(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, game_system_id),
    CHECK (status IN ('active', 'archived'))
);
CREATE INDEX characters_user_idx ON characters(user_id);
CREATE INDEX characters_system_idx ON characters(game_system_id);

-- Optional one-to-one details for a character sheet.
CREATE TABLE character_info (
    character_id    UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    biography       TEXT,
    appearance      TEXT,
    notes           TEXT,
    sheet_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE abilities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id  UUID NOT NULL REFERENCES game_systems(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    ability_type    TEXT NOT NULL DEFAULT 'ability',
    rules_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (game_system_id, slug),
    UNIQUE (id, game_system_id)
);

CREATE TABLE items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id      UUID NOT NULL REFERENCES game_systems(id) ON DELETE CASCADE,
    slug                TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    item_type           TEXT NOT NULL DEFAULT 'misc',
    grants_ability_id   UUID,
    rules_data          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (game_system_id, slug),
    UNIQUE (id, game_system_id),
    FOREIGN KEY (grants_ability_id, game_system_id)
        REFERENCES abilities(id, game_system_id) ON DELETE RESTRICT
);

CREATE TABLE achievements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id  UUID REFERENCES game_systems(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    icon_url        TEXT,
    criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX achievements_system_slug_uq
    ON achievements(game_system_id, slug) WHERE game_system_id IS NOT NULL;
CREATE UNIQUE INDEX achievements_global_slug_uq
    ON achievements(slug) WHERE game_system_id IS NULL;

CREATE TABLE user_achievements (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id  UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE character_achievements (
    character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    achievement_id  UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, achievement_id)
);

CREATE TABLE character_abilities (
    character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    ability_id      UUID NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
    acquired_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    source          TEXT,
    PRIMARY KEY (character_id, ability_id)
);

CREATE TABLE character_inventory (
    character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    acquired_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, item_id)
);

-- Store catalog is separate from game content. A product sells either an item
-- (including a jutsu scroll) or an ability directly.
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id  UUID NOT NULL REFERENCES game_systems(id) ON DELETE CASCADE,
    item_id         UUID,
    ability_id      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, game_system_id),
    CHECK ((item_id IS NOT NULL) <> (ability_id IS NOT NULL)),
    FOREIGN KEY (item_id, game_system_id)
        REFERENCES items(id, game_system_id) ON DELETE RESTRICT,
    FOREIGN KEY (ability_id, game_system_id)
        REFERENCES abilities(id, game_system_id) ON DELETE RESTRICT
);

CREATE TABLE store_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id  UUID NOT NULL REFERENCES game_systems(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL,
    price           NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    currency_code   TEXT NOT NULL DEFAULT 'credits',
    stock_quantity  INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, game_system_id),
    FOREIGN KEY (product_id, game_system_id)
        REFERENCES products(id, game_system_id) ON DELETE RESTRICT
);

CREATE TABLE purchases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    game_system_id  UUID NOT NULL REFERENCES game_systems(id) ON DELETE RESTRICT,
    character_id    UUID,
    status          TEXT NOT NULL DEFAULT 'completed',
    total_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    currency_code   TEXT NOT NULL DEFAULT 'credits',
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (character_id, game_system_id)
        REFERENCES characters(id, game_system_id) ON DELETE RESTRICT,
    UNIQUE (id, game_system_id),
    CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded'))
);
CREATE INDEX purchases_user_idx ON purchases(user_id, purchased_at DESC);

CREATE TABLE purchase_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id         UUID NOT NULL,
    store_product_id    UUID NOT NULL,
    game_system_id      UUID NOT NULL,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    unit_price          NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    product_name        TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (purchase_id, game_system_id)
        REFERENCES purchases(id, game_system_id) ON DELETE CASCADE,
    FOREIGN KEY (store_product_id, game_system_id)
        REFERENCES store_products(id, game_system_id) ON DELETE RESTRICT
);
CREATE INDEX purchase_items_purchase_idx ON purchase_items(purchase_id);

CREATE TABLE campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_system_id  UUID NOT NULL REFERENCES game_systems(id) ON DELETE RESTRICT,
    owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, game_system_id),
    CHECK (status IN ('active', 'paused', 'completed', 'archived'))
);

CREATE TABLE campaign_members (
    campaign_id     UUID NOT NULL,
    character_id    UUID NOT NULL,
    game_system_id  UUID NOT NULL,
    role            TEXT NOT NULL DEFAULT 'player',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, character_id),
    FOREIGN KEY (campaign_id, game_system_id)
        REFERENCES campaigns(id, game_system_id) ON DELETE CASCADE,
    FOREIGN KEY (character_id, game_system_id)
        REFERENCES characters(id, game_system_id) ON DELETE CASCADE,
    CHECK (role IN ('player', 'game_master'))
);

CREATE TABLE chat_rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, campaign_id)
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID NOT NULL,
    campaign_id     UUID NOT NULL,
    character_id    UUID NOT NULL,
    content         TEXT NOT NULL CHECK (length(trim(content)) > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (room_id, campaign_id)
        REFERENCES chat_rooms(id, campaign_id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id, character_id)
        REFERENCES campaign_members(campaign_id, character_id) ON DELETE CASCADE
);
CREATE INDEX messages_room_created_idx ON messages(room_id, created_at);

COMMIT;
