# Stale table state in POS Billing, fixed (2026-08-15)

Fixes findings #2 and #3 in `docs/notes/kiosk-pos-live-qa-findings.md`:
a days-old stuck order resurfacing as a table's "current bill" after a fresh
order was placed, and the table grid briefly showing "Free" (plus stale
bell/water badges) for a table the ledger says is actually live.

## Root cause

Both bugs trace back to the same pattern in `apps/pos/src/pages/Billing.tsx`:
trusting a column that can drift from the ledger instead of checking the
ledger itself.

- **#2**: `loadActiveOrder` fetched the table's order by
  `restaurant_tables.current_order_id`. That pointer is set by a trigger
  (`wire_order_to_table_on_insert`, migration 0019/0025) guarded with
  `AND current_order_id IS NULL` — "first order wins, forever." It's only
  ever cleared by `payment_settled`/`service_ended`. A session that never
  reaches either (abandoned test debris, a forgotten table) leaves the
  pointer stuck on that order permanently — no later order for the table can
  ever displace it, so Billing kept showing the ancient order as current even
  after a fresh one was placed and settled.
- **#3**: the Free/Occupied label and the bell/water badges were driven
  purely by `restaurant_tables.status` and raw `bill_requests`/
  `table_requests` rows, with no check against whether the table's ledger
  session (`table_state.state`) was actually live. `status` can transiently
  read "available" right after load while the ledger already has a session
  open, and a pending request row left behind by a session that already
  ended can keep flashing a badge on a table that's genuinely free again.
  This is the same class of bug `TableManagement.tsx` already guards against
  via its `order_state` field (see `a4636c8`) — that fix covers the *edit*
  path there, not Billing's *display* path.

Considered also making the `wire_order_to_table_on_insert` trigger
self-healing (re-wire once the old order is terminal). Ruled out: the stuck
order in the actual repro was sitting in `ready`, not `cancelled` — a status
check alone can't tell "abandoned test debris" apart from "a real order
that's legitimately ready and about to be served," so a status-only trigger
fix risks yanking `current_order_id` away from genuine in-flight orders.
Doing this safely needs a time-based staleness cutoff, which is separate,
larger scope (Kitchen Display changes) not covered by this fix.

## Fix

`apps/pos/src/pages/Billing.tsx`:

- `loadActiveOrder` now resolves the table's order via its most recent LIVE
  session (`sessions.status IN ('active','bill_requested')`, newest
  `started_at`) first, falling back to `current_order_id` only if no live
  session is found. A stuck pointer can no longer hide a fresh order.
- `fetchIdleSignals` now fetches `table_state` for **all** tables (previously
  scoped to tables already marked `occupied` by the possibly-wrong `status`
  column — which excluded exactly the tables this bug affects) and exposes a
  new `liveStateByTable` map.
- The table grid's label/color now reconciles: if `status` reads
  "available"/"free" but the ledger's `table_state.state` isn't `idle`, the
  display floors to "Occupied" rather than showing Free.
- `tableHasBillReq`/`tableHasWaterReq` are now gated on the same live-state
  check, so a pending request row from an already-ended session can't keep
  badging a table that's genuinely free.

## Verification

No test framework exists in `apps/pos` yet (kiosk has vitest; POS has none) —
setting one up solely for this fix was out of scope, so verification follows
the same DB-seed + live-browser pattern as `0059`'s fix:

- `tsc --noEmit` clean.
- **#2**: seeded a 10-day-old session/order (`ready` status) on Table T2 with
  `current_order_id` wired to it, then a fresh session/order for the same
  table (trigger left the pointer stuck on the old one, reproducing the
  bug). Confirmed via direct SQL that the old query resolves to the stale
  order and the new query resolves to the fresh one; confirmed live in POS
  (localhost:8081) that Billing's active-order panel shows the fresh order.
- **#3**: set `table_state.state = 'ordering'` while
  `restaurant_tables.status = 'available'` on T2 — grid showed "Occupied,"
  not "Free." Reverted to `idle` — grid correctly showed "Free" again.
  Seeded a pending `bill_requests` row while `table_state` was `idle` — no
  bell badge shown; set `table_state.state = 'bill_requested'` — badge
  appeared. All test rows cleaned up afterward.
