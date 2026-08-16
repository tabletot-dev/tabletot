# Revenue Integrity & Cancellation Lifecycle Fixes

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three confirmed, live-verified bugs that cause the AOV dashboard
to overstate revenue, plus give `kot_tickets` a distinct `cancelled` state so
Kitchen Display can show cancelled rounds instead of having them vanish or
silently un-cancel. No new pages needed — POS already has the audit views
this plan's fixes make trustworthy.

**Revenue-source decision (2026-08-15, updated after Task 1 shipped):**
`get_aov_summary` will be re-sourced to read settled revenue from `payments`
instead of `order_history.total`/`orders.total` — "Option B" from the
follow-up discussion, chosen over patching `order_history`'s writers
directly. This is closer to what `docs/decisions/0020-service-ended-ledger-event.md`
already intended ("anything that computes revenue from `payments`, not
`order_history`, is automatically unaffected by walkouts") — `get_aov_summary`
just never followed that invariant. Requires fixing `payments.order_id`
first (see Task 3).

**Source:** Live investigation against local Supabase (Docker), 2026-08-15 —
see `docs/notes/pre-launch-readiness-assessment.md`'s "Follow-up findings"
section for the original repros. All three bugs were reproduced with
throwaway scripts against local test data; nothing was fixed yet.

## The three confirmed bugs, and why they're one fix, not three

1. **Cancel silently reverts to `served`.** Cancelling via POS `/orders`
   (`orders.status = 'cancelled'`) archives the order's KOT (migration 0059),
   which fires the KOT→order sync trigger (migration 0055), which sees "all
   KOTs archived" and sets `orders.status = 'served'` — overwriting the
   cancel in the same transaction. Verified: DB ends up with
   `orders.status='served'`, `kot_tickets.status='archived'`.
2. **Discount dropped at settle.** `Billing.tsx`'s discount UI writes to
   `orders.final_discount`/`final_total`; `append_event`'s `payment_settled`
   handler copies `orders.discount`/`orders.total` (the pre-discount values)
   into `order_history`. Verified: customer paid ₹612, `order_history.total`
   and `get_aov_summary` both say ₹756.
3. **Cancelled-and-walked-out still counts as revenue.** `service_ended` (the
   existing "End Service" walkout path — already correct as a *mechanism*,
   confirmed no new UI is needed) copies `orders.total` into `order_history`
   regardless of order status. Verified: a fully cancelled ₹756 order, ended
   via "End Service" with `amount_paid: 0`, still shows `total: 756` in
   `order_history` and counts as ₹756 in `get_aov_summary`.

Bugs 2 and 3 are the same root cause in two call sites: the code that writes
`order_history` at close time (`payment_settled` and `service_ended`, both
inside `append_event`) trusts `orders.total` as "the real revenue figure"
without checking whether a discount was applied or whether the order was
cancelled. Fixing both call sites together, in one pass, is less error-prone
than fixing one and forgetting the other has the same bug — which is exactly
how bug 3 slipped through the original 0058 AOV fix.

## Scope decisions, stated up front

1. **KOT gets `cancelled` as a first-class status**, distinct from
   `archived`. `archived` currently means two different things ("finished
   normally" and "cancelled out from under the kitchen") and that overload
   is *why* bug 1 exists — 0055's trigger can't tell the difference. This
   isn't just a UX nicety, it's the structural fix.
2. **Kitchen Display shows cancelled tickets, not hides them**, for as long
   as the table's order is open. They exit the active view only when the
   table actually closes (`payment_settled` or `service_ended`) — matching
   how `archived` tickets already behave, just on a longer/different fuse
   for the cancelled case.
3. **"Closed" means either `payment_settled` or `service_ended`, not
   specifically billing/payment.** Confirmed via live repro that the
   walkout-after-cancel scenario (customer orders, cancels, leaves) already
   has a correct mechanism — POS Billing's existing "End Service" button —
   so no new UI is needed for that flow. `service_ended`'s own code comment
   already describes it as "a walkout/staff reset, not a paid order."
4. **A cancelled or walked-out order keeps its real `total` in
   `order_history`** — no zeroing. `payment_method IS NULL` (already how
   `service_ended` records a walkout, per ADR 0020) is the signal that
   nothing was actually paid; `get_aov_summary` reading from `payments`
   means it simply never sees a row for that order, rather than needing
   `order_history.total` to lie about what was ordered. This supersedes the
   original "zero it out" judgment call from the first draft of this plan —
   `payments`-sourcing makes it unnecessary, and it's a better outcome:
   History views can show "this table had ₹756 on it before the cancel"
   honestly, next to a blank/`NULL` payment method making clear nothing was
   charged.
5. **No new "order history" page.** `apps/pos/src/pages/Orders.tsx` already
   merges live `orders` rows with settled `order_history` rows into one
   list, and `Reports.tsx` already has a dedicated "History" tab sourced
   from `order_history`. Once bug 3 is fixed, a walkout-after-cancel will
   correctly show its real total with `amount_paid: 0`/`payment_method: NULL`
   there — informative, not a phantom revenue number. Task 5 below is a
   light manual check of that display, not a build.
6. **Direct writes to `orders` that bypass the ledger** (POS cancel via
   `/orders`, Billing's `final_discount`/`final_total` write) are **not**
   being folded into the ledger by this plan. That's a bigger architectural
   change (would need its own ADR) and isn't required to fix these three
   bugs — noted under "Explicitly out of scope."

## Architecture

Four migrations total (0060 already shipped, three more planned), following
this repo's existing pattern of one focused fix per migration (see 0058,
0059):

```
0060_kot_cancelled_status.sql — ✅ shipped (2223c4e)
  archive_kot_on_order_cancel() (0059): 'archived' → 'cancelled'
  (sync_order_status_from_kot (0055) needs NO change — 'cancelled' matches
   none of its branches, so it naturally no-ops on this status)

0061_payments_order_id_survives_settle.sql  [Task 3]
  payments.order_id: DROP the FK's ON DELETE SET NULL behavior (same
  problem 0053 already fixed for kot_tickets.order_id, but kot_tickets only
  needs order_id while the order is active, so SET NULL is fine there —
  get_aov_summary needs payments.order_id to survive indefinitely, so this
  drops the FK constraint entirely, matching order_history.original_order_id's
  existing FK-less pattern).

0062_get_aov_summary_v6_payments_sourced.sql  [Task 4]
  get_aov_summary(): settled-order revenue now sums payments.amount
  (joined on the now-durable order_id) instead of order_history.total.
  Live (unsettled) orders_agg branch unchanged — already correctly excludes
  cancelled via status <> 'cancelled'. survived/accepted_count CTE gains an
  order_history.payment_method IS NOT NULL check so a walkout's pairing
  taps stop counting as "accepted".

0063_settle_discount_and_kot_archive_sweep.sql  [Task 3-old / now Task 5]
  append_event() (0055's version) — payment_settled and service_ended
  branches both updated:
    - order_history INSERT: use COALESCE(final_total, total) /
      COALESCE(final_discount, discount) — audit-accuracy fix for the
      History views, no longer load-bearing for get_aov_summary since
      Task 4 moved revenue off order_history entirely.
    - archive-KOT step: IN ('accepted','preparing','ready') → also
      'cancelled' (sweeps a still-cancelled KOT to 'archived' when the
      table closes — this is what makes Task 2's Kitchen Display change
      show cancelled tickets only "until closed", not forever).
```

Plus one frontend change (Kitchen Display) and one test file.

---

## Task 1 — KOT cancelled status (fixes bug 1 at the root) — ✅ DONE (2026-08-15)

**Files:** `supabase/migrations/0060_kot_cancelled_status.sql`,
`docs/decisions/0022-kot-cancelled-status.md`. Committed as `2223c4e`.

- [x] Confirmed `kot_tickets.status` is unconstrained `text` (same pattern as
      `orders.status` — no enum, no CHECK constraint) before writing the
      migration.
- [x] `CREATE OR REPLACE FUNCTION archive_kot_on_order_cancel()` — same
      trigger, same `IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT
      FROM 'cancelled'` guard, only the target status changes:
      `UPDATE kot_tickets SET status = 'cancelled' WHERE order_id = NEW.id
      AND status IN ('accepted', 'preparing', 'ready')`.
- [x] No change needed to `sync_order_status_from_kot()` (0055) — confirmed
      `NEW.status = 'cancelled'` falls through every branch (`archived`
      check fails, `preparing`/`ready` counts are unaffected) and the
      function returns `NEW` without touching `orders`.
- [x] Wrote ADR 0022 documenting the decision.

**Verify — done:** manually cancelled an order against local Docker
Supabase; `orders.status` stayed `'cancelled'`, `kot_tickets.status` became
`'cancelled'` (not `'archived'`). `cd apps/kiosk && npm run test:golden`:
12/12 pass, including `AOV v5 (0058, ...)`, which failed before this fix and
required no change to the test itself. Supabase TS types regenerated for
all three apps (`supabase gen types typescript --local`) — no diff, since
this migration only changes a trigger function's body/comment, not any
table or function signature.

> **New finding while writing ADR 0022, relevant to Tasks 3–4 below:**
> `docs/decisions/0020-service-ended-ledger-event.md` already states the
> intended invariant — "anything that computes revenue from `payments` (not
> `order_history`) is automatically unaffected by walkouts." `get_aov_summary`
> (0050/0058) doesn't follow that invariant — it sums `order_history.total`/
> `orders.total` directly, never touches `payments`. Re-sourcing it from
> `payments` would fix bugs 2 and 3 for free (payments.amount already
> reflects the discounted amount actually paid, and walkouts/cancels never
> get a `payments` row at all) — but `payments.order_id` has
> `ON DELETE SET NULL` on its FK to `orders`, and `payment_settled` deletes
> the order row in the same transaction right after inserting the payment,
> so `payments.order_id` is `NULL` for every settled payment, today. That
> breaks the join `get_aov_summary` would need to attribute a payment to a
> time-windowed span.
>
> **Decided: Option B.** Drop the FK's `ON DELETE SET NULL` behavior and
> re-source `get_aov_summary` from `payments` — see Tasks 3–4 below.

## Task 2 — Kitchen Display shows cancelled tickets until table close — ✅ DONE (2026-08-16)

**Files:** `apps/pos/src/pages/Kitchen.tsx`

- [x] Fetch query: `.in('status', ['accepted', 'preparing', 'ready'])` →
      add `'cancelled'`.
- [x] Realtime handler (currently removes the ticket from local state when
      `updated.status === 'archived'`): keep that removal only for
      `'archived'`; a transition to `'cancelled'` should update the ticket
      in place, not remove it. (No change needed — the existing `else`
      branch already updates in place for any non-`'archived'` status.)
- [x] `getStatusColor()`: add a `'cancelled'` case (distinct from the
      existing accepted/preparing/ready colors — muted red,
      `bg-rose-500/20 text-rose-600 border-rose-500`).
- [x] Ticket card rendering: a cancelled ticket should show a "Cancelled"
      badge and **no** action buttons (the existing
      `ticket.status === 'accepted' && (...)` /
      `'preparing'` / `'ready'` conditionals already naturally exclude
      `'cancelled'` from all three — confirmed, no new buttons added).

**Verify — done:** `tsc --noEmit` clean. Data-flow (KOT `cancelled` →
`archived` on table close) confirmed via the Task 7 golden test and the
direct-SQL repro in Task 4/5's verify. Full authenticated-browser click-path
QA (POS login → cancel a live order → watch Kitchen Display) not run this
session — logic is a straight mirror of the existing accepted/preparing/ready
pattern, but a real-device check is still worth doing before this reaches
the pilot restaurant.

## Task 3 — `payments.order_id` survives settle — ✅ DONE (2026-08-16)

**Files:** `supabase/migrations/0061_payments_order_id_survives_settle.sql`

- [x] Confirmed today's behavior first (repro, throwaway psql script):
      submit → settle → `payments.order_id` was `NULL` immediately after,
      because `payment_settled` deletes the `orders` row in the same
      transaction and the FK's `ON DELETE SET NULL` fires.
- [x] `ALTER TABLE payments DROP CONSTRAINT payments_order_id_fkey;` — no
      replacement FK. `payments.order_id` becomes a plain durable UUID,
      same pattern `order_history.original_order_id` already uses (no FK
      at all). Insert-time validity is already guaranteed procedurally —
      `append_event` only inserts a payment after `SELECT ... INTO v_order
      ... IF FOUND`, so a DB-level FK was never load-bearing for
      correctness, only for the survive-past-delete behavior we're now
      removing.
- [x] Note for the record (not a code change): `kot_tickets.order_id` keeps
      its existing `ON DELETE SET NULL` (migration 0053) — that's correct
      there, since Kitchen Display only needs `order_id` while the order is
      still active. `payments` diverges because `get_aov_summary` needs it
      to survive indefinitely for time-windowed joins — different
      requirement, different fix, not an inconsistency.

**Verify — done:** re-ran the repro; `payments.order_id` now holds the real
order id after settle. Also confirmed via the Task 7 golden test
(`payments.order_id survives settle (0061)`).

## Task 4 — `get_aov_summary` reads revenue from `payments` — ✅ DONE (2026-08-16)

**Files:** `supabase/migrations/0062_get_aov_summary_v6_payments_sourced.sql`

- [x] `CREATE OR REPLACE FUNCTION get_aov_summary(...)` (based on 0058's
      body) — replace the `orders_agg` CTE's settled-order branch:
      - Before: `SELECT COALESCE(SUM(oh.total), 0) FROM order_history oh
        JOIN (SELECT DISTINCT order_id FROM submitted_spans) so ON
        so.order_id = oh.original_order_id`
      - After: `SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN
        (SELECT DISTINCT order_id FROM submitted_spans) so ON so.order_id =
        p.order_id WHERE p.status = 'completed'` (the `status` filter is
        defensive/future-proofing — every row is `'completed'` today, no
        other status is ever set, but this is free and matters the moment
        refunds are ever built).
      - The live (unsettled) branch of `orders_agg` (`orders o ... WHERE
        o.status <> 'cancelled'`) is unchanged — it's already correct, and
        it has to stay `orders.total`-based since a live order has no
        `payments` row yet by definition.
- [x] `survived` CTE — the `order_history` EXISTS branch gains
      `AND oh.payment_method IS NOT NULL`, so a walked-out order's pairing
      taps stop counting toward `accepted_count`/`accepted_items`. (The
      live-`orders` EXISTS branch already excludes `cancelled` via
      `status <> 'cancelled'`; no change needed there.)
- [x] Everything else (`submitted_spans`, `rec_adds`, `per_item`,
      `items_json_arr`, `sessions_agg`) is unchanged — this is a targeted
      swap of the revenue and pairing-survival sources, not a rewrite.

**Verify — done:** re-ran both repros directly against local Postgres.
Discount repro: settled a ₹378 order with ₹78 discount →
`get_aov_summary.total_revenue` = ₹300, not ₹378. Walkout repro: submitted
₹378 → cancelled → `service_ended` → `get_aov_summary.total_revenue` for
that window = `0`, while `order_history.total` for the same order still
correctly shows `378` (real audit record, just not counted as revenue).
Also confirmed via the four new Task 7 golden tests.

## Task 5 — Discount reaches `order_history`, KOT archive-sweep — ✅ DONE (2026-08-16)

**Files:** `supabase/migrations/0063_settle_discount_and_kot_archive_sweep.sql`

- [x] `CREATE OR REPLACE FUNCTION append_event(...)` — in the
      `payment_settled` branch's `order_history` INSERT, changed:
      - `v_order.total` → `COALESCE(v_order.final_total, v_order.total)`
      - `v_order.discount` → `COALESCE(v_order.final_discount, v_order.discount)`
      This is now an audit-accuracy fix for `Orders.tsx`/`Reports.tsx`'s
      History views, not load-bearing for `get_aov_summary` (Task 4 moved
      revenue off `order_history` entirely) — still worth doing so History
      doesn't show the wrong total for a discounted order.
- [x] Same substitution in the `service_ended` branch's `order_history`
      INSERT, for symmetry.
- [x] In both branches, extended the archive-KOT step:
      `UPDATE kot_tickets SET status = 'archived' WHERE order_id = ... AND
      status IN ('accepted', 'preparing', 'ready', 'cancelled')` — sweeps a
      still-`cancelled` KOT to `archived` when the table actually closes.
      This is what makes Task 2's "visible until the order is closed"
      boundary real, not just a Kitchen-Display-side filter.

**Verify — done:** settled a discounted order via repro →
`order_history.total`/`discount` = 300/78, reflecting the discount.
Cancelled an order with an active KOT (status → `'cancelled'`), then closed
via `service_ended` → KOT status → `'archived'`. Also confirmed via the
Task 7 KOT-lifecycle golden test.

## Task 6 — Confirm existing audit views handle a walkout row — ✅ DONE (2026-08-16)

**Files:** none (manual check, no build)

- [x] Checked `apps/pos/src/pages/Orders.tsx` and `Reports.tsx`'s History
      tab against a walkout row (real `total`, `amount_paid: 0`, blank
      `payment_method`) at the code level (full authenticated-browser QA
      not run this session — see Task 2's verify note).
      - `Reports.tsx`'s History tab (`apps/pos/src/pages/Reports.tsx:330-333`)
        reads sensibly: real `total`, and `payment_method ?? '—'` for the
        null case.
      - `Orders.tsx` has a real, pre-existing display bug, **not** caused
        by this plan: `Orders.tsx:80` hardcodes `status: 'paid'` for every
        `order_history` row it maps into the merged list, and
        `Orders.tsx:216` renders that as a `Badge`. A walkout order —
        `amount_paid: 0`, `payment_method: null` — still shows a "paid"
        badge, which is exactly the "looks like a data error" case this
        task was checking for. Per this task's own scope note, this is a
        follow-up UI tweak, not a re-scope of this plan — logged in
        `docs/notes/pre-launch-readiness-assessment.md`.

## Task 7 — Regression tests — ✅ DONE (2026-08-16)

**Files:** `apps/kiosk/tests/golden-session.test.ts`

- [x] No new test needed for bug 1 — `AOV v5 (0058)` already covered it;
      Task 1 made it pass, done.
- [x] New test, `payments.order_id` survives (Task 3): submit → settle →
      assert `payments.order_id` equals the order id, not `NULL`.
- [x] New test, discount reaches revenue (bug 2, Task 4): submit → apply
      `final_discount`/`final_total` (mirroring `Billing.tsx`'s write) →
      settle → assert `get_aov_summary.total_revenue` reflects the
      discounted total via `payments`, not the pre-discount one.
- [x] New test, cancelled walkout excluded from revenue (bug 3, Task 4):
      submit → cancel → `service_ended` → assert
      `get_aov_summary.total_revenue = 0` for that window, while
      `order_history.total` for the order still shows the real
      pre-cancellation amount.
- [x] New test, pairing acceptance excluded on walkout (Task 4): submit
      with a `pairing_chip` item_added → cancel → `service_ended` → assert
      `get_aov_summary.accepted_count = 0` for that window.
- [x] New test, KOT status lifecycle (Tasks 1 + 5): submit → cancel →
      assert `kot_tickets.status = 'cancelled'` (not `'archived'`) → then
      `service_ended` → assert it becomes `'archived'`. (Queries by the
      KOT's own `id`, not `order_id` — `service_ended` deletes the `orders`
      row, which SETs `kot_tickets.order_id` NULL via 0053's existing
      `ON DELETE SET NULL`.)

**Verify — done:** `cd apps/kiosk && npm run test:golden` — 17/17 pass
(12 pre-existing + 5 new). Local environment note: this session's Docker
Postgres had `service_role`/`anon`/`authenticated` with zero table grants
(pre-dating this plan's changes, reproduced on a fully wiped volume under
both CLI versions available on this machine) — worked around with an
ad-hoc, uncommitted `GRANT`/`ALTER DEFAULT PRIVILEGES` against the running
container so the test harness could run; not a fix, see the readiness doc's
"Recommended path to shippability" item 7 for the follow-up.

## Task 8 — Docs — ✅ DONE (2026-08-16)

- [x] ADR 0022 written and committed for Task 1.
- [x] ADR 0023 written for the revenue-source decision (Tasks 3–4):
      `docs/decisions/0023-payments-sourced-aov-revenue.md` — `payments`
      becomes the source of truth for settled AOV revenue instead of
      `order_history`/`orders.total`, with the `payments.order_id` FK fix
      as the enabling change.
- [x] This plan file, checkboxes updated as tasks complete.
- [x] Updated `docs/notes/pre-launch-readiness-assessment.md`'s
      "Recommended path to shippability" section.

## Task 9 — Browser QA follow-up: End Service hidden after cancel-only session — ✅ DONE (2026-08-16)

Task 2's verify note flagged that full authenticated-browser click-path QA
hadn't been run this plan. Ran it: kiosk order → POS cancel → Kitchen
Display → discounted settle → Dashboard AOV, end to end in Chrome. Found and
fixed one real blocker and one display inconsistency.

**Bug found — table gets permanently stuck after its only order is
cancelled.** Cancelling via POS `/orders` leaves `table_state.state` stuck
at `'ordering'` forever, because that cancel is a direct write outside
`append_event` (the exact gap flagged under "Explicitly out of scope"
below). Two consequences compounded into a dead end for staff:
- `Billing.tsx`'s "End Service" button was gated on `activeOrder`, which is
  `null` for a cancelled order by design (line ~366, "a cancelled order is
  never billable"). So the one button that calls `service_ended` — which
  *does* correctly handle this exact case (archives the KOT, records the
  real total to `order_history` with `amount_paid: 0`, frees
  `table_state`/`sessions`/`restaurant_tables`) — never rendered.
- `TableManagement.tsx`'s manual-override guard (from the `a4636c8` fix)
  correctly refused to let staff force the table back to "Available" either,
  since `table_state.state !== 'idle'`.
- Net effect: once a table's only order was cancelled, it stayed occupied
  forever with **no UI path to free it.** Reproduced live: table T1 stuck
  after a QA cancel, confirmed via direct query
  (`table_state.state = 'ordering'`, `orders.status = 'cancelled'`).

**Fix — `apps/pos/src/pages/Billing.tsx`:** changed the "End Service"
button's guard from `activeOrder &&` to `(activeOrder || isTableLive(selectedTable.id)) &&`,
reusing the existing `isTableLive()` helper that already reads the same
`table_state` ledger signal `TableManagement.tsx`'s guard trusts. No
migration needed — the backend (`service_ended`, migration 0063) already
did the right thing; only the button's visibility condition was wrong.
Verified against the live-stuck T1: "End Service" now renders, clicking it
frees the table (`restaurant_tables.status = 'available'`,
`table_state.state = 'idle'`, `orders` row moved to `order_history` with
`total: 714.00`, `amount_paid: 0`, `payment_method: null` — correctly not
counted as revenue per ADR 0023).

**Also found — inconsistent currency rounding.** POS's Bill Preview dialog
showed a `.toFixed(0)`-rounded total (₹347) while the Payment modal one
click later showed the unrounded value (₹346.50) for the same discounted
order — same bug class present in ~20 spots across POS (`Billing.tsx`,
`Reports.tsx`), an unused/still-rounding `formatRupees()` helper in Kiosk,
and unformatted raw numbers in Dashboard's `AovView.tsx`. Standardized all
computed/aggregated money displays (subtotals, GST, discounts, totals,
revenue, AOV) to 2 decimal places via a shared `formatRupees()` helper per
app (`apps/{kiosk,pos,dashboard}/src/lib/formatCurrency.ts`). Raw catalog
item-price displays (always whole rupees, never a rounding-loss source)
left as-is. All three apps typecheck clean.

**Files:** `apps/pos/src/pages/Billing.tsx`,
`apps/pos/src/components/billing/PaymentModal.tsx`,
`apps/pos/src/pages/Reports.tsx`, `apps/pos/src/lib/formatCurrency.ts` (new),
`apps/kiosk/src/lib/formatCurrency.ts`,
`apps/kiosk/src/components/screens/{BillView,CartView,SentView}.tsx`,
`apps/dashboard/src/lib/formatCurrency.ts` (new),
`apps/dashboard/src/pages/AovView.tsx`.

**Unrelated, surfaced by the Supabase advisor during this session's DB
queries, not touched:** RLS is disabled on `public.voice_sessions`, exposing
it to `anon`/`authenticated`. Flagging for a separate decision.

---

## Explicitly out of scope

- **Moving the POS cancel/discount writes into the ledger.** Both
  `Orders.tsx`'s cancel and `Billing.tsx`'s `final_discount`/`final_total`
  write are direct table writes outside `append_event`. This plan works
  around that (by reading whatever ended up on the `orders` row at close
  time) rather than routing them through the ledger. Worth a future ADR if
  more direct-write bugs turn up, not resolved here. Task 9 fixed the one
  concrete symptom this caused (table stuck occupied after cancel) at the
  UI layer, without folding the write itself into the ledger — the
  underlying direct-write gap is still open.
- **Concurrency between a direct-write cancel and a ledger-mediated
  settle.** Flagged in the readiness assessment as untested; this plan
  doesn't add locking for it.
- **A "Cancelled" visual signal beyond the Kitchen Display badge** (e.g. a
  toast/sound alert to kitchen staff when a ticket they're actively cooking
  gets cancelled). Task 2 makes cancelled tickets visible; it doesn't add
  new real-time alerting.
- **Refunds.** Confirmed absent in the investigation; a separate decision,
  not part of this plan.

## Verification gate

```
cd apps/kiosk
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<local service role key> \
SUPABASE_PUBLISHABLE_KEY=<local publishable key> \
npm run test:golden          # full suite must be green: AOV v5 (fixed by
                              # Task 1, done) plus the five new tests from
                              # Task 7
```

Plus the manual repros in each task's "Verify" line, run against local
Docker Supabase — the same throwaway-script approach used throughout the
investigation (write a one-off `.mjs` script in `apps/kiosk/`, run it, then
delete it; never commit these).
