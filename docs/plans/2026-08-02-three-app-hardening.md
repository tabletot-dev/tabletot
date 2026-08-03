# Three-App Hardening Plan — kiosk, POS, dashboard

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> Implement phase by phase, in order. Do not start Phase N+1 until Phase N's
> verification passes.

**Goal:** Remove every client-side operational break across the three apps, so
that no failed or missed operation renders as a normal-looking screen.

**Source:** Audit conducted 2026-08-01/02 against the live code on branch
`pilot-hardening`. Supersedes the open items in
`docs/notes/2026-07-11-codebase-bug-audit.md` that survived the ledger refactor
(ADR 0019). Bug IDs below (C1, H3, M1…) refer to that audit.

## The pattern being fixed

Nine of the eleven POS/dashboard findings are the same defect: **a failed or
missed operation renders as a plausible, normal screen.** Failed AOV query →
"no recommendations yet." Dropped Realtime → "no orders in queue." Missing
`restaurant_id` → the dish simply isn't there. Dropped notes → a blank ticket.
Nobody sees an error; everybody gets a confident wrong answer.

Every fix below should be judged against one rule: **when this operation fails,
does a human find out?**

## Global constraints

- **Never edit an existing migration.** Migrations end at `0051`; this plan
  creates `0052` onward. (Phase 1 execution consumed `0052`–`0054` — two more
  than planned, see the Phase 1 status note below. Phase 4's migrations are
  therefore `0055`/`0056`, not `0053`/`0054`.)
- **Apply migrations to local Supabase (Docker) only** (`supabase db reset` or
  `supabase migration up`). Rohan pushes to remote himself — never run
  `supabase db push`.
- **After every migration, regenerate types for all three apps** before writing
  TS against the new schema:
  ```
  supabase gen types typescript --local > apps/kiosk/src/integrations/supabase/types.ts
  supabase gen types typescript --local > apps/pos/src/integrations/supabase/types.ts
  supabase gen types typescript --local > apps/dashboard/src/integrations/supabase/types.ts
  ```
- **THE VOICE PIPELINE IS FROZEN.** Do not touch `apps/kiosk/src/lib/voice/`,
  `VoiceOrderButton`, `VoiceConversationPanel`, `ListeningScreen`, or
  `services/order-engine/` — except Phase 2 Task 2.5, which is a two-line fix in
  `main.py` outside the voice path and is explicitly authorised by this plan.
- **Single-writer invariant:** every lifecycle mutation goes through
  `append_event`. A direct write to `orders` / `sessions` / `restaurant_tables`
  from any app is a bug (ADR 0019).
- Do not edit `apps/kiosk/src/styles/tabletot.css`.
- Deploys and git pushes are manual — commit locally only.
- Pilot restaurant UUID: `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91`.

## Decisions needed before starting

Two fixes change staff-facing behaviour and need Rohan's call. **Ask before
implementing Phase 1 Tasks 1.1 and 1.3.**

- **D1 — "Close Day" semantics.** Recommendation: make it read-only. It lists
  open tables and links to Billing to settle each; it no longer writes. Rationale:
  the current bulk write is the only way to lose revenue silently, and a café
  closing out has to touch each table anyway. Alternative if a bulk action is
  genuinely wanted: keep the button but route each open order through
  `payment_settled` with `payment_method: 'day_close'` so revenue is archived.
- **D2 — "End Service" semantics.** Recommendation: new `service_ended` ledger
  event that frees the table and resets the kiosk *without* recording a payment
  (walkout / staff reset). Alternative: delete the button and require settle.

---

# Phase 1 — Blocking (can lose money, food, or a table mid-service)

## Task 1.1 — Neutralise "Close Day" — DONE (D1: read-only)

**File:** `apps/pos/src/pages/Reports.tsx` (`handleCloseDay`, `fetchDayCloseData`)

Current code updates **every open order in the database** — no `restaurant_id`
filter, no table filter — and writes only the `orders` projection, so
`table_state` stays `ordering`, nothing archives to `order_history`, and no
`payments` row is written. Result: revenue silently dropped, every occupied
table's kiosk stranded.

