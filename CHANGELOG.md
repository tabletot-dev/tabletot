# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — 2026-08-02

Implements `docs/plans/2026-08-02-three-app-hardening.md` in full — all four
phases (Blocking, Data correctness, Measurement, Papercuts). Full audit and
per-phase plan in that file; this entry covers what actually landed and what
was found while landing it.

### Phase 1 — Blocking (client-side operational breaks, all three apps)

Decisions D1/D2 from the plan were made per its stated recommendation (no
sign-off round-trip): Close Day → read-only, End Service → new ledger event.
Flag if either should go the other way.

#### 1.1 — "Close Day" no longer bulk-writes (`apps/pos/src/pages/Reports.tsx`)

`handleCloseDay` updated **every open order in the database** — no
`restaurant_id` filter, no ledger event — so it never archived to
`order_history`, never recorded a payment, and left every occupied table's
kiosk stranded believing its span was still live. Replaced with a read-only
"End of Service" panel: lists open tables, links to `/billing` to settle each.
There is no bulk write path anymore.

- Removed `handleCloseDay` and the `closing` state entirely.
- Scoped `fetchDayCloseData`'s `orders` query (live table, has `restaurant_id`)
  to `RESTAURANT_ID`.
- `order_history` queries (`fetchOrders`, day-close `todayRes`) could **not**
  be scoped — `order_history` has no `restaurant_id` column (single-tenant
  pilot assumption baked into 0043's comment). Left as-is; flagged below.
- Aligned date basis: day-close "Today's Takings" now filters on
  `order_created_at` like the History tab, not `created_at` (archive-write
  time) — the two tabs could disagree on which day an order belonged to.
- Dropped `'served'` from the open-order status filter (nothing sets it yet;
  see Phase 4 Task 4.4).

#### 1.2 — Kitchen display can no longer go silently stale (`apps/pos/src/pages/Kitchen.tsx`)

Was Realtime-only after the initial mount: no polling, no refetch on
reconnect, no connection indicator. A dropped WebSocket meant new KOTs never
appeared and the screen looked like a quiet evening — the one screen where a
missed event means food never gets cooked.

- Refetch on every `SUBSCRIBED` (covers reconnect after a network blip).
- 30s fallback poll as a belt-and-braces backstop.
- Live/Offline chip, matching the existing pattern in `Billing.tsx`/`Orders.tsx`.
- Deduped the Realtime INSERT handler — a ticket arriving mid-refetch no
  longer renders twice with a duplicate React key.

#### 1.3 — "End Service" now actually ends service (`supabase/migrations/0052`, `Billing.tsx`)

`handleEndService` closed the `sessions` row only. The trigger that used to
free the table on session close was retired in migration 0049 (ADR 0019); since
then this button's own confirm text ("This resets the kiosk") was false — the
table stayed occupied, `table_state` stayed `ordering`, the kiosk never reset.
Same defect in `handleCleanupStaleSessions`.

- New `service_ended` ledger event type (migration 0052): same table-freeing
  cleanup as `payment_settled` (archive if an order exists, free the table,
  reset `table_state`) but **no** `payments` row and no `amount_paid` — this is
  a walkout/staff-reset, not a paid order. Archives to `order_history` with
  `payment_method = NULL`, `amount_paid = 0` so it's visible for
  reconciliation without being counted as revenue.
- `handleEndService` and `handleCleanupStaleSessions` now call
  `append_event('service_ended', …)` per table instead of writing `sessions`
  directly.
- Removed the redundant client-side `sessions` close in `handlePaymentComplete`
  — `payment_settled` already does it.
- Moved the KOT-archive-on-settle write from a client-side follow-up call
  (which ran against a session that could already be gone server-side) into
  the `payment_settled` and `service_ended` branches of `append_event` itself.

#### 1.4 — Kiosk recovers from a missed settle poke (`apps/kiosk/src/pages/Index.tsx`)

Realtime was the only trigger for the table-state refetch. ADR 0019 says a
missed poke "costs one stale render" — true only if something eventually
refetches. With no polling, a poke lost during a network gap meant the kiosk
never reset; the next customer would sit down to the previous party's screen.

- Added a 30s fallback poll alongside the Realtime subscription.
- Added a refetch on `visibilitychange` (tablet wake).

#### 1.5 — Bill screen and stranded carts (`apps/kiosk`: `BillView.tsx`, `WaitingView.tsx`, `useDeviceNavigation.ts`, `Index.tsx`)

Three related dead ends:

- Once a bill was requested, `BillView`'s "sent" stage rendered with zero
  buttons and no header (`bill-summary` is in `HEADERLESS_SCREENS`) — a
  one-way door. Added a "Back to my order" button.
- "Order More" in `WaitingView` was reachable even after `billRequested`,
  leading straight into `order_submitted`'s server-side rejection
  (`'Bill has been requested — ordering is closed for this table.'`) — surfaced
  to the customer as a raw `alert()`. Disabled the button once a bill is
  requested.
- Replaced the `alert()` in `confirmOrder`/`useDeviceNavigation.ts` with the
  existing in-app toast (`handleConfirmOrder`, `handleCompletionSkip` in
  `Index.tsx` now catch and surface the message). The cart was never being
  cleared on failure either way — this only changes how the customer finds
  out, from a blocking native dialog to a dismissible toast that lets them retry.

### Found while verifying 1.3 (not in the original audit)

Manual smoke-testing the KOT-archive move against local Postgres (not caught
by the golden-session suite, which doesn't exercise settle-then-inspect-KOT)
surfaced two bugs in the fix itself:

- **`kot_tickets.order_id` was `ON DELETE CASCADE`.** Both `payment_settled`
  and `service_ended` `DELETE FROM orders` after archiving. With CASCADE, that
  delete hard-deleted every `kot_tickets` row for the order — including the
  one just marked `'archived'` moments earlier in the same transaction. This
  was true before this session's changes too: the original client-side archive
  call in `handlePaymentComplete` ran *after* the RPC had already deleted the
  order, so it always matched zero rows, silently. **Kitchen ticket history
  was being permanently destroyed on every settle**, not archived-and-hidden.
  Fixed in `supabase/migrations/0053`: changed the FK to `ON DELETE SET NULL`,
  matching how `payments.order_id` already behaves.
- **Archive-then-delete ordering.** With the FK fixed, `DELETE FROM orders`
  now nulls `kot_tickets.order_id` instead of deleting the row — but the
  archive `UPDATE … WHERE order_id = v_state.order_id` in migration 0052 ran
  *after* that delete, so by the time it ran, `order_id` was already NULL and
  the `WHERE` clause matched nothing. The KOT row survived (0053 worked) but
  its status stayed `'accepted'` forever. Fixed in `supabase/migrations/0054`:
  reordered both branches to archive before deleting.
- Both verified directly against local Postgres (not just via the existing
  test suite, which predates `service_ended` and doesn't assert on
  `kot_tickets.status` post-settle): submit → settle → confirm KOT row
  survives with `status='archived'`, `order_id=NULL`, `special_notes` and
  `modifiers` intact; submit → service_ended → same; idempotent replay of a
  duplicate `event_id` returns the stored result without a second
  `table_events` row.

### Flagged, not fixed this phase

- **`order_history` has no `restaurant_id` column.** Task 1.1 asked to scope
  "both" `Reports.tsx` day-close queries; only the `orders` one could be
  (`order_history` has no column to filter on). Single-tenant pilot today, so
  no live impact, but this is a real gap for a second restaurant and isn't
  covered by any task in the plan — needs a migration (add column, and there's
  no way to backfill history written before the column exists, since the
  source `orders` row is deleted by the time it's archived). Worth an ADR note
  before restaurant #2 is onboarded.
- Plan's migration table said Phase 4 would be `0053`/`0054`; the two bugs
  above consumed those numbers. Phase 4 is now `0055`/`0056` when it lands.

### Phase 1 verification

- `apps/kiosk`, `apps/pos`, `apps/dashboard`: `npm run build` clean (tsc + vite) on all three.
- `apps/kiosk`: golden-session harness, 12/12 passing, against local Supabase
  with migrations through 0054.
- Manual SQL smoke tests against local Postgres for `service_ended`,
  `special_notes`/`modifiers` passthrough, KOT archive survival, and
  `append_event` idempotent replay (see above).
- Types regenerated for all three apps after each schema-affecting migration.

### Phase 2 — Data correctness (staff act, system silently ignores them)

#### 2.1 — POS-created menu items are now visible to the kiosk (H3, `apps/pos/src/pages/Menu.tsx`, `AdminMenuItems.tsx`)

Both admin surfaces inserted `menu_items` without `restaurant_id`. That column
has no DB default (0033 only covered `restaurant_tables`), so new items
landed NULL and the kiosk's `.eq('restaurant_id', …)` read excluded them —
staff would add a dish in POS, see it there, and it would never appear on any
tablet. Added `restaurant_id: RESTAURANT_ID` to both inserts. Deliberately
did **not** add a DB default (ADR 0013 forbids hardcoded tenant UUIDs in
migrations).

#### 2.2 — POS queries scoped to the restaurant (`Kitchen.tsx`, `Orders.tsx`, `Billing.tsx`, `Menu.tsx`, `AdminMenuItems.tsx`)

Nothing in the POS was tenant-scoped — `docs/notes/restaurant-id-query-audit.md`
only ever covered the kiosk. No live impact today (single-tenant pilot) but at
a second restaurant the kitchen would see the other café's tickets.

- Added `.eq('restaurant_id', RESTAURANT_ID)` to every query named in the plan.
- Realtime: Supabase Postgres Changes supports only one `filter` clause per
  subscription. `Kitchen.tsx`'s INSERT listener already filters on
  `status=eq.accepted`, so `restaurant_id` is checked client-side in that
  callback instead of a conflicting second filter. `Orders.tsx` and
  `Billing.tsx`'s channels had no competing filter, so `restaurant_id=eq.…`
  was added directly to those.
- `docs/notes/restaurant-id-query-audit.md` extended with a POS section.

**Found, not fixed:** `order_history` has no `restaurant_id` column at all —
a schema gap, not an oversight (0043's comment: "restaurant scoping is
implicit", a single-tenant-pilot assumption). This blocks scoping
`Reports.tsx`'s two `order_history` queries and half of Task 2.4 below. Needs
its own migration + ADR before a second restaurant onboards — not silently
expanded into this phase. Also flagged: `bill_requests` and `table_requests`
were outside this task's file list and weren't checked for a `restaurant_id`
column.

#### 2.3 — Item notes and variants now reach the kitchen (`apps/pos/src/pages/Billing.tsx`, `Kitchen.tsx`)

`handleSendToKitchen` always sent `modifiers: []`, dropping every variant/addon
selection. `specialNotes` was assembled locally but only ever used for the
POS's own ticket preview — migration 0052 (Phase 1) added the column write,
but the client was still sending nothing to write. Now sends real
`modifiers` (variant + addon names) and `special_notes` in the
`order_submitted` payload; `Kitchen.tsx` renders `item.modifiers` under each
line. A server entering "no sugar, large" now sees it reach the kitchen
display, not just their own screen.

#### 2.4 — Settled orders no longer disappear from the Orders page (`apps/pos/src/pages/Orders.tsx`)

`payment_settled` deletes the live `orders` row after archiving to
`order_history` (0049). `Orders.tsx` read only `orders`, so once a table paid,
staff had no way to look up what it ordered from this screen (Reports has it,
but that's a different workflow — "find that order" vs. "run the numbers").
Now unions in `order_history` (`original_order_id` → `id`), with a "Settled ·
{payment method}" badge and the per-order status `Select` hidden for settled
rows (there's no live `orders` row left to update).

#### 2.5 — Voice menu refresh actually works now (H4, `services/order-engine/backend/main.py`, `apps/pos/src/pages/Menu.tsx`)

Two independent breaks, both confirmed:

- `Request` was never imported in `main.py` (only `FastAPI` was) and
  `from __future__ import annotations` made FastAPI resolve the type hint
  lazily — unable to find `Request` in scope, it fell back to treating the
  parameter as a required query string param, 422ing every real call.
  Confirmed via FastAPI's own route introspection before/after (see plan for
  the exact values). Fixed by importing `Request`/`HTTPException` at module
  level.
- Even once reachable, the POS sent no `X-Admin-Key` header, so the endpoint
  403'd — silently, since the fetch was wrapped in `.catch(() => {})`. Now
  sends `VITE_VOICE_ADMIN_KEY` and surfaces both non-2xx and unreachable as a
  destructive toast instead of swallowing the failure.
- Bonus fix in the same function: it only ever refreshed `session_manager._menus`,
  never `_menu_graphs` (pairing/anchor data) — so even a successful admin
  refresh left recommendation context stale until the 6-hour background cycle.
  Reused the exact atomic-assignment pattern already established in the
  existing `_refresh_loop` (load all three concurrently via `asyncio.gather`,
  assign both dicts with no `await` between them) rather than inventing a new one.
- `VITE_VOICE_ENGINE_URL` and `VITE_VOICE_ADMIN_KEY` added to
  `apps/pos/.env.example` — the former was read by the code but never
  documented there.

### Phase 2 verification

- `apps/kiosk`, `apps/pos`, `apps/dashboard`: `npm run build` clean.
- `apps/kiosk`: golden-session harness, 12/12.
- `services/order-engine`: full test suite, 169 passed / 3 skipped (skips
  pre-existing, API-key-gated) — no regressions from the `main.py` change.
- `services/order-engine`: directly inspected the fixed route's FastAPI
  `Dependant` (`request_param_name`, `query_params`) to confirm the actual
  routing bug is gone, rather than relying only on "it still builds."
- Manual SQL verification against local Postgres: `menu_items` insert with
  `restaurant_id` lands correctly and is found by the kiosk's scoped read
  pattern.
- No live click-through this session (no running kiosk/POS/order-engine
  instance) — noted per-task above, and as a phase-level caveat in the plan.

### Phase 3 — Measurement (the pilot's gating milestone)

#### 3.1 — AOV query failures no longer render as a real zero (`apps/dashboard/src/pages/AovView.tsx`)

Destructured only `{ data: rows }` from the RPC call and discarded `error`.
On any failure — bad param, permission, the RPC itself missing — the card
fell through to *"No recommendations accepted in this date range yet."* This
is the headline number on the screen shown to the restaurant owner, and a
broken query was indistinguishable from an honest zero. Both cards now
capture `error` and render a distinct state (message + Retry button) instead
of silently agreeing with a failure.

#### 3.2 — Hero-dish attribution hole closed (`apps/kiosk/src/pages/Index.tsx`)

`append_event` writes `span_id = NULL` for analytics fired while the table is
idle. A span opens on `session_started` or implicitly on `order_submitted` —
but the HomeView hero-dish tap jumped straight to the item-detail screen
without calling `startSession()`, so every `item_added` on that path
(including `pairing_chip` and `completion_nudge` adds) landed unattributed:
`get_aov_summary`'s `rec_adds` CTE joins on `span_id`, which NULL never
matches. Their order still counted toward `total_revenue` — a silent,
unbounded undercount in exactly the number a pilot conversation with the
owner would lean on. `onSelectItem` now awaits `startSession()` before
navigating, mirroring the "Start Ordering" button exactly (idempotent for an
already-open span).

Verified directly against local Postgres: `session_started` → `item_added`
with `source: 'pairing_chip'` → confirmed `span_id IS NOT NULL` on that event
(previously NULL) → `order_submitted` → confirmed the item appears in
`get_aov_summary`'s `accepted_count`.

**Not done — needs Rohan, against remote:** the plan asked to quantify the
historical size of this gap before using pre-fix AOV numbers in an owner
conversation. This session only has local Docker Supabase (no pilot traffic).
Query and instructions in
`docs/notes/2026-08-02-hero-dish-attribution-gap.md`.

#### 3.3 — Detail-view pairings: real ones only, and now measured (M6, `apps/kiosk/src/pages/Index.tsx`, `DetailView.tsx`)

Two problems. `getDetailPairings` fabricated a pairing when nothing was
curated — falling back through signature anchor → chef's pick → any
coffee/tea item → **any menu item at all** — rendered under "Pairs well
with" as if it were curated. And adds from this panel carried source
`"detail_view"`, which the AOV RPC never counted, so even a real curated
pairing shown here was invisible to acceptance-rate and revenue numbers.

- Deleted the fabrication fallback entirely — no curated pairing means no
  panel, not an uncurated guess presented as one.
- Add handler now emits `pairing_chip` (consistent with the grid card's
  `DishCard.tsx`, no migration needed) instead of `detail_view`.
- `DetailView.tsx` now fires `recommendation_shown`/`recommendation_tapped`,
  copying `DishCard.tsx`'s existing dedup-ref pattern rather than inventing a
  new one (`surface: 'inline_pairing'`).

**Found, not fixed:** the pairing *stepper* (already-in-cart +/− buttons)
shares a single `onUpdateQuantity` prop with no per-call source, so a
stepper bump on a pairing item still attributes as `main_menu`. Fixing needs
a new prop to distinguish which item's stepper fired — judged outside this
task's named scope (the initial add), left as a follow-up.

#### 3.4 — Idempotency key survives retries, not just re-sends the same failure (`apps/kiosk/src/lib/orderSubmission.ts`)

`eventId` was generated fresh on every `submitOrder()` call. The comment
claimed "a retry of THIS submission reuses the id", but nothing implemented
that — a second Confirm tap after a lost response minted a *new* key. If the
RPC had already committed server-side and only the network reply was lost,
the kitchen could receive the round twice; `isSubmitting` only guards
double-taps, not this. `event_id` is now keyed on cart contents (module-level
variable, matching the file's existing `cachedTableId` pattern — `submitOrder`
isn't a hook), reused across retries of the same cart, cleared on success.

Added `apps/kiosk/src/lib/__tests__/orderSubmission.test.ts` (a new file, not
`ledger.test.ts` — that file mocks `orderSubmission.ts` wholesale to test
`ledger.ts` in isolation, so `submitOrder`'s own logic needed its own home):
two cases, same cart retried after a failure reuses `event_id`; a changed
cart mints a new one.

### Phase 3 verification

- `apps/kiosk`, `apps/pos`, `apps/dashboard`: `npm run build` clean.
- `apps/kiosk`: golden-session harness 12/12; full unit suite 4/4 (2 new
  tests for Task 3.4).
- Manual SQL verification against local Postgres for Task 3.2's attribution
  mechanism (see above).
- Tasks 3.1 and 3.3 are pure client-rendering/event-emission changes verified
  by build + code review (mirroring already-working patterns elsewhere in the
  codebase) rather than DB-level testing, since there's no server-side logic
  to verify independently.

### Phase 4 — Papercuts

#### 4.1 — Completion-nudge loop fixed (H5, `apps/kiosk/src/lib/completionRules.ts`)

`findMatchingRule` never checked whether its suggested item was already in
the cart. Accepting the nudge (or already having the item) re-matched on the
next Confirm tap — any `has_category` rule stayed true forever. Now skips
any rule whose suggested `item_id` is already in the cart.

#### 4.2 — Bill total matches its own line items (M1, `apps/kiosk/src/hooks/useDeviceNavigation.ts`)

`sessionTotal` added the current unsent cart to the sum of submitted rounds,
but `BillView` only itemizes submitted rounds — the displayed total could
exceed the sum of its own listed lines, and what POS actually charges.
`sessionTotal` had exactly one consumer (`BillView`, confirmed by grep); now
sums submitted rounds only.

#### 4.3 — Water request no longer lies about success (M2, `apps/kiosk/src/pages/Index.tsx`)

`onRequestWater` showed "Water requested" even when the insert failed —
staff never got the request either way, and the customer had no idea.
Now checks the insert's `error` and shows a distinct failure toast.

#### 4.4 — Kitchen status reaches "served" (M3, `supabase/migrations/0055`)

Two related gaps, both closed:

- The KOT→order status trigger explicitly skipped `archived` transitions,
  on the assumption archiving only happens post-payment. But Kitchen.tsx's
  "Complete & Archive" button archives a `ready` ticket *during* service —
  that's the real signal a round is done, and nothing ever propagated it.
  `WaitingView`'s progress bar capped at "Plating 85%" forever. Now: when the
  last active KOT for an order is archived, `orders.status` becomes `served`.
- All rounds share one order row. Sending round 2 while round 1 was `ready`
  merged the items but never reset status, so a brand-new round displayed at
  85% instantly. The `order_submitted` merge branch of `append_event` now
  resets `status = 'new'` on every round-2+ merge.
- Both verified directly against local Postgres: `preparing` → `ready` →
  `archived` on a KOT correctly drove the order through the matching
  statuses, ending at `served`; sending a second round after that reset it
  to `new`.

#### 4.5 — Promo carousel is no longer off-brand or network-dependent (`apps/kiosk/src/components/screens/WaitingView.tsx`)

Hotlinked four Unsplash images with fashion/travel/audio copy — unrelated to
a restaurant, and broken on Wi-Fi without internet (flagged highest-severity
in the UX audit: "reads as broken or unfinished"). No real restaurant
marketing assets exist to swap in, and inventing fake "coffee shop" stock
content would repeat the same mistake with different lorem ipsum. Instead:
reused the `categoryGradient()` palette already established for dish-image
fallbacks (zero network dependency — fixes the Wi-Fi complaint
unconditionally) and rewrote the copy to be genuinely about the ordering
experience ("Order More any time", "flag allergies at the bill") instead of
fabricated products. Same DOM/CSS structure preserved, so no
`tabletot.css` edits were needed.

#### 4.6 — Dashboard failures no longer render as empty tables (`apps/dashboard`)

`AnchorItems.tsx`'s `movePriority` checked neither of its two parallel
updates — a partial failure left two anchors sharing a priority, after which
the up/down buttons swapped equal values and appeared dead with no error
shown. Now checks both results and toasts on failure. `CompletionRules.tsx`'s
`fetchRules` and both apps' `fetchMenuItems` helpers (`ItemPairings.tsx`,
`AnchorItems.tsx`) discarded `error` entirely, rendering a failed load as "no
rules yet" / an empty dropdown — same pattern as the AOV fix in 3.1, smaller
stakes. All three now capture and toast the error.

#### 4.7 — Consistent delete confirmations (dashboard)

`ItemPairings.tsx` and `AnchorItems.tsx` deleted rows with one click, no
confirmation — inconsistent with POS's menu delete, which does confirm.
Added a matching `confirm()` prompt to both.

#### 4.8 — Phone number validation matches project convention (L6, `apps/kiosk/src/components/screens/BillView.tsx`)

Accepted any 10+ digit string. Project convention (CLAUDE.md) is 10 digits
starting 6-9. `canSubmitPhone` now strips an optional country code (91/+91)
and validates the remaining 10 digits against `/^[6-9]\d{9}$/`. Only the
validation rule changed — what's stored in `bill_requests.phone` is
unchanged.

#### 4.9 — Dead pre-ledger settle path deleted (`apps/pos/src/components/billing/`)

`POSLayout.tsx` and `SettleBillModal.tsx` had zero importers anywhere in the
codebase (confirmed by grep) and were not routed in `App.tsx` — dead since
some earlier refactor. `SettleBillModal.tsx` contained a full pre-ledger
direct-write settle path (`payments` insert, `orders.status` update,
`restaurant_tables` reset — no `append_event` call at all). Deleted both
files rather than migrating them onto the ledger, since nothing reaches them.

#### 4.10 — Anon direct-write RLS grants revoked (`supabase/migrations/0056`)

Dropped the `anon_update` policies on `orders`/`sessions` from migration
0032. `append_event` is `SECURITY DEFINER` (bypasses RLS entirely) and has
been the sole writer for lifecycle state since ADR 0019 — these grants were
dead weight, leaving the single-writer invariant enforced by convention
rather than permissions. Verified safe before writing the migration: no
direct `.from('orders'|'sessions').update()` calls anywhere in the kiosk (the
only anon-role caller — confirmed by grep), and both tables carry a separate
`staff_write` policy (`FOR ALL TO authenticated`) that POS's two remaining
direct writes (a discount apply, a manual status dropdown) already go
through, unaffected by this change.

**Found while verifying:** the golden-session harness's "pre-ledger
baseline" test called `submit_order` (migrations 0044/0045) — a
`SECURITY INVOKER` function superseded by `append_event` since the ledger
refactor, with zero live callers anywhere in app code (confirmed by
repo-wide grep). Its internal `SELECT ... FOR UPDATE` on `sessions` depended
on the anon role having an UPDATE policy on that table — Postgres RLS derives
`FOR UPDATE` row-lock permission from the table's UPDATE policy, not just its
SELECT policy, so revoking `anon_update` correctly made that lock (and the
test) fail with "Session not found." Fixing this by keeping `anon_update`
alive would have defeated the entire point of the task — a permission this
session-manufactured golden test needed, that nothing in the live app needs.
Removed the dead test and its dependency instead of the fix. Golden-session
suite is now 11 tests (was 12).

Directly verified the RLS change itself against local Postgres, not just
"tests still pass": `SET ROLE anon` inside a transaction, attempted a direct
`UPDATE sessions ...` against a real row — `UPDATE 0`, row unchanged. Then
confirmed `append_event` (the RPC everything actually uses) still succeeds
as `anon` in the same session.

### Phase 4 verification

- `apps/kiosk`, `apps/pos`, `apps/dashboard`: `npm run build` clean.
- `apps/kiosk`: golden-session harness 11/11 (see 4.10); full unit suite 4/4.
- Manual SQL verification against local Postgres for Task 4.4 (status
  propagation through preparing → ready → served, and reset on round 2) and
  Task 4.10 (RLS actually blocks anon; RPC still works as anon).

### Docs updated to close out the plan

- **New ADR 0020** for the `service_ended` event (`docs/decisions/`) — it
  extends the ADR 0019 state machine, which that ADR explicitly called "a
  single, reviewed chokepoint," so the extension itself is architectural.
- **New note** `docs/notes/2026-08-02-detail-view-pairing-attribution.md` for
  the Task 3.3 source-string decision — extends ADR 0018's counting rule to a
  new surface rather than changing the rule, so a note rather than a new ADR.
- `docs/overview.md` — ledger section updated through migration 0056; dropped
  the "known remaining direct-write path" line (Task 4.9 removed it); "Last
  updated" bumped.
- `docs/notes/restaurant-id-query-audit.md` — extended to the POS (done in
  Phase 2).
- `docs/notes/2026-08-02-hero-dish-attribution-gap.md` — records the Task 3.2
  quantification query and instructions for running it against remote (done
  in Phase 3).

### Not done this session (all four phases)

No live click-through in a running kiosk/POS/dashboard/order-engine instance
— none were running this session. Everything that touches server-side state
(schema, RPC, FastAPI routing, idempotency logic, RLS) was verified directly
against local Postgres/Python; everything that's pure client rendering was
verified by build + code review only. Recommend a manual pass before the
pilot goes live.

Two schema gaps were found and documented, not fixed — expanding either
would have gone beyond what was asked:

- `order_history` has no `restaurant_id` column (single-tenant pilot
  assumption baked into 0043's comment) — blocks full tenant scoping of
  `Reports.tsx` and part of the `Orders.tsx` settled-orders union. Needs a
  migration + ADR before a second restaurant onboards.
- `bill_requests`/`table_requests` were never checked for a `restaurant_id`
  column at all — outside every task's named file list.

---

## [Unreleased] — 2026-06-09 (continued)

### Phase 1 — Data Correctness (pilot blocker)

#### 1A: Atomic order submission RPC (`supabase/migrations/0044_submit_order_rpc.sql`, `0045_fix_submit_order_rpc_ambiguous_column.sql`)

**Fixed four data-correctness issues in a single migration:**

- **TOCTOU race** — session status was previously checked *after* the order write. The new `submit_order` RPC checks session status first under `SELECT ... FOR UPDATE`, making bill-lock enforcement atomic.
- **Ghost orders on crash** — the old flow made 6 sequential round-trips. Any crash between steps left partial DB state. The RPC runs the entire flow (session check → order upsert → KOT insert) inside one implicit transaction.
- **`items_json` accumulation** — the client was appending round arrays instead of merging. The RPC groups by item `id` and sums `qty`, so `orders.items_json` always reflects the true cumulative order state.
- **`kot_number` collision** — `KOT-${Date.now()}` is not unique under concurrent load. Replaced with `KOT-<gen_random_uuid()>` inside the DB.
- **Bonus:** 6 sequential Supabase round-trips collapse to 1. Authoritative subtotal is now computed from `menu_items.price` in the DB, not from client-supplied values.
- **Bug fix (0045):** `RETURNS TABLE` declares columns named `subtotal`/`total` which PL/pgSQL exposes as local variables. In the UPDATE path, `SELECT subtotal FROM orders` was ambiguous (SQLSTATE 42702). Fixed by qualifying with `orders.subtotal`.

**`apps/kiosk/src/lib/orderSubmission.ts`** — replaced the 6-step sequential body with a single `.rpc('submit_order', {...})` call. Removed now-unused `computeTotals` import.

#### 1B: Reliable `order_submitted` event delivery (`apps/kiosk/src/lib/eventBus.ts`)

`order_submitted` is the critical AOV measurement event. A single network blip must not silently drop it.

- Added a `localStorage`-backed retry queue for `order_submitted` only. On failure, the event is pushed to `tt_pending_events`. The queue is drained on the next `track()` call.
- Max queue depth: 10 entries. Oldest evicted on overflow.
- All other event types (`recommendation_shown`, `item_added`, etc.) remain fire-and-forget. The queue drain runs opportunistically on those calls too.

---

### Phase 2 — Reliability

#### 2A: Voice session recovery on 4004 (`apps/kiosk/src/components/VoiceOrderButton.tsx`)

The voice backend keeps sessions in memory. A backend restart drops all sessions; the next PTT press received WS close code 4004 and voice died silently with no user feedback.

- Extracted session init into a restartable `initSession()` function inside the component's `useEffect`.
- On receiving `"Session not found"` error from either the STT or TTS WebSocket, `doRestart()` tears down the current TTS connection and re-establishes a new voice session transparently.
- Cart state is intact in React — the next PTT press will send `cart_sync` as normal.
- Guarded against concurrent restart calls and unmounted components.

#### 2B: Session idle timeout raised + passive heartbeat (`backend/main.py`, `backend/routers/voice.py`)

- Raised `_SESSION_IDLE_SECONDS` from 15 to 30 minutes. Customers reading a long menu were being reaped before ever pressing PTT.
- Added a passive heartbeat in the TTS WebSocket loop: if no TTS work arrives for 60 seconds (customer browsing), `touch_session()` is called to reset the idle timer. The TTS connection itself is enough proof the session is active.

#### 2C: Menu consistency within a streaming turn (`backend/main.py`)

The 6-hour background `_refresh_loop` was loading `menu_data`, `index`, and `graph` in three separate `asyncio.to_thread` calls and assigning them with `await`s between each assignment. A `create_session()` call arriving mid-refresh could pick up a new `_menus` entry but an old `_menu_graphs` entry.

- Changed `_refresh_loop` to load all three concurrently via `asyncio.gather`, then assign both dicts without an `await` between them. The two assignments are now as close to atomic as Python allows.
- Same fix applied to the `/admin/refresh-menu` endpoint.

#### 2D: POS Supabase client crash guard (`apps/pos/src/integrations/supabase/client.ts`)

The POS client passed `undefined` directly to `createClient()` when env vars were missing, causing an immediate runtime crash on any machine without `.env.local`.

- Added the same `hasSupabaseConfig` guard pattern used by the kiosk client.
- When env vars are absent, placeholder values are used so the module loads cleanly. The guard is exported for call sites that need to conditionally skip DB operations.

---

### Phase 3 — Maintainability

#### 3A: `completionRules` moved into `menuStore` (`apps/kiosk/src/lib/menuStore.tsx`, `apps/kiosk/src/pages/Index.tsx`)

`CompletionNudge` previously fetched `meal_completion_rules` via a standalone `useEffect` + Supabase call on every mount (including a 700ms timeout). This was a separate DB round-trip that duplicated the pattern already used for pairings and anchors.

- Added `meal_completion_rules` to the `Promise.all` in `menuStore.fetchAll()`. Rules are now available synchronously from context at the moment "Send to Kitchen" is tapped.
- Added `meal_completion_rules` to the Realtime subscription list so rule changes propagate live.
- Removed the standalone Supabase fetch from `handleConfirmOrder` in `Index.tsx`.
- Removed the now-unused `withTimeout` helper.
- `MenuState` interface updated to expose `completionRules: CompletionRule[]`.

#### 3B: Supabase types regenerated (`apps/kiosk/src/integrations/supabase/types.ts`)

Types regenerated from local Supabase after applying all migrations through 0044.

- `display_name` columns now present in `sessions.Insert/Update` and `kot_tickets.Insert/Update` — removed two `as never` casts in `orderSubmission.ts` (`setSessionDisplayName`, `startSession`).
- `submit_order` RPC now present in generated types — removed `as never` cast on `supabase.rpc('submit_order', ...)` and the manual `Array<{...}>` result cast in `submitOrder()`.

#### 3C: `RESTAURANT_ID` single source of truth (`apps/kiosk/src/lib/config.ts`)

`RESTAURANT_ID` was declared 5 times across the kiosk app; `TABLE_NUMBER` was declared twice with module-level `window.location.search` side effects in both places.

- Created `apps/kiosk/src/lib/config.ts` as the single source for both constants.
- Updated all kiosk files to import from `@/lib/config`:
  - `apps/kiosk/src/lib/orderSubmission.ts`
  - `apps/kiosk/src/lib/menuStore.tsx`
  - `apps/kiosk/src/lib/eventBus.ts`
  - `apps/kiosk/src/components/CompletionNudge.tsx`
  - `apps/kiosk/src/pages/Index.tsx`

#### 3D: `/admin/refresh-menu` authentication (`backend/main.py`)

The admin endpoint was unauthenticated — anyone who could reach the Railway URL could trigger a full menu reload.

- Added `X-Admin-Key` header check against `ADMIN_API_KEY` env var.
- Returns `503` if `ADMIN_API_KEY` is not configured on the server (prevents silent open access in misconfigured deploys).
- Returns `403 Forbidden` on header mismatch.
- Set `ADMIN_API_KEY` in the Railway environment for the order-engine service.

---

#### 2E: Voice session persistence across Railway restarts (`supabase/migrations/0046_voice_sessions_table.sql`, `voice_agent/session_manager.py`, `backend/main.py`)

A Railway redeploy dropped all in-memory voice sessions silently. The kiosk received a 4004 close code on the next PTT press and had no way to distinguish a backend restart from a normal timeout.

- Added `voice_sessions` table with `status` vocabulary: `active`, `closed`, `reaped`, `interrupted`.
- `SessionManager` now accepts a `db_pool` parameter. Fire-and-forget DB writes (via `asyncio.to_thread`) record each session lifecycle event without blocking the hot PTT path:
  - `create_session()` → INSERT `status='active'`
  - `end_session()` → UPDATE `status='closed'`
  - `reap_idle_sessions()` → UPDATE `status='reaped'` (direct, bypasses `end_session` to preserve the distinction)
  - `startup_cleanup()` → UPDATE any lingering `status='active'` rows to `status='interrupted'`
- `startup_cleanup()` is called in `lifespan` before the app begins accepting requests. This ensures stale rows from a crashed process are cleaned up immediately on restart.
- `db_pool` is now created before `SessionManager` in `main.py` so it can be passed at construction time.
- Note: conversation history is not revived (not worth it — voice sessions are stateless per PTT press). Cart state is reconciled via `cart_sync` on the next PTT press (see 2F).

#### 2F: Cart/voice state reconciliation on reconnect (already in place)

`cart_sync` was already implemented end-to-end: `sttClient.ts` sends `{type:"cart_sync", items:[...]}` as the first message of every STT WebSocket before audio begins. `_apply_cart_sync()` in `voice.py` reconciles `OrderState` from the kiosk's touch cart on every PTT press. This means any divergence — whether from a backend restart or a mid-session TTS drop — is corrected automatically on the next press with no additional code. Documented here to close the open issue.

---

### Phase 3 — Maintainability (continued)

#### 3E: Dashboard Supabase client crash guard (`apps/dashboard/src/integrations/supabase/client.ts`)

The dashboard client passed `undefined` directly to `createClient()` when env vars were missing, matching the unfixed state that was fixed in POS in 2D.

- Added `hasSupabaseConfig` guard, `safeUrl`, `safeKey` placeholders — same pattern as kiosk and POS.
- Renamed env var from `VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY` to match the other apps.
- Updated `apps/dashboard/.env.example` to reflect the renamed variable.

#### 3F: `CategoryIcon` extracted from `MenuView` (`apps/kiosk/src/components/CategoryIcon.tsx`)

The 83-line `CategoryIcon` component was declared inline inside `MenuView.tsx`. Adding a new DB category required a developer to locate and edit the component embedded inside a view file.

- Extracted `CategoryIcon` to `apps/kiosk/src/components/CategoryIcon.tsx` — the icon map and fallback are now isolated, self-documented, and independently importable.
- `MenuView.tsx` imports `CategoryIcon` from the new file. No behaviour change.

---

## Operational notes

### RPC test results (local Supabase, 2026-06-09)

| Test | Expected | Result |
|------|----------|--------|
| 1 — bad session key | `Session not found.` error | ✓ |
| 2 — round 1, 1×Veggie Bagel | subtotal=360, total=378 | ✓ |
| 3 — round 2, +2×Veggie Bagel, merge | orders.qty=3, subtotal=1080, total=1134 | ✓ |
| 4 — bill_requested blocks ordering | `ordering is closed` error | ✓ |

### Still to do before deploying

1. Set `ADMIN_API_KEY` in Railway environment for the order-engine service.
2. Push migration 0045 to remote (`supabase db push`).

### Testing the RPC locally

```sql
SELECT * FROM submit_order(
  '<restaurant_uuid>',
  '<table_uuid>',
  'T1',
  'test-session-key',
  '[{"id":"<item_uuid>","name":"Espresso","qty":2,"price":180,"modifiers":[]}]'::jsonb
);
```
