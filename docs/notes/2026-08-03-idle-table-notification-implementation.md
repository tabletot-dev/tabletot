# Idle-table notification — implemented, thresholds chosen

Implements `docs/plans/2026-08-03-idle-table-notification.md` in full.
Decision recorded so a future revisit isn't re-litigating: **notify only,
staff decides** — no auto-ending a session from the kiosk or from POS.

## Thresholds

- **Kiosk nudge** ("Still there? Tap anywhere to continue."): 3.5 minutes of
  no touch on a pre-submit browsing screen (`home`, `menu`, `item-detail`,
  `order-summary`, `identity`). Pure client-side UX, nothing written to the
  ledger. `apps/kiosk/src/pages/Index.tsx`.
- **POS idle badge** (amber clock icon on the table grid): 12 minutes with
  `table_state.order_id IS NULL` and no `table_events` row for that span in
  that window. `apps/pos/src/pages/Billing.tsx`.

These don't coordinate — the kiosk doesn't know whether POS has flagged the
table, POS doesn't know whether the kiosk showed a nudge. Both are starting
points; tune with Rohan against real service before the pilot.

## Deviation from the plan: one migration was needed after all

The plan's "zero migrations needed" premise assumed `table_events` was
already client-readable, "same pattern as `table_state`." Verified against
local Postgres before writing the POS badge query — this was false:
`table_events` has RLS enabled (migration `0047`) with **zero** SELECT
policies, so a client-side `SELECT ... FROM table_events` would have silently
returned no rows for both `anon` and `authenticated`. The badge would never
have appeared, with no error anywhere — exactly the "confident wrong answer"
failure class `docs/plans/2026-08-02-three-app-hardening.md` was about
eliminating.

Fixed with migration `0057_table_events_staff_read.sql`: one `staff_read`
SELECT policy for `authenticated` only (mirrors `0022`'s existing
`recommendation_events`/`voice_turns` pattern and `0047`'s
`table_state_read`). Kiosk runs as `anon` and never reads `table_events`
directly (it only writes via the `append_event` RPC, which is `SECURITY
DEFINER` and bypasses RLS regardless) — confirmed the new policy grants
nothing to `anon`. Verified directly against local Postgres with `SET ROLE`:
`authenticated` sees the row, `anon` gets zero rows.

## Verification

- `npm run build` clean on both `apps/kiosk` and `apps/pos`.
- Kiosk golden-session suite: 11/11. Kiosk unit suite: 4/4.
- Directly verified the POS badge query chain against local Postgres:
  `session_started` → backdated the event 15 min → confirmed the
  `authenticated`-role query returns the row (idle, badge would show) and the
  `anon`-role query returns zero rows (RLS correctly scoped to staff only).
  `order_submitted` on the same table → `table_state.order_id` set →
  confirmed the table drops out of the query entirely (badge clears
  immediately, not just after a refresh interval elapses). `service_ended` →
  table freed back to `available`, state reset to `idle`. Full table state
  restored to pre-test condition.
- Not exercised via an actual kiosk/POS browser session this pass — no
  running dev servers this session. The state-machine and query-level
  behavior verified above is what determines correctness for both halves of
  this feature; a manual click-through (sit idle on the kiosk, watch the
  banner; watch the POS badge appear/clear) is still recommended before the
  pilot goes live, same caveat as the rest of the hardening work.

## Out of scope (per the plan, unchanged)

- `apps/dashboard` — not touched, it's curation-only (ADR 0008).
- The "pure scrolling with zero taps" blind spot — no `table_events` row
  exists until the customer interacts with something, so such a customer is
  indistinguishable from absent by this signal. Noted as a known ceiling, not
  built around; would need a heartbeat event to close fully.
- Per-restaurant threshold configurability — hardcoded constants, single
  pilot restaurant.