- [x] Implement per D1 (read-only). Deleted `handleCloseDay` and the
      `.update()` call; open-order list now links to `/billing`.
- [x] N/A — bulk-settle path not taken (D1 = read-only).
- [x] Scoped `fetchDayCloseData`'s `orders` query to `RESTAURANT_ID`.
- [x] Dropped `'served'` from the status filter.
- [x] Aligned date basis to `order_created_at` in both queries. Note:
      `order_history` has no `restaurant_id` column, so that half of the
      scoping ask (Task 2.2 also names this file) could not be done — flagged
      as a gap in CHANGELOG.md, needs its own migration + ADR before a second
      restaurant onboards.

**Verify:** ✅ `npm run build` clean. Manual review: no `.update()` call
remains on `orders` anywhere in this file.

## Task 1.2 — Kitchen must never silently stop receiving orders — DONE

**File:** `apps/pos/src/pages/Kitchen.tsx`

`fetchTickets` runs once on mount; everything after is Realtime-only. No
polling, no refetch on resubscribe, no connection indicator. A dropped
WebSocket means new KOTs never appear and the screen looks like a quiet evening.

- [x] Refetch on `SUBSCRIBED`.
- [x] 30s fallback poll, cleared on unmount.
- [x] `isConnected` + Live/Offline chip, matching `Billing.tsx`.
- [x] Deduped the INSERT handler.

**Verify:** ✅ `npm run build` clean. Not exercised live against a real
network drop (no running kiosk/POS instance this session) — verified by code
review against the exact mechanism (subscribe status callback + interval) and
by the equivalent server-side idempotency/reconnect behaviour confirmed for
Task 1.4. Recommend a live network-kill pass before the pilot goes live.

## Task 1.3 — "End Service" must actually end service — DONE (D2: new service_ended event)

**Files:** `supabase/migrations/0052_*.sql`, `apps/pos/src/pages/Billing.tsx`
(`handleEndService`, `handleCleanupStaleSessions`, `handlePaymentComplete`)

`handleEndService` closes the `sessions` row and nothing else. The trigger that
used to free the table (`trg_free_table_on_session_close`) was dropped in
`0049:261`, so today: `restaurant_tables` stays occupied, `table_state` stays
`ordering`, the kiosk never resets. The button's own confirm text says "This
resets the kiosk" — it does not. Same defect in `handleCleanupStaleSessions`.

- [x] Migration `0052`: `service_ended` added to `append_event` and the
      `table_events` CHECK constraint. No `payments` insert; archives with
      `payment_method: null`, `amount_paid: 0`.
- [x] `handleEndService` calls `append_event('service_ended', …)`.
- [x] `handleCleanupStaleSessions` loops the same event per stale table
      (needed adding `table_id` to its `sessions` select).
- [x] Removed the redundant direct `sessions` write in `handlePaymentComplete`.
- [x] Moved the KOT archive into the RPC — but see "Found while verifying"
      below: this move exposed two pre-existing/newly-introduced bugs
      (CASCADE delete, then archive-after-delete ordering), fixed in
      migrations `0053` and `0054`.

**Verify:** ✅ Verified directly against local Postgres (not just build/tsc —
this task changes server-side state-machine behaviour that the existing test
suite doesn't cover): `session_started` → `order_submitted` (with
`special_notes`/`modifiers`) → `service_ended` on a live table, confirmed
`restaurant_tables.status='available'`, `table_state.state='idle'`,
`sessions.status='closed'`, live `orders` row gone, `order_history` row
present with `payment_method=NULL`/`amount_paid=0`/`total` preserved, KOT
`status='archived'` with notes/modifiers intact, and idempotent replay of a
duplicate `event_id` returns the stored result without a second
`table_events` insert. Full transcript in CHANGELOG.md.

## Task 1.4 — Kiosk must recover from a missed poke — DONE

**File:** `apps/kiosk/src/pages/Index.tsx:129-148`

