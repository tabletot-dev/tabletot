# Order-Engine: Menu from Supabase DB with 5-min Refresh

## What changed

The order-engine now applies a DB overlay on top of the file-loaded `MenuIndex` at startup
and refreshes it every 5 minutes. The menu resolver's matching logic is unchanged.

## How it works

```
Startup
  → load_menu(menu_path)           # full structure from menu.json (items, variants, aliases, time windows)
  → load_menu_overlay_from_db()    # SELECT external_id, price, active FROM menu_items JOIN external_id_mapping
  → apply_overlay(index, overlay)  # update prices; prune inactive items/entries/aliases
  → MenuIndex stored in SessionManager._menus[rid]

Every 5 minutes (background asyncio task)
  → load_menu_overlay_from_db()    # fresh query
  → apply_overlay(load_menu(...), overlay)
  → SessionManager._menus[rid] replaced
  → new sessions pick up the refreshed index; existing sessions keep their snapshot
```

## Why menu.json stays the structural source of truth

The DB stores flat rows: `(id, name, category, price, active, tags)`. The resolver needs
the full hierarchy: `variant_group` item types, per-variant pricing, aliases, time windows,
modifiers. None of that is in the DB. So the DB is only consulted for two fields:
`price` (runtime override) and `active` (soft-delete propagation).

## Fallback to menu.json

If the DB is unreachable at startup or during a refresh, `load_menu_overlay_from_db()`
logs a warning and returns `{}`. `apply_overlay(index, {})` is a no-op — the original
index is returned unchanged. The server starts and runs normally; prices and active flags
are just stale (menu.json values).

Log line when this happens:
```
WARNING:src.loader:DB unavailable, using local menu.json cache: <error>
```

## `/admin/refresh-menu` endpoint

```
POST http://localhost:8000/admin/refresh-menu
→ {"status": "ok", "item_count": <total entries across all restaurants>}
```

Call this from the POS admin immediately after editing menu items (price, active toggle)
to avoid waiting for the 5-minute cycle. No auth for now (pilot only).

## Where aliases live

Aliases are defined in `menus/<restaurant>.json` under `"aliases": {}` — a flat
`{phrase: petpooja_item_id}` map. They are not in the DB. They grow from real
transcripts and are edited by the developer, not through the POS admin.

`apply_overlay` does prune aliases whose target item has been deactivated in the DB,
so deactivating an item via POS admin also silently removes its alias routes.

## Environment

`DATABASE_URL` env var overrides the default Supabase local connection
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
For production, set `DATABASE_URL` to the Supabase direct connection string.
