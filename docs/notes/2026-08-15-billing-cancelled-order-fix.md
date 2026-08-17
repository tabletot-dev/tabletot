# Billing screen — cancelled order still billable, fix (2026-08-15)

Fixes finding #1 in `docs/notes/pos-only-live-qa-findings.md`: cancelling an order
via `/orders` (status dropdown → Cancelled) left the Billing screen still showing
it as the table's active bill, full total, live "Settle" button.

Root cause: `Billing.tsx`'s `loadActiveOrder` fetched `orders` by
`table.current_order_id` with no status filter — cancelling an order never clears
`current_order_id` (that trigger only fires on `orders` INSERT and on session
close/settle), so the cancelled row stayed wired to the table and Billing kept
rendering it as billable. A live-Realtime subscription on the same order had the
same gap: an UPDATE pushing `status: 'cancelled'` was written straight into
`activeOrder` state unfiltered.

## Fix

`apps/pos/src/pages/Billing.tsx`, `loadActiveOrder`:
- Both the by-`current_order_id` lookup and the by-`session_id` fallback lookup
  now add `.neq('status', 'cancelled')`. A cancelled order resolves to `null`,
  which the UI already renders correctly ("No active order for this table" +
  "Start Order") — no new UI branch needed.
- The Realtime `postgres_changes` UPDATE handler on `activeOrder.id` now checks
  `updated.status !== 'cancelled'` before writing to state, so a *live* cancel
  (staff cancels in one tab while another has the table open in Billing) is also
  caught, not just a fresh page load.

## Verification

Live browser test against local Supabase + POS dev server (localhost:8081),
logged in as `user@test.com` (admin role):
1. Seeded a ₹410 test order on Table T1 directly in the DB, wired via
   `current_order_id` (mirrors the real trigger-set state).
2. Confirmed Billing showed it: `status: ready`, `Total: ₹431` (incl. GST),
   live green "Settle — ₹431" button.
3. Cancelled it via `/orders` → status dropdown → Cancelled — same repro path as
   the original finding.
4. Reloaded Billing → Table T1 now shows "No active order for this table" +
   "Start Order". No stale bill, no Settle button.

Not added as an automated regression test — `apps/pos` has no existing test
harness (no `test` script, no test files beyond `node_modules`), and standing
one up for this single query-filter fix would be disproportionate. The AOV
counterpart of this same bug class *does* have a regression test
(`apps/kiosk/tests/golden-session.test.ts`, "AOV v5") since that harness already
existed.

## Environment note (unrelated to this fix, discovered while verifying)

Confirms and resolves, for this local session, the grants gap noted in
`docs/notes/2026-08-15-aov-cancelled-order-fix.md`: every table in the local
Supabase Postgres instance was missing `SELECT/INSERT/UPDATE/DELETE` grants for
`anon`/`authenticated`/`service_role` (only `REFERENCES/TRUNCATE/TRIGGER`
existed), which blocked both `npm run test:golden` and POS login/table-loading
entirely (403s, "permission denied for table X"). Fixed locally by granting the
standard privileges + default privileges on the `public` schema (applied
manually via Supabase Studio's SQL editor, not committed — this is local Docker
state, wiped on the next `supabase db reset`). This predates this session; worth
someone checking why the local CLI/Postgres image isn't applying Supabase's
usual baseline grants, since it silently breaks all local testing until this is
either fixed at the source or re-applied after every `db reset`.