Same class as 1.2. `refetch` runs on mount and on `table_state` pokes only. If
the settle poke lands during a network gap, the kiosk never resets — the next
customer sits down to the previous party's waiting screen. ADR 0019 assumed a
missed poke costs "one stale render"; with no polling it costs the whole reset.

- [x] 30s interval refetch alongside `subscribeTableState`, cleared on unmount.
- [x] Refetch on `visibilitychange`.

**Verify:** ✅ `npm run build` clean; golden-session suite (12/12) still
passes. Not exercised via an actual network-kill against a running kiosk this
session — same caveat as Task 1.2.

## Task 1.5 — Bill screen is a one-way door — DONE

**Files:** `apps/kiosk/src/components/screens/BillView.tsx`,
`apps/kiosk/src/components/AppShell.tsx:13`,
`apps/kiosk/src/components/screens/WaitingView.tsx:204`

Once `stage === 'sent'`, BillView renders a message with zero buttons, and
`bill-summary` is in `HEADERLESS_SCREENS` so there's no header either. Combined
with 1.3, a cash payment closed via End Service leaves the tablet bricked on
"Bill coming your way." Separately, "Order More" is not gated on `billRequested`,
so after a reload the customer can reach the menu, add items, and hit a raw
`alert()` from `0048:79-81` ("ordering is closed") with their cart stranded.

- [x] Added "Back to my order" button to the `sent` stage (`onBackToStatus` prop).
- [x] Disabled "Order More" in `WaitingView` when `billRequested`, with a
      `title` tooltip explaining why.
- [x] Replaced the `alert()` — `confirmOrder` now rethrows instead of
      alert()ing, and both call sites (`handleConfirmOrder`,
      `handleCompletionSkip` in `Index.tsx`) catch and show the existing toast.
      Cart was already preserved on failure before this fix; only the
      notification mechanism changed (blocking dialog → dismissible toast).

**Verify:** ✅ `npm run build` clean. Code review confirms no `alert()` calls
remain in `apps/kiosk/src`. Not exercised in a live browser this session — no
running kiosk instance; recommend a manual pass (request bill, then try Order
More; force a submit failure and confirm the toast + retry path) before pilot.

## Phase 1 status — DONE, verified

All five tasks complete. Build clean on all three apps, golden-session suite
12/12, plus manual SQL verification against local Postgres for the new
`service_ended` path (details in `CHANGELOG.md`). Two bugs were found and
fixed *during* verification of Task 1.3, consuming migration numbers `0053`
and `0054` that this plan had reserved for Phase 4 — see "Found while
verifying 1.3" in `CHANGELOG.md` for the full story. Phase 4's migrations are
renumbered `0055`/`0056` below.

One item flagged but out of scope for this phase: `order_history` has no
`restaurant_id` column, so half of Task 1.1/2.2's scoping ask on that table
couldn't be done. Needs its own migration + ADR, not silently expanded into
this phase.

Live-hardware verification not done this session (no running kiosk/POS
instance): Kitchen reconnect (1.2), kiosk missed-poke recovery (1.4), and the
toast/disabled-button UX (1.5) are verified by code review + build, not by
triggering an actual network drop in a browser. Recommend a manual pass before
the pilot goes live.

---

# Phase 2 — Data correctness (staff act, system silently ignores them)

## Task 2.1 — POS-created menu items must be visible (H3) — DONE

**Files:** `apps/pos/src/pages/Menu.tsx:90`, `apps/pos/src/pages/AdminMenuItems.tsx:154`

Both insert `menu_items` without `restaurant_id`. That column has no DB default
(0033 only covered `restaurant_tables`), so new items land NULL and the kiosk's
`.eq('restaurant_id', …)` filters them out. Staff add a dish, it works in POS,
and it is absent from every tablet.

- [x] Added `restaurant_id: RESTAURANT_ID` to both inserts.
- [x] No DB default added.

**Verify:** ✅ `npm run build` clean. Manually verified the exact insert shape
against local Postgres: row lands with `restaurant_id` set, and the kiosk's
scoped read (`WHERE restaurant_id = … AND name = …`) finds it. Not clicked
through the actual POS UI (no running instance this session).

