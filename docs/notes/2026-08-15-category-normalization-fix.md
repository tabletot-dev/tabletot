# Category free-text fragmentation fixed (2026-08-15)

Fixes finding #7 in `docs/notes/pos-only-live-qa-findings.md`: the Menu
Management "Category" field was plain free text with zero normalization, so
a staff typo (extra whitespace, different casing) created a second,
visually separate category tab on the kiosk menu with no merge/dedupe path.

## Fix

`apps/pos/src/pages/Menu.tsx`:
- New `normalizeCategory(raw)`: trims and collapses internal whitespace,
  then case-insensitively matches against the categories already in use
  (`categories`, already computed from `menuItems`). A match reuses the
  existing category's exact casing; no match falls through to the
  trimmed/collapsed input as a genuinely new category. Wired into
  `handleSubmit`'s `itemData.category`.
- Added a native `<datalist>` bound to the category `<Input>` via
  `list="category-suggestions"`, populated from the same `categories`
  array — browser-native autocomplete so staff see and pick existing
  categories while typing, instead of retyping from memory. No new
  dependency, no custom dropdown component.

## Verification

`npx tsc --noEmit` clean. Live browser test against POS dev server
(localhost:8081, `user@test.com`): opened Add Item, entered category
`"pastas "` (lowercase, trailing space — deliberately typo'd vs. the
existing `"Pastas"` category), submitted. Queried the DB directly:
`menu_items.category` for the new row is `Pastas`, not a second variant —
confirmed it joined the existing category rather than fragmenting it.
Deleted the test item afterward (via the app's own confirm dialog, see
`docs/notes/2026-08-15-confirm-dialog-fix.md`) to leave no debris.

Not covered: existing dirty category data from before this fix (none found
locally — the `pastas ` test debris mentioned in the original QA note was
already cleaned up). If a restaurant's live menu accumulates near-duplicate
categories before this fix ships, they won't be auto-merged retroactively —
this only prevents new fragmentation going forward.
