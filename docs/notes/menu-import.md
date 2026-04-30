# Menu Import — Roast CCx Hyderabad

**Date:** 2026-04-30  
**Source file:** `services/order-engine/menus/roast-ccx-hyd.json`  
**Menu version:** 1.0 (last updated 2026-04-05)

## Results

| Table | Rows inserted |
|---|---|
| `menu_items` | 325 |
| `external_id_mapping` | 325 |

All 325 rows map to `provider = 'petpooja'`.

Before the import, 6 seed/test rows already existed in `menu_items` (UUIDs like `aaaaaaaa-0001-...`). These have no `external_id_mapping` entries and were untouched by the import.

## What was imported

285 top-level menu entries from the JSON expanded into 325 `menu_items` rows:

- **Simple items** (type: `simple`) → 1 row each in `menu_items` + 1 row in `external_id_mapping`
- **Variant group items** (type: `variant_group`) → 1 row per variant, named `"<parent> – <variant>"` (e.g. `"Belgian Waffle – Nutella & Banana"`)
- `external_id` in the mapping is the item/variant's `id` string from the JSON (the Petpooja ID)

## Items skipped

None — no items in the menu have `active: false`.

## How to re-run

The script is safe to re-run; it uses `ON CONFLICT DO NOTHING` on both tables.

```bash
# From repo root, with the order-engine venv active:
services/order-engine/.venv/bin/python3 scripts/import_menu.py
```

The script reads `DATABASE_URL` from `services/order-engine/.env`, falling back to the local Supabase default (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