## Task 2.2 — Scope every POS query to the restaurant — DONE

**Files:** `Kitchen.tsx:71-75`, `Orders.tsx:50-53`, `Reports.tsx` (both queries),
`Billing.tsx:211-214`, `Menu.tsx:59-62`, `AdminMenuItems.tsx:69-72`

Nothing in the POS is tenant-scoped. `docs/notes/restaurant-id-query-audit.md`
covered the kiosk only. Invisible at one restaurant; at two, the kitchen sees the
other café's tickets.

- [x] Scoped all listed queries.
- [x] Scoped Realtime where possible. `Kitchen.tsx`'s INSERT listener already
      filters on `status=eq.accepted`; Postgres Changes supports only one
      filter clause per subscription, so `restaurant_id` is checked
      client-side in that callback instead. `Orders.tsx` and `Billing.tsx`'s
      channels had no competing filter, so `restaurant_id=eq.…` was added directly.
- [x] Updated `docs/notes/restaurant-id-query-audit.md` with a POS section.
- Found: `order_history` has no `restaurant_id` column at all — can't scope
  `Reports.tsx`'s two `order_history` queries or the settled-orders half of
  Task 2.4. Documented as a schema gap, not silently expanded into a migration
  this phase.

**Verify:** ✅ `npm run build` clean. Not tested with an actual seeded second
restaurant (single-tenant pilot DB) — verified by code review that every
listed query now carries the filter, and directly confirmed via psql that
`menu_items` rows without a matching `restaurant_id` are excluded by the
kiosk's read pattern (see Task 2.1's verification).

## Task 2.3 — Item notes and variants must reach the kitchen — DONE

**Files:** `supabase/migrations/0052_*.sql`, `apps/pos/src/pages/Billing.tsx:354-388`

`handleSendToKitchen` maps to `{id,name,qty,price,modifiers:[]}` — variants
dropped. `specialNotes` is assembled at line 374 but only ever set into local
`lastKot` state; `0048:170-173` doesn't write a `special_notes` column at all.
`Kitchen.tsx:241-245` renders `ticket.special_notes`, which is therefore always
null. A server enters "no sugar, large", sees it on their KOT preview, and the
kitchen screen shows neither.

- [x] Migration `0052` writes `special_notes` on the KOT insert (see Phase 1's
      "Found while verifying" note for the archive-ordering bugs this then
      surfaced and how they were fixed in `0053`/`0054`).
- [x] `Billing.tsx`'s `handleSendToKitchen` now sends real
      `modifiers` (variant + addon names) and `special_notes` in the payload.
- [x] `Kitchen.tsx` renders `item.modifiers` under each line.

**Verify:** ✅ Directly verified against local Postgres in Phase 1 (identical
code path): `order_submitted` with `modifiers: ['extra shot']` and
`special_notes: 'no sugar, large'` → both landed on the `kot_tickets` row and
survived a subsequent settle as `archived`. Not clicked through the actual POS
UI to a rendered Kitchen card (no running instance this session) — the
render change itself is a 3-line conditional, verified by `tsc`/code review.

## Task 2.4 — Orders page must not lose settled orders — DONE

**File:** `apps/pos/src/pages/Orders.tsx`

`payment_settled` deletes the live `orders` row (`0049:224`) after archiving.
Orders reads only `orders`, so once a table pays, staff cannot look up what it
ordered.

- [x] Unioned in `order_history` (`original_order_id` → `id`), Settled badge
      (with payment method) per row; status Select hidden for settled rows
      since there's no live `orders` row left to update.

**Verify:** ✅ `npm run build` clean. Not tested with a settle-then-look-up
click-through (no running instance) — logic verified by code review: the
`order_history` fetch and merge mirror the shape already proven correct by
Phase 1's `payment_settled` smoke test (same table, same archived row).

## Task 2.5 — Voice menu refresh (H4) — DONE

**Files:** `services/order-engine/backend/main.py:196`, `apps/pos/src/pages/Menu.tsx:24-27`

