# Veg/Non-veg toggle added to live Menu Management (2026-08-15)

Partial fix for finding #8 in `docs/notes/pos-only-live-qa-findings.md` —
option 1 (minimal), not the full `AdminMenuItems.tsx` swap. Rohan's call
after scoping option 2 (the dead-code swap) and finding it required porting
several unrelated fixes (native confirm(), voice-menu refresh, category
normalization, missing description/image_url fields) to avoid regressions —
decided that was more than needed right now.

The live `Menu.tsx` form had no way to set `menu_items.is_veg`, the real
boolean column the kiosk's `DietMark` badge and veg/non-veg filter
(`MenuView.tsx`) both read. Staff could only set it at menu-JSON-import
time, not after.

## Fix

`apps/pos/src/pages/Menu.tsx`:
- `MenuItem` interface and the `fetchMenuItems` select both gained `is_veg`.
- `formData` gained `is_veg` (defaults to `true`, matching the DB column's
  default), threaded through `handleSubmit`'s `itemData`, `handleEdit`'s
  form population, and `resetForm`.
- New "Vegetarian" `Switch` in the Add/Edit dialog, next to the existing
  "Available" switch.
- Small colored square dot next to each item's name in the list (green/veg,
  red/non-veg — same visual language as the kiosk's diet mark, just a plain
  CSS square here rather than importing the kiosk's SVG component across
  app boundaries).

Not touched: `tags` (separate live feature — kiosk descriptor badges like
"Chef's Pick", currently unpopulated for this restaurant, no admin UI for
it either) and `AdminMenuItems.tsx`/`AdminCategories.tsx` (still dead code,
untouched).

## Verification

`npx tsc --noEmit` clean. Live browser test against POS dev server
(localhost:8081): created a test item with Vegetarian off — confirmed
`is_veg=false` in the DB (not just the UI). Confirmed the list showed a red
dot for it. Edited the same item, confirmed the switch loaded correctly
unchecked (round-trip, not just write), flipped it back on, saved, confirmed
`is_veg=true` in the DB. Deleted the test item to leave no debris.
