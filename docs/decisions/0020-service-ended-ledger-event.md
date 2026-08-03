---
status: accepted
date: 2026-08-02
tags: [architecture, sessions, ledger, pos]
---

# 0020 — `service_ended` extends the table_events state machine for non-payment table resets

## Context

ADR 0019 made `append_event()` the single writer for table/session lifecycle,
with `payment_settled` as the only path that frees a table and resets
`table_state`. Two POS surfaces — `Billing.tsx`'s "End Service" button (a
staff-initiated reset for walkouts or corrections) and
`handleCleanupStaleSessions` (a bulk sweep for abandoned kiosk sessions) —
predated that migration and never got moved onto it. They kept writing
directly to `sessions.status = 'closed'`, a projection table.

That write alone did nothing useful after ADR 0019: migration 0049 retired
the trigger that used to free the table on any session close (deliberately —
that trigger was the mechanism behind audit finding C3, a brand-new customer's
session getting wiped by a stale one closing). With the trigger gone and
`payment_settled` the only path that re-implements its cleanup, "End Service"
closed a row nobody was reading for that purpose: `restaurant_tables` stayed
`occupied`, `table_state` stayed `ordering`, and the kiosk never reset —
despite the button's own confirm dialog claiming "This resets the kiosk."

This surfaced as part of a broader three-app audit
(`docs/plans/2026-08-02-three-app-hardening.md`, Task 1.3), not as an
isolated bug report.

## Decision

Add `service_ended` to `append_event`'s event vocabulary and the
`table_events` CHECK constraint (migration 0052). It runs the same
table-freeing cleanup as `payment_settled` — archive the live order to
`order_history` if one exists, close the session, free the table, reset
`table_state` — but with two differences that make it a distinct event
rather than a `payment_settled` variant:

- **No `payments` row, no `amount_paid`.** Nothing was collected; recording a
  payment would misrepresent revenue.
- **Archived with `payment_method = NULL`, `amount_paid = 0`.** The order stays
  visible in `order_history` for reconciliation ("what did this abandoned
  table have on it?") without being counted as revenue by anything that reads
  `payments` or filters on a non-null `payment_method`.

Both POS call sites (`handleEndService`, `handleCleanupStaleSessions`) were
rewritten to call `append_event('service_ended', …)` instead of writing
`sessions` directly.

## Alternatives considered

- **Reuse `payment_settled` with `amount_paid: 0`.** Rejected — a zero-amount
  payment is still a payment record; anything that later sums `payments` or
  counts settled orders as "sales" would silently include walkouts. A
  distinct event type keeps that distinction structural instead of relying on
  every future consumer to remember to filter zero-amount payments.
- **Keep it as a plain client-side `sessions` update, just fix the missing
  table-free step by adding a new client-side write to `restaurant_tables`
  and `table_state` alongside it.** Rejected — this is exactly the
  distributed-state pattern ADR 0019 eliminated. Re-introducing a second
  direct writer for table/session state the moment a new case shows up
  defeats the point of the single-writer invariant.
- **Delete "End Service" and require every table to go through Payment.**
  Considered. Rejected: a walkout or a kiosk left mid-order with no
  resolution is a real operational case a restaurant floor needs a button
  for; forcing it through the payment flow would mean either fabricating a
  ₹0 payment (the first rejected alternative) or leaving no staff-facing
  reset at all.

## Consequences

- **Load-bearing:** `service_ended` is now part of the reviewed state machine
  ADR 0019 designated as the single chokepoint for lifecycle changes — any
  future non-payment reset case should extend this event or add a sibling to
  it, not write `sessions`/`restaurant_tables`/`table_state` directly.
- **Easier:** "End Service" and stale-session cleanup now actually do what
  their UI claims. A table walked out on converges to `idle` the same way a
  paid table does.
- **Revenue reporting stays honest by construction:** anything that computes
  revenue from `payments` (not `order_history`) is automatically unaffected
  by walkouts, with no filter to remember.
- **Revisit if:** a future case needs partial cleanup (e.g., free the table
  but keep the session open for a transferred party) — today `service_ended`
  is all-or-nothing, matching `payment_settled`'s shape.
