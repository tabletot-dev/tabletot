# Pre-Launch Readiness Assessment (2026-08-13)

Follow-up synthesis of `kiosk-pos-live-qa-findings.md`,
`pos-only-live-qa-findings.md`, and `aov-dashboard-live-qa-findings.md`.
Answers the question: is the system ready to ship once those findings are
fixed, or is more testing needed first? No code changed — assessment only.

> **Update (2026-08-15):** a read-only follow-up (baseline test run +
> live-DB investigation, no code changed) chased the "Untested categories"
> list below into the actual code and data. It found the AOV fix
> (migration 0058) **does not work in practice** — a trigger interaction
> silently undoes it — plus a second, previously-unknown revenue bug in
> discounts. It also cleared three items the original list flagged as
> risky. See **"Follow-up findings (2026-08-15)"** below; the risk ranking
> and shippability path further down are updated to match.

## Bottom line

**Not ready to ship on "fix the documented findings" alone.** Those three
QA passes tested one slice of the system — happy-path ordering plus
touch-driven edge cases on the kiosk, and manual admin actions on the POS
and dashboard screens as they exist today. There's a whole category of
interaction — admin/POS-driven state changes hitting the event ledger —
that was never exercised, and at least one of the findings already shows
that category is where the real risk lives.

## Why "fix the findings" isn't the finish line

`docs/decisions/0021-two-minute-kitchen-hold.md` and the regression suite
(`apps/kiosk/tests/golden-session.test.ts`,
`apps/kiosk/src/components/__tests__/aov-attribution.test.tsx`) together
show the shape of the gap clearly:

- ADR 0021 shows the AOV-inflation risk was already taken seriously for one
  specific case: the 2-minute hold is deliberately kept **out of the
  ledger** (`sessionStorage` only, via `src/lib/pendingRound.ts`) so that a
  **cancel-before-submit** never pollutes `get_aov_summary`. That's careful,
  correct engineering, done proactively.
- The bug found in `aov-dashboard-live-qa-findings.md` finding #1 is a
  **cancel-after-submit** — done from the POS `/orders` admin dropdown,
  days after the order was originally placed and successfully submitted.
  That's a different code path than the one ADR 0021 addresses, and it was
  never covered: `golden-session.test.ts` tests idempotency, round-merging,
  and the bill/settle happy path; `aov-attribution.test.tsx` tests that the
  right `source` string gets attached to `item_added` events. Neither
  exercises admin-side cancellation flowing into `get_aov_summary`.