Two independent breaks. `Request` is never imported (line 15 imports only
`FastAPI`), and `from __future__ import annotations` (line 7) makes FastAPI
resolve the annotation lazily → it becomes a required query param → 422 on every
call. Even fixed, the POS sends no `X-Admin-Key`, so `line 210` returns 403 — and
`.catch(() => {})` swallows it.

> This is outside the frozen voice path (`/voice` router and `voice_agent/` are
> untouched). Two lines in `main.py` plus a header in the POS fetch.

- [x] Imported `Request`/`HTTPException` from `fastapi` at module level.
- [x] `refreshVoiceMenu` sends `X-Admin-Key` from `VITE_VOICE_ADMIN_KEY`
      (added to `.env.example`, along with `VITE_VOICE_ENGINE_URL` which
      wasn't documented there either).
- [x] Replaced `.catch(() => {})` with a destructive toast on both non-2xx and
      unreachable.
- [x] Refresh now also updates `_menu_graphs`, using the same atomic
      `asyncio.gather` + no-await-between-assignments pattern as the existing
      `_refresh_loop` (copied, not reinvented).

**Verify:** ✅ The actual bug — confirmed directly via FastAPI's own dependency
introspection: `route.dependant.request_param_name` was `None` and
`query_params` included `'request'` before the fix; after, `request_param_name
== 'request'` and `query_params == []`. Full order-engine test suite (169
tests) still passes, no regressions. Not exercised with a live `curl` against
a running instance + real DB (no running order-engine this session) — the
specific bug this task targets (parameter resolution) is what the
introspection check verifies directly, which is a stronger check than an
end-to-end curl would give for *this particular* defect.

## Phase 2 status — DONE, verified

All five tasks complete. Build clean on all three apps, golden-session suite
12/12, order-engine's own 169-test suite unaffected, plus targeted
verification per task above (DB-level for the schema/RPC-touching tasks,
introspection for the FastAPI routing bug, code review for pure rendering
changes).

Two gaps surfaced and documented rather than silently expanded into this
phase's scope: `order_history` has no `restaurant_id` column (blocks full
scoping of `Reports.tsx` and the `Orders.tsx` settled-orders union — flagged
in `docs/notes/restaurant-id-query-audit.md`), and `bill_requests` /
`table_requests` were never checked for a `restaurant_id` column at all
(outside Task 2.2's file list).

No live click-through this session for any Phase 2 task — no running
kiosk/POS/order-engine instance. Everything that touches server-side state
(schema, RPC, FastAPI routing) was verified directly against local
Postgres/Python; everything that's pure client rendering (Kitchen ticket
modifiers, Orders Settled badge) was verified by build + code review only.
Recommend a manual click-through pass before the pilot goes live, same as
flagged at the end of Phase 1.

---

# Phase 3 — Measurement (the pilot's gating milestone)

## Task 3.1 — AOV failures must not render as zero — DONE

**File:** `apps/dashboard/src/pages/AovView.tsx:48-53`

Destructures only `{ data: rows }` and discards `error`. On any failure the card
renders *"No recommendations accepted in this date range yet."* This is the
headline pilot number, on the screen shown to the owner, and a broken query is
indistinguishable from an honest zero.

- [x] Captured `error`; both cards render a distinct error state (message +
      Retry button) instead of falling through to the zero-state copy.
- [x] "0 accepted" and "could not load" are now visually and textually distinct.

**Verify:** ✅ `npm run build` clean (dashboard). Not exercised against a live
bad-param RPC call in a browser (no running instance this session) — the
logic itself (`if (rpcError) { setError(...); setData(null); }` vs. the
old code that discarded `error` entirely) is a direct, reviewable fix to the
exact defect described.

## Task 3.2 — Close the hero-dish attribution hole — DONE

**File:** `apps/kiosk/src/pages/Index.tsx:339`

