---
id: "0012"
title: "Voice engine menu overlay uses restaurant_id + name matching, not Petpooja external_id"
date: 2026-05-25
status: accepted
tags: [voice-engine, db, menu]
---

# 0012 — Voice engine menu overlay uses restaurant_id + name matching, not Petpooja external_id

## Context

The voice engine (order-engine) loads its menu from a JSON file (`silver-ssc-hyd.json`) at startup. To allow POS price/active changes to propagate without a restart, `loader.py` has an overlay mechanism: it queries the DB for current prices and active flags, then applies them over the JSON-loaded index.

The original overlay query was:

```sql
SELECT e.external_id, m.price, m.active
FROM menu_items m
JOIN external_id_mapping e ON m.id = e.internal_item_id
WHERE e.provider = 'petpooja'
```

Silver Specialty Coffee has no Petpooja POS and therefore no rows in `external_id_mapping`. The overlay returned 0 rows and the voice engine ran entirely from the JSON file — POS price changes had no effect.

## Decision

Change `load_menu_overlay_from_db` to query by `restaurant_id` and key the result by `normalize(item_name)`:

```sql
SELECT m.name, m.price, m.active
FROM menu_items m
WHERE m.restaurant_id = %s
```

`apply_overlay` builds a `name_to_id` translation map (`normalize(item.name) → json_item_id`) before applying the overlay, so the rest of the function continues to operate by JSON item ID internally. If zero DB items match JSON menu entries, a `WARNING` is logged and the original index is returned unchanged.

## Alternatives considered

- **Keep the Petpooja JOIN; populate `external_id_mapping` for Silver** — requires importing all Silver menu items with synthetic Petpooja IDs. This couples Silver's data model to the Petpooja adapter when Silver has no Petpooja POS. Rejected as artificial dependency.
- **Build `MenuIndex` entirely from DB** (no JSON file) — the right long-term answer. The JSON file is structurally richer (aliases, time windows, variant groups, modifiers) than the flat `menu_items` rows. A full DB-native index requires migrating all structural data to the DB. Deferred to post-pilot as ADR 0012 explicitly calls out.
- **Manual trigger only (`/admin/refresh-menu`)** — POS Menu page could call the endpoint on every save, bypassing the background refresh. Works but means a background crash or missed call leaves stale data indefinitely. Both mechanisms now work together.

## Consequences

- Price changes and item deactivations made in the POS propagate to the voice engine within 5 minutes (background refresh) or immediately (POS Menu page calls `/admin/refresh-menu` on save).
- **New items added via POS do not appear in the voice engine** until the JSON file is updated and the engine is restarted. This is the structural gap that full DB-native menu loading would close. Acceptable for the pilot where menu additions are infrequent.
- The name-matching approach is case-insensitive and punctuation-agnostic (via `normalize()`), making it robust to minor naming differences between the DB and JSON.
- If no DB items match (e.g. a restaurant with no `menu_items` rows, or a misconfiguration), the overlay is skipped entirely and the JSON is used as-is. The `WARNING` log makes this visible without crashing.
- Variant-level overlay is not yet supported — `items_by_id` name-matching covers top-level items only. Variant prices come from the JSON file modifiers. Acceptable for Silver SSC where variants aren't independent `menu_items` rows.
