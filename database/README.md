# Database

This folder contains the PostgreSQL schema and migration history for the RPG platform.

## Layout

- `migrations/`: ordered, forward-only database migrations.
- `schema/`: domain map and conventions for the current schema.

Apply the numbered files in `migrations/` in order to a new PostgreSQL 13+ database. Each migration is transactional. The schema uses UUID keys and JSONB for system-specific rules and sheet fields.

## Domains

- Accounts: `users`, `user_profiles`
- Systems and sheets: `game_systems`, `characters` (after migration 002)
- Game content: `abilities`, `items`, `achievements`
- Character progression: `character_abilities`, `character_inventory`, `character_achievements`, `user_achievements`
- Store: `products`, `store_products`, `purchases`, `purchase_items`
- Campaign and chat: `campaigns`, `campaign_members`, `chat_rooms`, `messages`

The `game_system_id` foreign key scopes content and validates that campaign members, products, and purchases use the matching game system. A shop product sells one item or one ability; a scroll should be modeled as an item that grants an ability. `purchase_items` snapshots the display name and unit price so later catalog edits do not rewrite purchase history.

## Conventions

- Keep credentials only as secure password hashes; authentication and hashing belong in the API.
- Use a new numbered migration for later changes; do not edit an existing migration.
- `updated_at` columns are initialized by the database; the API should update them when it changes a row.
- Store mutable, system-specific attributes in `characters.attributes` (JSONB) while keeping frequently queried fields and relationships in relational columns.
- The initial schema does not implement wallets, payment processing, inventory delivery, or purchase refunds. Those need explicit transaction and audit rules before enabling the store.
