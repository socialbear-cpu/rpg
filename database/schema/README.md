# Schema domains

The canonical DDL is in the ordered files under `../migrations/`. This directory documents the resulting schema after all migrations, without duplicating the SQL.

| Domain | Tables |
| --- | --- |
| Accounts | `users`, `user_profiles` |
| Authorization | `private.platform_admins`, `game_system_memberships` |
| Game systems and sheets | `game_systems`, `game_system_character_sheets`, `characters` |
| Content | `abilities`, `items`, `achievements` |
| Character progression | `character_abilities`, `character_inventory`, `character_achievements`, `user_achievements` |
| Character trading | `trade_offers`, `trade_offer_lines` |
| Store and orders | `products`, `store_products`, `purchases`, `purchase_items` |
| Campaigns and chat | `campaigns`, `campaign_members`, `chat_rooms`, `messages` |

The store is a domain belonging to a game system. `products` connects the store catalog to game content, while `store_products` is the listing/offer with price, currency, availability, and optional stock.

`Admin` assignments are global and stored in the non-exposed `private.platform_admins` table; manage them only through trusted operator tooling. `Owner`, `Mod`, and `User` are system-scoped rows in `game_system_memberships`. Migration 006 backfills legacy `game_systems.owner_user_id` values as Owners and retains that column for compatibility. New authenticated system creators become Owners. Owners manage system content and grant/revoke Mod for existing members; Mod currently retains User permissions until moderation actions are specified.
