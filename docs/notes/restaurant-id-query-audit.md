# Restaurant-ID Query Audit — Kiosk App

Added `VITE_RESTAURANT_ID` env var and scoped all Supabase queries to the active restaurant.

## Env var

`VITE_RESTAURANT_ID` — UUID matching `restaurants.id` in Supabase for this deployment.

- Set in `apps/kiosk/.env.local`: `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91 (Silver Specialty Coffee Hyderabad — pinned in migration 0014))
- Template in `apps/kiosk/.env.example` with comment

Each file reads it as a module-level constant:
```ts
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
```

## Files and queries updated

### `src/lib/menuStore.ts`
- `menu_items` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`

### `src/lib/orderSubmission.ts`
- `restaurant_tables` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`
- `orders` INSERT — added `restaurant_id: RESTAURANT_ID`
- `kot_tickets` INSERT — added `restaurant_id: RESTAURANT_ID`

### `src/components/ChefsPicks.tsx`
- `anchor_items` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`
- `recommendation_events` INSERT (batch) — added `restaurant_id: RESTAURANT_ID` to each row

### `src/components/PairingNudge.tsx`
- `item_pairings` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`
- `recommendation_events` INSERT — added `restaurant_id: RESTAURANT_ID`

### `src/components/CompletionNudge.tsx`
- `menu_items` SELECT (by id) — added `.eq('restaurant_id', RESTAURANT_ID)`
- `recommendation_events` INSERT — added `restaurant_id: RESTAURANT_ID`

### `src/pages/Index.tsx`
- `meal_completion_rules` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`

## Tables not scoped (no query in kiosk)

- `menu_item_aliases` — queried only by the order-engine backend, not the kiosk
- `external_id_mapping` — backend only

## Notes

- `recommendation_events` UPDATE queries (flipping `item_accepted`) use the row's `id` (UUID PK) — no `restaurant_id` filter needed there.
- `anchor_items` uses `menu_items!inner(...)` join — the restaurant filter on `anchor_items` is sufficient; the join already constrains to items belonging to those anchors.

## POS (added 2026-08-02, `docs/plans/2026-08-02-three-app-hardening.md` Task 2.2)

Kiosk was scoped above; the POS never was. Single-tenant pilot today, so no
live impact, but at restaurant #2 the kitchen would see the other café's
tickets. `RESTAURANT_ID` imported from `apps/pos/src/lib/restaurant.ts`.

### Files and queries updated

- `src/pages/Menu.tsx` — `menu_items` SELECT and INSERT scoped.
- `src/pages/AdminMenuItems.tsx` — `menu_items` SELECT and INSERT scoped.
- `src/pages/Kitchen.tsx` — `kot_tickets` SELECT scoped. Realtime `INSERT`
  listener filters on `status=eq.accepted` already — Postgres Changes only
  supports one filter clause per subscription, so `restaurant_id` is checked
  client-side in the callback instead of a second `filter` clause.
- `src/pages/Orders.tsx` — `orders` SELECT and its Realtime channel scoped
  (single filter clause, no conflict with another clause here).
- `src/pages/Billing.tsx` — `fetchTables`'s `restaurant_tables` SELECT and its
  Realtime channel scoped.
- `src/pages/Reports.tsx` — `fetchDayCloseData`'s live `orders` query scoped
  (2026-08-02, Phase 1 Task 1.1).

### Not scoped — schema gap, not an oversight

`order_history` has **no `restaurant_id` column** (0043's comment: "restaurant
scoping is implicit" — a single-tenant-pilot assumption baked into the schema,
not enforced). `Reports.tsx` (both `order_history` queries) and `Orders.tsx`
(the settled-orders union, added alongside this scoping pass) read it
unscoped. Needs a migration (add the column) before a second restaurant is
onboarded — and there's no way to backfill history written before the column
existed, since the source `orders` row is deleted by the time it's archived.
Worth an ADR, not a quiet column add.

### Not scoped — out of Task 2.2's list, may still be a gap

`bill_requests` and `table_requests` (read in `Billing.tsx`'s
`fetchBillRequests`/`fetchTableRequests`) were not in this task's file list
and weren't checked for a `restaurant_id` column. Flagging for a follow-up
pass, not fixed here.
