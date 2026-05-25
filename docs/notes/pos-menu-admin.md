# POS Menu Management Page

## Route / URL

`/admin/menu-items` — accessible to `admin` and `manager` roles.  
Already wired in `App.tsx` and visible in the sidebar as "Menu Items".

## What the page does

**Section 1 — Item list**
- Table showing all `menu_items` rows: name, category, tags, price, active toggle
- Search by name (client-side, instant)
- Filter by category (dropdown populated from distinct categories already in the DB)
- Inactive items are visually dimmed (opacity-50) but still shown
- Active toggle hits the DB immediately without opening a dialog

**Section 2 — Edit / Add dialog**
- Opens via "Add Item" button (create) or the pencil icon on any row (edit)
- Fields: name (required), category (required, text input with datalist suggestions), price (required, number), tags (comma-separated text), active (checkbox)

## Fields that can be edited

| Field | Type | Notes |
|---|---|---|
| `name` | text | Required |
| `category` | text | Required; datalist shows existing category values |
| `price` | numeric | Required; must be > 0 |
| `active` | boolean | Toggleable inline or via dialog |
| `tags` | jsonb (`string[]`) | Entered as comma-separated text, e.g. `veg` or `non-veg, spicy` |

## Why delete is soft (active=false), not hard

`menu_items.id` is a foreign key in `recommendation_events.item_shown`, `anchor_items.item_id`, `item_pairings`, `item_variants`, and `item_addons`. Hard-deleting a row would cascade-delete or orphan those records, erasing recommendation history that's needed for AOV measurement. Setting `active=false` hides the item from the menu while preserving the historical FK integrity.

The Trash icon in the UI confirms before archiving and shows "Archive item (sets active=false)" in its tooltip.

## What is explicitly deferred

| Feature | Reason |
|---|---|
| Variant group editing | Complex; imported variants already exist as flat items in DB |
| Image upload | Not in scope for pilot |
| `external_id_mapping` edits | Adapter territory; managed by `scripts/import_menu.py` |
| Hard delete | Intentionally excluded; see FK rationale above |
| `menu_categories` sync | The canonical table uses free-text `category`; a formal category registry is post-pilot |
