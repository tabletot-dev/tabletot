# Kiosk redesign — Sprint 3 done (AOV-critical)

Sprint 3 from `docs/plans/2026-08-08-kiosk-v1-redesign.md`: Browse and
Detail. The AOV attribution guard from Task 0.1 stayed green through every
step in this sprint.

## What shipped
- **DishCard**: renamed to `.tt-dishcard` family, `.tt-btn--accent` for Add
  and pairing-add, `.tt-stepper` for quantity controls. Pairing panel eyebrow
  collapsed from two lines ("Pairs well with" / "Complete your order") to
  one: "GOES WELL WITH". The pairing logic (shown-once ref, the
  `recommendation_shown` effect, `handleAddPairing`) was not touched.
- **MenuView**: single-column `.tt-dish-list`, skeleton loading state (no
  spinner), a real connection-error state, and an empty-filter state with a
  "show all" reset. `menu_items.description` is now selected and typed on
  `MenuItem` — it was already a populated DB column the kiosk never read.
- **DetailView**: converted from an `AnimatePresence` modal overlay to a
  full-screen push (`item-detail` is now its own switch case in
  `Index.tsx`, not folded into `menu`). Deleted `dishType()` and
  `productDescription()` — the fabricated filler prose shown to paying
  customers — in favor of the real `item.description`. Dropped the "Type"
  fact tile (its only caller was the deleted `dishType()`).
- **Fixed the pairing-attribution bug the plan flagged**: `DetailView`'s
  pairing stepper called `onUpdateQuantity(id, delta)` with no source, which
  silently defaulted to `"main_menu"` in `Index.tsx`'s `handleUpdateQuantity`
  — so incrementing an already-added pairing from the detail view was
  invisible to `direct_revenue`. Now passes `"pairing_chip"` explicitly.
  **Verified against the real ledger, not just code review**: queried
  `table_events` directly before and after — the stepper increment's
  `item_added` event source flipped from what would have been `main_menu`
  to the correct `pairing_chip`.
- `item-detail` stayed off `AppShell`'s bare-screen list (matches the
  plan's `AppBar` header shown), but I removed it from the `OrderBar`
  condition — `DetailView` now has its own sticky price/CTA footer, and
  stacking a second docked cart bar under it was redundant clutter the
  plan didn't ask for.

## CSS cleanup
Deferred Task 3.1's and 3.2's per-screen CSS deletion to the end of the
sprint, since `.dish-card`/`.menu-product-grid` overlap heavily between
DishCard and MenuView — one pass was cheaper and safer than two. Wrote a
small CSS-aware script (tracks brace depth, multi-line `/* */` comments,
and comma-separated selector lists) rather than hand-editing ~120 scattered
occurrences: deleted 87 fully-dead rules and stripped 28 dead selectors out
of rules shared with still-live classes (e.g. `.confirmation-panel h1,
.status-hero h1` → just `.status-hero h1`). First pass had a bug — it
didn't track *multi-line* comments correctly and mangled one comment block
into bogus selectors with stray trailing commas; caught via the build's own
CSS-syntax warning, fixed, and reran from a backup rather than patching
forward. Verified brace-balanced, zero remaining references to the dead
classes, then rebuilt/retested/re-screenshotted Menu and Detail to confirm
no visual regression from the cleanup itself.

## Verified
`npm run build && npm test` green after every step. Visual walkthrough via
`/browse`: Menu (skeleton→real data, pairing panel, segmented diet filter —
fixed a "Non-Veg" text-wrap bug from equal-thirds `flex:1` sizing along the
way), Detail (real photo, real description, facts, pairing mini-adds,
sticky footer), both re-confirmed identical after the CSS cleanup pass.
