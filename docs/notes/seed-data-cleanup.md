# Seed Data Cleanup — 2026-04-30

## What was deleted and why

`supabase/seed.sql` originally contained placeholder `menu_items` and `anchor_items`
rows using deterministic UUIDs (`aaaaaaaa-0001-…` through `aaaaaaaa-0006-…`) inserted
as stand-ins before the real menu import existed. After running `scripts/import_menu.py`
(see [menu-import.md](menu-import.md)), these fake rows became stale and conflicted with
the real Roast CCx data.

### Rows deleted

| Table | Rows deleted | Notes |
|---|---|---|
| `recommendation_events` | 26 | FK child of fake menu_items; test/demo events only |
| `anchor_items` | 4 | Fake chef_picks referencing fake items |
| `menu_items` | 6 | The 6 placeholder items themselves |
| `external_id_mapping` | 0 | Fake items had never been mapped |
| `item_pairings` | 0 | None referenced fake items |
| `item_variants` | 0 | None |
| `item_addons` | 0 | None |

Fake items deleted: Filter Coffee, Cold Brew, Chicken Sandwich, Belgian Waffle,
Masala Chai, Mushroom Toast — all fabricated, not real Roast CCx menu entries.

## Final row counts after cleanup

| Table | Count |
|---|---|
| `menu_items` | 325 |
| `external_id_mapping` | 325 |
| `anchor_items` | 0 |

All 325 rows are real Roast CCx menu items imported from
`services/order-engine/menus/roast-ccx-hyd.json`.

## What remains in seed.sql and why

Only the `restaurant_tables` seed (T1, T2, T3) is kept. Table numbers are
environment-specific setup that belongs in seed — unlike menu data, which is
managed by `scripts/import_menu.py`.

A comment in seed.sql now explicitly directs future developers to use
`scripts/import_menu.py` for menu data instead of adding rows to seed.sql.
