# Database

This folder contains the PostgreSQL schema and migration history for the RPG platform.

## Layout

- `migrations/`: ordered, forward-only database migrations.
- `schema/`: domain map and conventions for the current schema.

Apply the numbered files in `migrations/` in order to a new Supabase project (PostgreSQL 13+). Each migration is transactional. Migration 003 links the app user records to `auth.users`, removes the local password field, and creates profiles for existing and new Auth users. Existing `public.users` IDs must match rows in `auth.users` before applying migration 003.

## Domains

- Accounts: Supabase `auth.users`, app mirror `public.users`, `user_profiles`
- Systems and sheets: `game_systems`, `characters` (after migration 002)
- Game content: `abilities`, `items`, `achievements`
- Character progression: `character_abilities`, `character_inventory`, `character_achievements`, `user_achievements`
- Character trading: `trade_offers`, `trade_offer_lines` (migration 012)
- Store: `products`, `store_products`, `purchases`, `purchase_items`
- Campaign and chat: `campaigns`, `campaign_members`, `chat_rooms`, `messages`
- Daily login: `daily_login_rewards` (one configured item per weekday and system), `daily_login_claims` (account-level claim ledger)
- User hierarchy: `private.platform_admins` (global Admins), `game_system_memberships` (Owner, Mod, User per system)
- Notifications: `notifications` (recipient-scoped in-app inbox for system events)

Migration 014 adds an optional, case-insensitive unique profile nick. Each account must claim one before using the dashboard; the database does not permit changing a claimed nick.

Migration 015 versions character sheets into ordered steps and components. Migration 016 adds validated, positioned text and image elements to each step and is required before creating or saving sheets that use those elements.
Migration 020 adds public/private system access with bcrypt password hashes. Migration 021 requires access for protected system content, stores the password hash outside authenticated column access, and clears it when protection is removed. The equivalent Supabase CLI migrations are `20261113220000_game_system_visibility_password.sql` and `20261113221000_system_password_access_enforcement.sql`.

Migration 005 adds an optional owner-managed seven-day reward calendar to each RPG system. Weekdays use ISO numbering (Monday=1 through Sunday=7), and each system uses its configured IANA timezone (default `America/Sao_Paulo`) to decide the current reward and claim date. Missed days do not accumulate. Each account can claim once per system and local date, choosing an active character they own in that system. The claim RPC records the claim and increments that character's existing inventory in one transaction. The item and quantity are snapshotted in the claim history.

Migration 006 establishes the hierarchy. `Admin` is global and comes only from `private.platform_admins`; bootstrap or change this table through trusted operator/database tooling. `Owner`, `Mod`, and `User` are per-system rows in `game_system_memberships`. Legacy `game_systems.owner_user_id` values are backfilled as Owners and retained for compatibility; authenticated system creation also makes the creator Owner. Owners can grant or revoke Mod for an existing member through `set_system_moderator`; clients cannot write memberships directly. Migration 009 also lets Owners and Mods publish system announcements.

Owners manage all seven daily-login calendar entries through `set_daily_login_reward_schedule`, and the database verifies every item belongs to that same system. The browser-facing Supabase role can read the calendar and its own claim history, but cannot write either table directly. Migration 007 enables RLS across the public application tables and scopes normal access by account, campaign, and system role; Admin policies provide global app-data access.

The `game_system_id` foreign key scopes content and validates that campaign members, products, and purchases use the matching game system. A shop product sells one item or one ability; a scroll should be modeled as an item that grants an ability. `purchase_items` snapshots the display name and unit price so later catalog edits do not rewrite purchase history.

Migration 009 adds `public.notifications` with a string type and JSONB payload so new notification types do not require a PostgreSQL enum change. RLS allows each authenticated user to read only their own rows; clients cannot directly create notifications or alter their payload/recipient. The moderator-role RPC creates a notification for a real role change in the same transaction. Owner/Mod announcement RPCs validate system membership and fan out one inbox row per current member. Read-state changes also use an authenticated RPC.

Migration 012 gives each inventory stack a stable ID and permits multiple stacks of one item when their JSONB characteristics differ. Trade offers and counteroffers are asynchronous and same-system; offer acceptance revalidates stack IDs, metadata, and quantities, then debits and credits every line in one database transaction. Pending offers do not reserve inventory. Trade tables are not directly exposed through RLS; authenticated RPCs scope character discovery and inventory visibility to the selected same-system trade context. Offers expire after 14 days, retain item and metadata snapshots, and write in-app notifications for offer changes. Daily-login rewards continue to merge into the default-metadata stack.

The canonical file is `database/migrations/009_notifications.sql`; the generated Supabase CLI migration contains the same SQL. The local daily-login popup migration 008 is also mirrored under `supabase/migrations/`. Apply either the canonical numbered migration sequence or the Supabase CLI migration sequence to a database, not both.

## Conventions

- Use Supabase Auth for sign-in and password management; never store passwords in the app tables.
- Use a new numbered migration for later changes; do not edit an existing migration.
- `updated_at` columns are initialized by the database; the API should update them when it changes a row.
- Store mutable, system-specific attributes in `characters.attributes` (JSONB) while keeping frequently queried fields and relationships in relational columns.
- Migration 018 implements character wallets and atomic item purchases. Payment processing and refunds remain outside the store scope.
- Migration 007 configures Row Level Security for the public app tables before they are exposed through the Supabase Data API.

## System store economy (018)

`game_systems.currency_name` defaults to `Créditos`; existing owner RLS controls changes. Owners manage item products/offers through the existing catalog policies. Offers have unlimited supply: the legacy `stock_quantity` and `currency_code` on offers are ignored by purchases. Only item products are purchasable.

`character_wallets` contains one zero-initialized balance per character, including existing characters. `character_currency_ledger` records nonzero grants/debits with source identity, currency/item snapshots, and resulting balance. Authenticated clients can only read rows for characters they control and cannot write wallets or ledger rows. Future owner-configured mission/event/fight awards may add source types; this migration does not implement those integrations or manual grants.

`purchase_store_product(p_character_id UUID, p_store_product_id UUID, p_quantity INTEGER)` validates the authenticated controller, active character/system, same-system item offer, quantity (1–1,000,000), availability, and funds. A wallet row lock serializes debits. Wallet debit, completed purchase, price/name/currency snapshots, default-metadata inventory delivery, and ledger entry share one transaction. Success returns `status=purchased`, `balance`, `purchase_id`, `item_id`, `item_name`, `quantity`, `amount_charged`, and `currency_name`; rejection statuses are `unauthorized`, `invalid_quantity`, `invalid_character`, `system_unavailable`, `offer_unavailable`, `system_mismatch`, and `insufficient_funds` (with balance). The legacy purchases.currency_code stores the currency name snapshot.

Prices, daily amounts, and purchase totals use two decimals and a maximum of 9,999,999,999.99; wallets/ledger use NUMERIC(16,2). The daily schedule RPC accepts optional `currency_amount` per day (default zero). Successful daily claims additionally return `currency_awarded` and `currency_name`; claims snapshot these values. A zero amount still delivers the scheduled item and existing XP. The unique account/system/local-date claim prevents duplicate item, XP, or money awards. No ledger row is needed for a zero-value movement.