`append_event` writes `span_id = NULL` for analytics fired while idle
(`0047:12`, `0047:99-104`). A span opens on `session_started` or implicitly on
`order_submitted` (`0048:85-86`). But the HomeView hero-dish tap jumps straight
to `item-detail` **without** calling `startSession()`. Every `item_added` on that
path — including `pairing_chip` and `completion_nudge` — lands with
`span_id = NULL`, and `get_aov_summary`'s `rec_adds` joins on `span_id`
(`0050:38`), which NULL never matches. Their entire recommendation revenue is
invisible while their order still counts toward `total_revenue`. ADR 0019 fixed
C1's submit failure; it did not fix C1's measurement half.

- [x] `onSelectItem` now awaits `startSession()` before navigating.
- [x] Quantification query written and ready, but **not run against real
      data** — this session only has local Docker Supabase (no pilot
      traffic), and remote pushes are Rohan's to do. Recorded in
      `docs/notes/2026-08-02-hero-dish-attribution-gap.md` with the exact
      query and an explicit "run this against remote before an owner
      conversation" instruction.

**Verify:** ✅ Directly verified against local Postgres: `session_started` →
`item_added` with `source: 'pairing_chip'` → confirmed `span_id IS NOT NULL`
on that event (previously would have been NULL) → `order_submitted` →
confirmed the item appears in `get_aov_summary`'s `accepted_count`. Full
transcript in CHANGELOG.md. Not tested via an actual hero-dish tap in a
browser (no running instance) — the RPC-level behavior is what determines
correctness here, and that's what was verified.

## Task 3.3 — Detail-view pairings: count them or stop calling them pairings (M6) — DONE

**Files:** `apps/kiosk/src/pages/Index.tsx:168-182`, `:434`

Two separate problems. Adds carry source `"detail_view"`, which `0050:41` does
not count. And `getDetailPairings` fabricates a pairing when none is curated —
falling back through signature anchor → chef's pick → any coffee/tea item →
**any menu item at all** — rendered under "Pairs well with" as if curated.

- [x] Deleted the fabrication fallback — `getDetailPairings` now returns
      `pairingsByItemId[item.id] ?? []` and nothing else. No curated pairing =
      no panel.
- [x] Source string: emitted `pairing_chip` from the detail panel's add
      handler (the recommended option — no migration, consistent with the
      grid card's `DishCard.tsx`).
- [x] `recommendation_shown`/`recommendation_tapped` now fire from
      `DetailView.tsx`, mirroring `DishCard.tsx`'s exact pattern (dedup ref,
      `surface: 'inline_pairing'`) rather than inventing a new one.

**Found, not fixed:** the pairing *stepper* (increment/decrement when the
paired item is already in cart) goes through a single shared
`onUpdateQuantity` prop with no per-call source, so a stepper bump on a
pairing item still attributes as `main_menu`, not `pairing_chip`. Only the
initial add (the case this task named) was in scope; fixing the stepper needs
a new prop on `DetailView` to distinguish which item's stepper fired — small,
but expanding this task's surface, so left as a follow-up rather than done
silently.

**Verify:** ✅ `npm run build` clean (kiosk). Not exercised via an actual
tap-through in a browser (no running instance) — verified by code review:
`getDetailPairings` has no fallback path left to trigger, and the
shown/tapped tracking is a direct copy of `DishCard.tsx`'s already-working
pattern (not a new, unverified mechanism).

## Task 3.4 — Idempotency key per intent, not per attempt — DONE

**File:** `apps/kiosk/src/lib/orderSubmission.ts:112`

`eventId` is generated fresh on every `submitOrder` call. The comment claims "a
retry of THIS submission reuses the id", but no retry logic exists, so a second
Confirm tap after a timeout mints a *new* key. If the RPC committed and only the
response was lost, the kitchen receives the round twice. `isSubmitting` guards
double-taps, not network retries — which is exactly what the key was built for.

- [x] `event_id` now keyed on cart contents (module-level variable in
      `orderSubmission.ts`, same pattern as the file's existing
      `cachedTableId` — `submitOrder` isn't a hook, so this is the non-React
      equivalent of "a ref"). Reused across retries of the same cart; cleared
      on success.
