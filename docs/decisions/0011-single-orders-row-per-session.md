---
id: "0011"
title: "One orders row per kiosk session; one kot_tickets row per round"
date: 2026-05-25
status: accepted
tags: [kiosk, db, billing]
---

# 0011 — One orders row per kiosk session; one kot_tickets row per round

## Context

A customer at the kiosk can order multiple times during one visit: they send a first round to the kitchen, wait, then add more items. Before this decision, each "Send to Kitchen" call INSERTed a new `orders` row. All rows shared the same `session_id` text value.

This created two problems:
1. **Billing required client-side accumulation.** The `BillView` computed the total by summing `previousOrders` React state. If the browser refreshed mid-session, the history was gone.
2. **POS Billing couldn't see all rounds.** `restaurant_tables.current_order_id` pointed to one row; the POS order panel showed only that round's items.

## Decision

The kiosk's `submitOrder` function now maintains one `orders` row per session:
- **First round:** INSERT a new `orders` row. Store its UUID as `tt_order_id` in `sessionStorage`.
- **Subsequent rounds:** UPDATE the existing row — append new items to `items_json`, recalculate `subtotal` and `total` using `computeTotals()` for consistency.
- **Every round:** always INSERT a new `kot_tickets` row containing only that round's items. The kitchen sees each batch separately, as intended.

`orders.total` is consistently stored including GST (via `computeTotals`) on every write.

## Alternatives considered

- **Keep multiple orders rows, aggregate at billing** — requires a `GROUP BY session_id` query in POS Billing, `BillView`, and everywhere else that needs a "session total". The natural data shape for a bill is one row, not an aggregation.
- **Separate "session bill" aggregate table** — introduces a third concept (session → bill) on top of session and order. Adds write amplification and sync risk. The `orders` row already has the right shape.
- **Aggregate on payment** — accumulate at `PaymentModal` time by querying all orders for the session. Works but means the POS order panel always shows a partial picture during the session, not the running total.

## Consequences

- The POS Billing order panel always shows the full session's items, including items added in round 2, 3, etc., because they're all in `orders.items_json`.
- `order_history.total` (archived at payment) is the correct session total, not a partial round total.
- The `tt_order_id` in `sessionStorage` means a page refresh within the same tab correctly resumes appending to the existing row. A hard tab close loses `tt_order_id`; a new order row is created for subsequent rounds. This is acceptable for the pilot.
- `kot_tickets` rows remain per-round, preserving kitchen routing behaviour — each ticket covers exactly what the customer added in that press of "Send to Kitchen".
- The voice engine's `client_session_id` (the kiosk `tt_session_id`) links `voice_turns` to the session even though voice turns don't reference the `orders` row directly.
