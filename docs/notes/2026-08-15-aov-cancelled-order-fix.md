# AOV cancelled-order revenue fix (2026-08-15)

Fixes finding #1 in `docs/notes/aov-dashboard-live-qa-findings.md`: `get_aov_summary`
v4 counted cancelled orders (and any other unsettled order still sitting in the
live `orders` table) as revenue, because its live-`orders` branches had no
`status` filter. `order_history` needed no fix — a row only lands there via
`payment_settled`, so every row there is already a real, paid order.

`supabase/migrations/0058_get_aov_summary_v5.sql` adds `o.status <> 'cancelled'`
to both the `orders_agg` and `survived` CTEs' live-`orders` branches.

## Verification

Reproduced live against local Supabase (`supabase db reset` to apply 0058,
then a controlled repro: one `orders` row with `status='cancelled', total=500`
matched to a `table_events` `order_submitted` row in-window):

- v4 (temporarily reapplied as a control): `total_revenue = 500.00` — bug confirmed.
- v5: `total_revenue = 0.00` — cancelled order correctly excluded.

Also added a regression test, `apps/kiosk/tests/golden-session.test.ts` →
`AOV v5 (0058, docs/notes/aov-dashboard-live-qa-findings.md #1)`: submits an
order with a pairing-chip accept, cancels it via a direct `orders.status`
update (the same path POS's `/orders` status dropdown uses), and asserts both
`total_revenue` and `accepted_count` are `0`.

**Could not run `npm run test:golden` to confirm the new test passes in CI** —
discovered a separate, pre-existing environment gap: on this local Supabase
instance, `service_role` has no `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants on
any core table (`orders`, `sessions`, `restaurant_tables`, `table_events`,
`table_state` all checked), only `REFERENCES`/`TRIGGER`/`TRUNCATE`. Every test
in `golden-session.test.ts` fails in `beforeEach` with "permission denied for
table restaurant_tables" as a result — this predates migration 0058 (git
history on the `0056_revoke_anon_direct_writes.sql` commit long predates this
session) and is unrelated to it. The AOV fix itself was verified directly via
`psql` against the same local instance instead. Worth a separate look before
relying on `test:golden` as the pre-launch regression baseline the readiness
assessment recommends — right now it can't run at all locally.
