# Table status guarded against manual override during a live order (2026-08-15)

Fixes finding #5 in `docs/notes/pos-only-live-qa-findings.md`: Table
Management's Available/Occupied/Reserved/Cleaning dropdown wrote straight to
`restaurant_tables.status` with no check against real order state, and that
same column is also written automatically by `append_event` (session_started
→ occupied, order_submitted → occupied, payment_settled/service_ended →
available). Two independent writers on one column, no coordination.

Chosen fix (Rohan's call, over a bigger schema split): guard the manual
write path instead of separating the columns — block a manual status change
whenever the table has a real, non-idle order in flight. Pilot-sized, no
migration.

## What actually reproduced

Before writing any code, queried the live local DB and found the bug
already present, unprompted: table T2 showed `status='occupied'` with zero
orders ever recorded against it and `table_state.state='idle'` — a stale
manual/seed value with no real session behind it. This is the exact
"Table Management shows X while reality is Y" symptom from the original
finding, just caught mid-drift rather than reproduced from scratch.

`current_order_id` (the column the original guard attempt assumed was the
live-order signal) turned out to be dead — grepped the whole apps/ tree,
nothing writes to it, ever. `table_state.state` (idle / ordering /
bill_requested), maintained exclusively by `append_event`, is the real
ledger of whether a table has a live order. Switched the guard to that.

## Fix

`apps/pos/src/pages/TableManagement.tsx`:
- `RestaurantTable` gets a new client-side field `order_state`, populated
  from a `table_state` query joined by `table_id` in `fetchData` (defaults
  to `'idle'` for tables with no `table_state` row yet).
- Realtime subscription now also listens on `table_state` changes, not just
  `restaurant_tables`, so the grid reflects a new order landing without a
  manual refresh.
- `updateStatus` (the inline status dropdown in the table list) and
  `handleSubmit` (the edit-table dialog) both check `order_state !== 'idle'`
  before writing; if true, the write is blocked with a toast ("Table has an
  active order — settle the bill in Billing before changing this table's
  status") instead of silently overwriting what the real order flow set.

## Verification

`npx tsc --noEmit` clean. Live end-to-end via `append_event` (same RPC the
kiosk/POS call) against the local Supabase instance:
1. Seeded a real session + order on T1 (`session_started` → `order_submitted`)
   — confirmed `table_state.state` flipped to `ordering` and
   `restaurant_tables.status` correctly auto-set to `occupied`.
2. In the live POS UI, tried to manually change T1's status dropdown to
   "Available" — blocked, toast fired, DB status stayed `occupied`
   (confirmed by direct query, not just the UI not refreshing).
3. Settled the order (`payment_settled`) — `table_state` returned to `idle`,
   `restaurant_tables.status` auto-reset to `available`.
4. Manually changed T1's status again (now idle) — succeeded immediately,
   no block. Confirms the guard only fires while a real order is open, not
   permanently.
5. Cleaned up: reset both T1 and T2 to `available` (T2 had zero real orders
   behind its stale `occupied`, so this is a legitimate correction, not data
   loss) and killed the POS dev server.

Not covered: this guards future drift, it doesn't reconcile any other
already-drifted rows beyond the one (T2) found and fixed here. If
`status`/`table_state` desync again after this fix ships, that's a new bug,
not a recurrence of #5's root cause.
