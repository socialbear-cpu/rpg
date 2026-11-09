# Schema domains

The canonical DDL is in the ordered files under `../migrations/`. This directory documents the resulting schema after all migrations, without duplicating the SQL.

| Domain | Tables |
| --- | --- |
| Accounts | `users`, `user_profiles` |
| Game systems and sheets | `game_systems`, `characters` |
| Content | `abilities`, `items`, `achievements` |
| Character progression | `character_abilities`, `character_inventory`, `character_achievements`, `user_achievements` |
| Store and orders | `products`, `store_products`, `purchases`, `purchase_items` |
| Campaigns and chat | `campaigns`, `campaign_members`, `chat_rooms`, `messages` |

The store is a domain belonging to a game system. `products` connects the store catalog to game content, while `store_products` is the listing/offer with price, currency, availability, and optional stock.
