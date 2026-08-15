# AOV / Recommendations Dashboard Live QA Findings (2026-08-13)

Follow-up to `docs/notes/kiosk-pos-live-qa-findings.md` and
`docs/notes/pos-only-live-qa-findings.md`, this pass covers `apps/dashboard`
(Anchor Items, Item Pairings, Completion Rules, AOV Impact) via live browser
automation, logged in as the admin test account, cross-checked against local
Supabase directly (`docker exec supabase_db_tabletot-pilot psql ...`) where
UI behavior needed verification at the data layer. No code changed —
findings only.

## Critical

1. **Status: FIXED** in `supabase/migrations/0058_get_aov_summary_v5.sql`
   (2026-08-15) — see `docs/notes/2026-08-15-aov-cancelled-order-fix.md` for
   verification. Original finding kept below for context.

   **"Total Revenue" on the AOV Impact page counts cancelled and
   never-settled orders as revenue.** `get_aov_summary` (currently v4,
   `supabase/migrations/0050_get_aov_summary_v4.sql`) computes `total_revenue`
   by joining the live `orders` table against `submitted_spans` with **no
   `status` filter**:
   ```sql
   orders_agg AS (
     SELECT COALESCE(SUM(oh.total), 0)::numeric AS total_revenue
     FROM   order_history oh JOIN (...) so ON so.order_id = oh.original_order_id
     UNION ALL
     SELECT COALESCE(SUM(o.total), 0)::numeric
     FROM   orders o JOIN (...) so ON so.order_id = o.id  -- no status filter here
   ),
   ```
   Verified concretely against local data: the order I cancelled during POS
   QA (`b1caac42…`, ₹409.50, `status='cancelled'`) still has a matching
   `order_submitted` row in `table_events` inside the 7-day window, so it's
   silently included. Broken down for the "Last 7d" window used by the
   dashboard:
   ```
   status     | count | total
   cancelled  |     1 | 409.50
   ready      |     3 | 1228.50   -- orphaned, never paid (see pos-only-live-qa-findings.md #1/#2)
   ```
   That's **~₹1,638 of the reported ₹8,022 (≈20%) that is not real
   revenue** — cancelled and unpaid orders. Same root cause as
   `pos-only-live-qa-findings.md` finding #1 (cancelled orders still fully
   billable in POS): nothing downstream filters `status='cancelled'` (or
   excludes orders stuck in `ready` that never reached settlement). The
   `survived` CTE that drives `accepted_count`/`direct_revenue` has the same
   structural gap — it checks `orders o WHERE o.id = ss.order_id` with no
   status filter either, it just happened not to matter for today's numbers
   because the cancelled order had no pairing-derived items in it. Fix
   should exclude `status = 'cancelled'` (and arguably unsettled `ready`
   orders that are past some staleness threshold) from both the
   `orders_agg` and `survived` CTEs — likely a v5 of this function.

## Documentation is meaningfully stale (surfaced while investigating #1)

2. **`/Users/qpt/Projects/tabletot-pilot/CLAUDE.md`'s migration count is 21
   migrations behind reality.** It states "Migrations 0009–0036 are
   applied... currently at 0036 + remote schema." Actual local head is
   **0057**. Notably, `0051_drop_recommendation_events.sql` literally
   dropped the `recommendation_events` table that CLAUDE.md still documents
   under "Recommendation + analytics" — the real design now is a generic
   event ledger (`kiosk_events`, then superseded/joined by `table_events` as
   of 0047+) with an `event_type` column, not a dedicated table per pattern.
   Also present: migrations 0052–0055 (`service_ended_and_kot_notes`,
   `kot_tickets_preserve_on_order_delete`, `fix_kot_archive_order`,
   `order_status_served`) which sound directly relevant to the KOT/order
   desync bug in `pos-only-live-qa-findings.md` finding #2 — worth checking
   whether that's already partially fixed and the QA session hit a specific
   edge case (cancel-from-`/orders` specifically, vs. the paths those
   migrations cover), before assuming it's fully open.
   `CLAUDE.md`'s migration section and the "Supabase table groups" section
   both need a refresh pass.

## Minor

3. **Naming inconsistency for the same feature**: sidebar nav says "AOV
   Lift," the page's own `<h1>` says "AOV Impact." Small, but avoidable —
   picking one name and using it in the nav label, page title, and any
   future docs would help, especially since this is the screen a
   non-technical restaurant owner is meant to read.
4. **Item Pairings' "Add" form defaults `newPriority` to `0`**
   (`ItemPairings.tsx:33`), while Anchor Items' equivalent add-flow
   auto-computes `maxPriority + 1` (`AnchorItems.tsx:75`). A curator adding
   a pairing without noticing the priority field could add a rule that
   silently never wins against existing priority-1/2 rows for the same
   source item.

## Correction to a prior finding

`kiosk-pos-live-qa-findings.md` finding #9 flagged pairing recommendations
as looking "formulaic" (always suggesting a coffee item), based on testing
2 dishes live on the kiosk. Having now read the full `item_pairings` table
in the dashboard, that read doesn't hold up — pairings are genuinely
per-dish curated: `Aglio e Olio → Long Black`, `Arrabiata → Cappuccino`,
`Alfredo → Hot Chocolate`, `Pesto → Flat White`, etc., each pasta gets its
own distinct pairing. The two kiosk sessions just happened to sample two
items that both mapped to popular coffee drinks. Downgrading that finding —
not retracting the observation that repeat overlap could still read as
repetitive to a real customer over many visits, but it is not evidence of a
generic/non-curated fallback.

## Working well (for contrast)

- Anchor Items priority reordering (swap-based, via `movePriority`) and the
  Active toggle both verified correct at the database level once
  pre-existing tied test data (a remnant of an already-documented and
  already-fixed prior bug — see the code comment at `AnchorItems.tsx:113`)
  was controlled for. Initial UI testing looked like a dead button; it
  wasn't.
- `AovView.tsx` already has a deliberate fix (with an explanatory code
  comment) distinguishing a failed RPC call (`error` state, shows "Couldn't
  load this data — not a real zero") from an honest zero-recommendations
  state — good defensive engineering already in place, not something this
  QA pass had to ask for.
- `get_aov_summary` itself is a carefully iterated function (v2 → v3 → v4)
  with an explicit "audit H1" fix already applied for double-counting
  multi-round sessions / retried submits. Real prior effort on this exact
  accuracy problem — finding #1 above is the one gap that remains, not a
  sign the function hasn't been worked on.
- Completion Rules (Pattern 3) is honestly self-labeled as unbuilt ("Edit
  rules directly in Supabase Studio for now — a rule editor UI is planned")
  rather than silently appearing functional. Means Pattern 3 can't fire at
  all currently (zero rules exist in the data), which is a real gap for AOV
  measurement coverage, but at least it's not a misleading UI.