- [x] Added `apps/kiosk/src/lib/__tests__/orderSubmission.test.ts` (not
      `ledger.test.ts` — that file mocks `orderSubmission.ts` wholesale to
      test `ledger.ts` in isolation, so `submitOrder`'s own logic needed its
      own file; mocks `appendEvent` at the boundary instead). Two cases: same
      cart retried after a failure reuses `event_id`; a changed cart mints a
      new one.

**Verify:** ✅ Both new test cases pass (`npm test`, 4/4 total including
pre-existing). Also confirmed the whole kiosk unit suite (not just golden)
still passes after this change.

## Phase 3 status — DONE, verified

All four tasks complete. Build clean on all three apps, golden-session suite
12/12, kiosk unit suite 4/4 (2 new tests added for Task 3.4), plus manual
Postgres verification for Task 3.2's actual mechanism (span attribution).

Task 3.2's historical-quantification ask could not be completed this
session — it requires production data this session has no access to. The
query is written and documented in
`docs/notes/2026-08-02-hero-dish-attribution-gap.md`; running it against
remote after this migration ships there is a follow-up for Rohan, not
something to skip before the pilot/owner conversation.

Task 3.3 surfaced one adjacent gap (pairing-stepper attribution) that was
judged out of this task's named scope and left as a follow-up rather than
silently expanded — see the task's notes above.

No live click-through this session (no running kiosk/POS/dashboard instance) —
same caveat as Phases 1–2. The measurement-correctness claims in this phase
rest on direct Postgres/RPC verification, which is the layer where the actual
defects lived (attribution join logic, idempotency key reuse), not on UI
interaction — recommend a manual pass before the pilot goes live regardless.

---

# Phase 4 — Papercuts — DONE

- [x] **4.1 Completion-nudge loop (H5).** Added a check to `findMatchingRule`:
      skip any rule whose suggested `item_id` is already in the cart. Verified
      by `npm run build`; not covered by a new unit test (the plan didn't ask
      for one here, unlike 3.4).
- [x] **4.2 Bill total vs. its own lines (M1).** `sessionTotal` in
      `useDeviceNavigation.ts` now sums only `previousOrders` — dropped
      `+ totalBill` (the unsent cart). `sessionTotal` had exactly one
      consumer (`BillView`), confirmed by grep before changing it.
- [x] **4.3 Water toast lies (M2).** `onRequestWater` now checks the insert's
      `error` and shows a distinct failure toast instead of always claiming
      success.
- [x] **4.4 Order never reaches "served" (M3).** Migration `0055`:
      `sync_order_status_from_kot` now sets `orders.status = 'served'` when
      the last active KOT for an order is archived (previously the trigger
      explicitly skipped archived transitions, assuming archiving only
      happened post-payment — but Kitchen.tsx's "Complete & Archive" button
      archives a `ready` ticket *during* service). The `order_submitted`
      round-2+ merge branch of `append_event` now also resets
      `status = 'new'`, so a fresh round doesn't inherit round 1's stale
      'ready'/'served' progress.
- [x] **4.5 Promo carousel.** No real Silver marketing assets exist to swap
      in, so replacing fake fashion/travel/audio content with equally-fake
      "coffee shop" stock content would repeat the same mistake. Instead:
      reused the existing `categoryGradient()` palette (already used for dish
      image fallbacks) for the slide backgrounds — zero network dependency,
      fixing the "broken without internet" half unconditionally — and
      rewrote the copy to be genuinely about the ordering experience itself
      ("Order More any time", "flag allergies at the bill") rather than
      fabricated products. Kept the exact same DOM/CSS structure so no
      `tabletot.css` edits were needed.
- [x] **4.6 Dashboard silent empties.** `movePriority` now checks both update
      results and toasts on failure. Both `fetchMenuItems` helpers
      (`ItemPairings.tsx`, `AnchorItems.tsx`) and `CompletionRules.tsx`'s
      `fetchRules` now capture `error` and toast (the latter needed a new
      `sonner` import — this file had none).