The general pattern — the "obvious" edge case (cancel during the client-side
hold) was solved deliberately, the "adjacent" one (cancel after settlement,
from a different surface entirely) wasn't — is exactly the shape of bug
that a single targeted QA pass finds one instance of without proving the
class is contained. **The AOV revenue-filter bug needs a fix plus a new
regression test in that suite, not just a manual data patch**, or the same
class of bug reappears the next time an admin-side state-mutating action is
added (e.g. refunds, when they're built — see below).

## Follow-up findings (2026-08-15)

Read-only investigation: ran the existing `golden-session.test.ts` baseline,
then chased each "Untested categories" item below into the live local DB
(migrations 0058/0059 applied) and the actual source. No code changed —
two throwaway diagnostic scripts were written, run against local Docker
Supabase, and deleted; nothing was pushed or committed.

### Confirmed: the AOV fix (0058) doesn't work — order cancellation silently un-cancels itself

`AOV v5 (0058)` in `golden-session.test.ts` — the regression test written
for the original cancel-after-submit bug — **still fails**. Root cause is
not in 0058's SQL (that logic is correct), it's a trigger interaction
between two otherwise-correct migrations:

- **0059** (`archive_kot_on_order_cancel`): when POS sets
  `orders.status = 'cancelled'`, it archives that order's `kot_tickets` so
  Kitchen Display stops showing them.
- **0055** (`sync_order_status_from_kot`, from the earlier "Plating 85%
  forever" fix): whenever a KOT is archived and it was the *last* active
  KOT on its order, it sets `orders.status = 'served'`.

Cancel an order → 0059 archives its KOT → that archive fires 0055's
trigger → 0055 sees "all KOTs archived" and sets the order back to
**`served`**, overwriting the `cancelled` status that was just written, in
the same transaction. Verified directly against the DB: after cancelling,
`orders.status = 'served'`, `kot_tickets.status = 'archived'`.

Consequences, worse than the original finding: the AOV number is still
wrong (0058's `status <> 'cancelled'` filter never actually excludes it,
because the order isn't `cancelled` by the time anything reads it), **and**
it's now a POS-facing correctness bug — a cancelled order is
indistinguishable from a normal completed order anywhere `orders.status`
is read (Billing.tsx's `.neq('status', 'cancelled')` checks no longer
catch it either). This directly answers old item #4 below — cancellation
was tested via one path and that path is broken.

### New, previously-unknown: discounts are lost from reported revenue

Live-reproduced: submitted a ₹756 order, applied a 20% discount the way
`Billing.tsx`'s "Proceed to Settle" button actually applies one
(`orders.final_discount` / `final_total`), settled with the correct
discounted `amount_paid: 612`.

```
order_history row: { total: 756, discount: 0, amount_paid: 612 }
get_aov_summary total_revenue: 756   (customer actually paid: 612)
```

`append_event`'s `payment_settled` handler (migration 0055) copies
`v_order.total` / `v_order.discount` into `order_history` — but
`Billing.tsx`'s discount UI writes to a *different* pair of columns
(`final_discount` / `final_total`) that the settle RPC never reads. The
discount is real and correctly charged to the customer, but it's silently
dropped from revenue reporting: `get_aov_summary` overstates revenue by
the exact discount amount on every discounted order. Confirms old item #3
below as broken, not just untested. Also resolves the "is the coupon field
wired to anything" question from that item: `DiscountModal.tsx`
(percentage/flat/coupon UI) is dead code — `Billing.tsx` doesn't use it,
it has its own separate inline discount field. Zero test coverage for any
of this.

### Downgraded — investigated, lower risk than originally flagged

- **Payment methods (old #1).** No payment-gateway integration exists
  anywhere in the codebase — Cash/Card/UPI are plain UI radio options,
  treated identically by `append_event`. A retried settle after an
  apparent failure is safe (not idempotency-key dedup, but because the
  ledger's state machine moves to `idle` after success, so a second
  attempt hits "No active session" rather than double-charging).
- **Network resilience (old #6).** `ledger.ts`'s realtime subscription is
  deliberately built as "a poke, not a transport" — any `table_state`
  change just triggers a refetch via RPC rather than trusting the realtime
  payload, so a missed WebSocket message costs one stale render, never
  wrong state. Order submission reuses one `eventId` across retries, so a
  user re-tapping "submit" after a network hiccup is safe by construction.
  Not live-tested with an actual WiFi drop, but the design is sound.
- **Menu data integrity (old #7).** The "285-item menu" this item pointed
  at was a misread of `docs/overview.md` — that number is the *raw
  pre-curation* menu from an earlier planning step, not what's live.
  Checked the actual seeded DB: 49 items across 14 clean, distinct
  categories, no near-duplicates or free-text drift, matching
  `validate_silver_seed.sql`'s documented distribution exactly.

### Reframed — operational, not a code fix

- **Timezone / date-boundary correctness (old #11).** `AovView.tsx`'s
  dashboard range picker uses a rolling window (`now − N days`), not a
  midnight boundary, so it carries no IST risk. POS `Reports.tsx`'s "Day
  Close" tab does compute "today" via `new Date().setHours(0,0,0,0)`,
  which is correct *if* the tablet's OS clock is set to `Asia/Kolkata` —
  the code isn't wrong, but Day Close silently shifts by 5.5 hours if the
  device's timezone is ever misconfigured. Add "verify tablet TZ" to
  whatever pre-restaurant device checklist exists; no code change needed.

### Unchanged — still need real verification, not addressed this round

- **Refunds (old #8).** Confirmed absent, not just unseen — grepped all
  app code and migrations for "refund": zero matches anywhere. Still needs
  an explicit decision (manual DB edit at pilot scale is fine, but say so)
  before go-live.
- **Concurrency (old #2).** `append_event` takes `SELECT ... FOR UPDATE`
  on `table_state` per table, which correctly serializes every
  ledger-mediated write (item adds, submits, POS add-items, settle) for
  that table — a genuinely solid design. Not covered by that lock: the two
  direct-write paths outside the ledger (POS cancel, Billing's
  discount/`final_total` write). A cancel and a settle racing on the same
  order concurrently is theoretically possible and untested — lower
  confidence than the other items here, no live repro attempted.
- **Real hardware/touch (old #5).** Nothing structurally alarming found in
  a code read (standard viewport meta, no obvious touch-handling gaps),
  but this category is fundamentally about physical device behavior and
  stays exactly as open as before — still needs the actual Lenovo tablet.

## Untested categories, ranked by risk (original 2026-08-13 list — superseded by the follow-up above)

### High — directly threatens the numbers being shown to the client

1. **Payment methods other than Cash.** — downgraded, see follow-up.
2. **Concurrency / race conditions.** — partially cleared, one gap remains, see follow-up.
3. **Discounts interacting with reported revenue.** — confirmed broken, see follow-up.
4. **Cancellation from every angle, not just `/orders`.** — confirmed broken, see follow-up.

### Medium — operational risk once this is actually in the restaurant

5. **Real hardware/touch testing.** — unchanged, see follow-up.
6. **Network resilience.** — downgraded, see follow-up.
7. **Menu data integrity beyond what was touched.** — resolved, see follow-up.
8. **Refunds.** — confirmed absent, unchanged, see follow-up.

### Lower — deferred by design, worth naming so it's a decision, not an oversight

9. **Voice pipeline.** Explicitly frozen and out of scope for all three QA
   passes (per repo convention — "THE VOICE PIPELINE IS FROZEN"), but it's
   a real launch feature (Pattern 5 / Ask AI soft upsell, per
   `docs/overview.md`'s Stage 4 plan) and has had zero QA coverage. Not
   investigated in the 2026-08-15 follow-up either (still frozen).
10. **Games / Table Talk (Sprints 6–7).** Intentionally unrebuilt per
    `CLAUDE.md`'s current-status section, still on the old "Warm Espresso"
    palette. Fine to ship without if that's still the plan — just confirm
    it's still the plan before go-live. Not re-checked in the follow-up.
11. **Timezone / date-boundary correctness.** — reframed as a device
    checklist item, see follow-up.

## Recommended path to shippability

1. ✅ **Done (2026-08-15).** Fixed the order-cancel status-revert bug
   (0059's KOT-archive trigger vs. 0055's KOT-archived→`served` trigger) —
   migration 0060, ADR 0022. `AOV v5` now passes.
2. ✅ **Done (2026-08-16).** Fixed the discount-revenue bug and the
   cancelled-walkout-counts-as-revenue bug together, by re-sourcing
   `get_aov_summary` from `payments` instead of `order_history`/`orders.total`
   — migrations 0061–0063, ADR 0023, full detail in
   `docs/plans/2026-08-15-revenue-integrity-and-cancellation-fixes.md`.
   Kitchen Display also now shows cancelled tickets until the table closes.
3. ✅ **Done (2026-08-16).** `cd apps/kiosk && npm run test:golden` — 17/17
   pass (12 pre-existing + 5 new, covering all of #1–#2 above).
4. Decide on refunds (confirmed: no flow exists) — explicit sign-off that
   this is pilot-scale/manual, not a gap, or scope it in. `get_aov_summary`'s
   new `payments`-sourced query already has a defensive
   `WHERE p.status = 'completed'` filter ready for whenever this lands
   (ADR 0023).
5. One more focused QA pass on the two items still genuinely open:
   concurrent cancel-vs-settle races, and the real Lenovo tablet touch
   pass — the rest of the original high/medium list has now been
   downgraded, resolved, or confirmed via code+DB investigation instead.
6. **New, found during #2's implementation:** `apps/pos/src/pages/Orders.tsx`
   hardcodes `status: 'paid'` (line 80) for every `order_history` row it
   merges into the live-orders list, rendered as a `Badge` (line 216). A
   walkout order (`amount_paid: 0`, `payment_method: null`) still shows a
   "paid" badge — misleading, though `Reports.tsx`'s History tab (which
   shows `payment_method ?? '—'`) reads correctly. Small follow-up UI fix,
   not blocking.
7. **New, found during #2's implementation:** this session's local Supabase
   dev environment had a broken `service_role`/`anon`/`authenticated` — zero
   `SELECT`/`INSERT`/`UPDATE` grants on any `public` table, blocking the JS
   test harness (`permission denied for table restaurant_tables`).
   Reproduced identically under both `npx supabase` (auto-installed
   v2.114.0) and the Homebrew-pinned CLI (v2.109.1), and survived a full
   `supabase stop --no-backup` + manual Docker volume removal + fresh
   `supabase start` — so it isn't a stale-volume or CLI-version issue, it's
   something in how this machine's Docker/Postgres bootstrap runs.
   Worked around this session with an ad-hoc, uncommitted
   `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated,
   service_role;` + matching `ALTER DEFAULT PRIVILEGES` run directly against
   the container — **not saved anywhere**, so it will need to be re-applied
   (or properly root-caused) after the next `supabase db reset`/`stop`.
8. ✅ **Done (2026-08-16).** First full authenticated-browser click-path QA
   of items #1–#2 (kiosk order → POS cancel → Kitchen Display → discounted
   settle → Dashboard AOV), the gap flagged in item 5. Found and fixed a
   real blocker: once a table's only order was cancelled, `table_state`
   never left `'ordering'` (the cancel is a direct write outside
   `append_event`, per the still-open item above), which hid POS Billing's
   "End Service" button (gated on `activeOrder`, which excludes cancelled
   orders) — leaving staff with no way to free the table. Fixed at the UI
   layer (`isTableLive()` guard instead of `activeOrder`); the backend
   `service_ended` path already handled the cancelled-order case correctly.
   Also fixed a currency-rounding inconsistency (Bill Preview showed ₹347,
   Payment modal showed ₹346.50 for the same order) by standardizing all
   computed money displays to 2 decimal places across all three apps. Full
   detail: `docs/plans/2026-08-15-revenue-integrity-and-cancellation-fixes.md`,
   Task 9.
