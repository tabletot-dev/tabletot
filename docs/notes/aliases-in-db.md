# Aliases in DB

Added in migration `0008_menu_item_aliases.sql`.

## Migration count

163 aliases imported from `menus/roast-ccx-hyd.json` into `menu_item_aliases`.

29 aliases were **not** imported — these are group-level aliases (e.g., `"waffle" → "belgian_waffle"`, `"naan" → "naan"`) where the target is a variant-group item. `import_menu.py` only creates `menu_items` rows for individual variants, not for the group parent, so there is no UUID to reference. These aliases continue to work via the JSON file fallback (see below).

## Schema

```sql
menu_item_aliases (
  id             uuid PRIMARY KEY,
  restaurant_id  uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  item_id        uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  alias          text NOT NULL,
  UNIQUE(restaurant_id, alias)
)
```

## How to add a new alias

```sql
INSERT INTO menu_item_aliases (restaurant_id, item_id, alias)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  (SELECT m.id FROM menu_items m
   JOIN external_id_mapping e ON e.internal_item_id = m.id
   WHERE e.provider = 'petpooja' AND e.external_id = 'south_indian_filter_coffee'),
  'madras coffee'
);
```

After inserting, the alias takes effect on the next `/admin/refresh-menu` call or within 5 minutes (background refresh cycle).

A future dashboard feature could expose alias management in a UI instead of raw SQL.

## Fallback behaviour

`src/loader.py → apply_aliases_overlay()` is called at startup and on every 5-minute refresh:

- **DB has ≥ 1 row** → DB aliases replace JSON aliases entirely (JSON aliases are ignored).
- **DB returns 0 rows** (empty table, DB unreachable, or `db_restaurant_id` not configured) → JSON aliases from the menu file remain in effect as-is.

Because fallback is all-or-nothing (not per-alias merge), any alias you want active must be in the DB once you've run the import. The 29 group-level aliases currently live only in the JSON and are silently lost when DB aliases take over. To restore them, you would need to add group-parent rows to `menu_items` (or change the fallback strategy to merge DB + JSON).
