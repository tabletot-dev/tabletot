# Idle-Table Notification Plan — kiosk nudge + POS badge, staff decides

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A table that opened a session (browsed) and never submitted an order
currently stays marked `occupied` forever with zero signal to staff. Give the
customer a soft on-screen nudge, and give staff a passive notification on the
table they're already looking at — no automatic session-ending, no new
"resolve" workflow. Staff act (or don't) using the existing End Service button,
already fixed to work correctly in `docs/plans/2026-08-02-three-app-hardening.md`.

**Source:** Read-only audit conducted 2026-08-02/03, confirmed against the
live code on branch `pilot-hardening`. Decision made: **notify only, staff
decides** — no kiosk auto-reset.

## Scope decision, stated up front

"POS should get notified in the dashboard" is ambiguous between the POS
app's own table grid (`apps/pos`) and the separate curation app
(`apps/dashboard`). This plan targets **the POS table grid** — the screen
staff are actually watching on the floor — and does not touch
`apps/dashboard`, which ADR 0008 scopes to curation only (anchor items,
pairings, completion rules, AOV), not operational table status. Flag if you
meant the other app; this plan proceeds on the POS reading.

## Zero migrations needed

Both signals this plan needs already exist as columns/rows: `table_state`
(state, order_id) is already read by both apps, and `table_events` already
timestamps every action. This is a client-side-only plan for both apps — no
schema change, no new RPC.

## Design

**What counts as "idle-abandoned"?** `table_state.state = 'ordering'` (a
span is open) AND `table_state.order_id IS NULL` (no round has ever reached
the kitchen this span) AND enough time has passed since the last real
activity on that span.

**What counts as "last activity"?** Not `table_state.updated_at` —that column
only changes on state-machine *transitions* (session_started,
order_submitted, bill_requested, settle), not on ordinary browsing. A
customer who's actively scrolling the menu for 15 minutes without adding
anything wouldn't touch `table_state`, so using it as the clock would flag a
genuinely engaged customer as abandoned. Instead: `MAX(table_events.created_at)`
for the table's current `span_id` — this captures every analytics event too
(`item_added`, `item_removed`, `recommendation_shown/tapped`), so an active
browser who taps around without confirming stays "active" even with an empty
cart. Same pattern `handleCleanupStaleSessions` already uses (last-activity
via `MAX(orders.created_at)`, falling back to `started_at`) — this generalizes
it to the full event stream instead of just orders, which is what makes it
usable *before* an order exists.

**Known ceiling, stated honestly:** pure scrolling/reading with zero taps
(no dish opened, no pairing panel shown) produces no `table_events` rows at
all after `session_started` — such a customer is indistinguishable from an
absent one by this signal. Acceptable for a notify-only badge with a
generous threshold (staff glance and dismiss with their eyes if the customer
is visibly still there); would need a periodic heartbeat event to close
fully, which is more machinery than a pilot-stage passive notification
warrants. Upgrade path noted, not built.

**Two independent thresholds, not one:**
- Kiosk nudge: short (proposed 3–4 min), pure UX, no DB read — a client-side
  inactivity timer on touch events.
- POS badge: longer (proposed 10–15 min), the actual operational signal.

They don't coordinate. The kiosk doesn't know or care whether POS has
flagged the table; POS doesn't know whether the kiosk showed a nudge. Numbers
above are starting points — tune with Rohan before shipping, this is exactly
the kind of threshold that should come from watching real service, not a
guess.

---

## Task 1 — Kiosk: "Still there?" nudge — DONE

**Files:** `apps/kiosk/src/pages/Index.tsx`

- [x] Added `lastTouchRef` (timestamp) updated by a document-level
      `pointerdown` listener, mounted once.
- [x] Added a `setInterval` (30s) that shows a dismissible banner when:
      `currentScreen` is one of the pre-submit browsing screens (`home`,
      `menu`, `item-detail`, `order-summary`, `identity` — **not**
      `session-idle`, `games`, `conversation-starters`) AND no round has
      been submitted this visit (`previousOrders.length === 0`) AND time
      since `lastTouchRef` exceeds 3.5 min.
- [x] Banner: "Still there? Tap anywhere to continue." Any `pointerdown`
      dismisses it (same listener that resets the timer). No auto-navigation,
      no session-ending call — pure client-side UI, nothing written to the
      ledger.
- [x] Timer resets on screen change too.

**Verify:** Sit on the menu screen without touching anything past the
threshold; banner appears. Tap anywhere; banner clears and timer resets.
Confirm it does *not* appear on `session-idle`/`games`/`conversation-starters`.

## Task 2 — POS: idle-table badge — DONE

**Files:** `apps/pos/src/pages/Billing.tsx`, new
`apps/pos/src/lib/timeSince.ts`, new migration `0057` (see deviation note
below — the plan's "zero migrations" premise was wrong)

- [x] Extracted `Kitchen.tsx`'s inline `getTimeSince` into
      `apps/pos/src/lib/timeSince.ts` (two call sites: `Kitchen.tsx`'s KOT
      age, `Billing.tsx`'s idle-badge tooltip). `Kitchen.tsx` imports it —
      behavior unchanged.
- [x] Added a 60s interval (`fetchIdleSignals`) that pulls, for tables where
      `restaurant_tables.status = 'occupied'`: `table_state.order_id`/`span_id`
      in one batched query, then `table_events` last-activity only for the
      spans still missing an order, in a second batched query (not per-table).
- [x] Computed `isIdleAbandoned` per table client-side: `order_id IS NULL`
      AND `now - lastActivity > 12 min`.
- [x] Rendered an amber clock badge, same absolute-positioned slot as the
      bill/water badges, lowest priority of the three.
- [x] No new "acknowledge" state — badge is purely derived from live data.
- **Found while implementing:** the plan's "zero migrations needed" premise
      assumed `table_events` was already client-readable like `table_state`.
      Verified against local Postgres — false: RLS enabled, zero SELECT
      policies, so the query above would have silently returned nothing.
      Added migration `0057_table_events_staff_read.sql` (staff-only SELECT
      policy, same pattern as `0022`/`0047`). Full reasoning in
      `docs/notes/2026-08-03-idle-table-notification-implementation.md`.

**Verify:** Open a session on the kiosk, don't submit, wait past the
threshold (or lower it temporarily for testing). Badge appears on that
table's card in POS. Submit an order from the kiosk — badge clears
immediately on next refresh. Separately: open a session, submit an order —
badge never appears regardless of elapsed time (order_id is no longer NULL).

## Task 3 — Docs — DONE

- [x] Added `docs/notes/2026-08-03-idle-table-notification-implementation.md`
      recording the chosen thresholds, the "notify only, staff decides"
      call, and the migration-0057 deviation.
- [x] No ADR — confirmed migration `0057` is read-only and doesn't touch the
      ledger's write path or state machine (ADR 0019's chokepoint).

---

## Explicitly out of scope

- **`apps/dashboard`** — see scope decision above.
- **Auto-ending the session from the kiosk or from POS.** Staff decide,
  every time, via the existing End Service button.
- **A heartbeat event to close the "pure scrolling" blind spot** — noted as
  a known ceiling, not built. Revisit if idle-abandoned false-negatives (or
  false-positives from genuinely-idle-but-not-flagged tables) turn out to
  matter in practice.
- **Threshold configurability per restaurant** — hardcoded constants for the
  pilot (single restaurant). Revisit alongside the rest of the multi-tenancy
  work (ADR 0013) if this becomes a per-restaurant tuning need.

## Verification gate

```
cd apps/kiosk && npm run build
cd apps/pos && npm run build
```

No golden-session changes expected — this plan doesn't touch `append_event`
or any ledger state transition, so the existing suite is an unaffected
regression check, not something this feature needs to extend.