- [x] **4.7 Destructive one-click deletes.** Added a `confirm()` prompt to
      `ItemPairings.tsx`'s `deletePairing` and `AnchorItems.tsx`'s
      `deleteAnchor`, matching POS's existing pattern.
- [x] **4.8 Phone validation (L6).** `BillView.tsx`'s `canSubmitPhone` now
      strips an optional country code (91/+91) and checks the remaining 10
      digits against `/^[6-9]\d{9}$/`. Only the validation rule changed —
      what gets stored in `bill_requests.phone` is unchanged (out of scope).
- [x] **4.9 Delete dead code.** Deleted `POSLayout.tsx` and
      `SettleBillModal.tsx` after confirming zero importers via grep.
- [x] **4.10 Revoke anon direct writes.** Migration `0056` drops
      `anon_update` on `orders`/`sessions`. Verified before writing it: no
      direct `.from('orders'|'sessions').update()` calls anywhere in the
      kiosk (the only anon-role caller), and both tables carry a separate
      `staff_write` policy (`FOR ALL TO authenticated`) that POS's two
      remaining direct writes already go through — unaffected.

**Found while verifying 4.10:** the golden-session harness's "pre-ledger
baseline" test called `submit_order` (migrations 0044/0045) — a
`SECURITY INVOKER` function superseded by `append_event` since the ledger
refactor (ADR 0019), with zero live callers anywhere in app code (confirmed
by repo-wide grep). Its internal `SELECT ... FOR UPDATE` on `sessions`
depended on the anon role having row-lock permission, which Postgres RLS
derives from the UPDATE policy — exactly the grant this task revokes. Fixing
this the "safe" way (keeping `anon_update` alive) would have defeated the
entire point of the task. Removed the dead test and its dependency instead;
full reasoning in the test file and in CHANGELOG.md.

---

# Migrations created by this plan

| # | File | Contents | Phase |
|---|------|----------|-------|
| 0052 | `0052_service_ended_and_kot_notes.sql` | `service_ended` event + `special_notes`/`modifiers` on KOT insert | 1.3, 2.3 |
| 0053 | `0053_kot_tickets_preserve_on_order_delete.sql` | **Unplanned.** `kot_tickets.order_id` FK CASCADE→SET NULL — CASCADE was hard-deleting archived KOT rows on settle | found verifying 1.3 |
| 0054 | `0054_fix_kot_archive_order.sql` | **Unplanned.** Reorder archive-before-delete in `payment_settled`/`service_ended` — 0052's archive UPDATE ran after the delete had already nulled `order_id` | found verifying 1.3 |
| 0055 | `0055_order_status_served.sql` | KOT-archived → order `served`; reset status on round merge | 4.4 |
| 0056 | `0056_revoke_anon_direct_writes.sql` | Drop `0032` anon UPDATE policies on `orders`/`sessions` | 4.10 |

# Verification gate (run before declaring any phase done)

```
cd apps/kiosk && npm run build            # tsc --noEmit + vite build
cd apps/pos && npm run build
cd apps/dashboard && npm run build
cd apps/kiosk && SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_PUBLISHABLE_KEY=… npm run test:golden
```

The golden-session harness (12 tests, local Supabase) covers seat → browse →
nudge accept → submit → round 2 → KOT → bill → settle → AOV assertion. Extend it
with the Phase 1 cases (service_ended, reconnect refetch) rather than adding a
new suite.

# Docs to update on completion

- **ADR** for the `service_ended` event — it extends the ADR 0019 state machine,
  which that ADR explicitly called "a single, reviewed chokepoint."
- **ADR or note** for the Task 3.3 attribution decision (detail-view source
  string), since it changes what ADR 0018's rule counts.
- `docs/overview.md` — drop the "known remaining direct-write path" line once
  Task 4.9 lands.
- `docs/notes/restaurant-id-query-audit.md` — extend to the POS (Task 2.2).
- New note recording the Task 3.2 orphaned-span ratio, so pre-fix AOV numbers
  can be caveated honestly in the owner conversation.
