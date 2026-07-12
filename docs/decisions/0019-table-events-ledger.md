---
status: accepted
date: 2026-07-12
supersedes: 0010, 0014, 0017
tags: [architecture, sessions, ledger, aov, kiosk, pos]
---

# 0019 — Table state lives in an append-only event ledger with a single server-side writer

## Context

Hardware testing on the Lenovo Tab surfaced a cluster of bugs (audit
`docs/notes/2026-07-11-codebase-bug-audit.md`) that all shared one root cause:
session state was distributed across three uncoordinated places —
`sessionStorage` on the kiosk (`tt_session_id`, `tt_order_id`), Supabase
Realtime subscriptions, and DB triggers.

Concrete failures that root cause produced:

- **C1** — a customer who tapped a hero dish and went straight to the menu,
  skipping "Start Ordering", had no session and could not submit.
- **C2** — round 2 trusted a client-held order id; a stale or missing key gave
  "Order not found".
- **C3** — the 0019-era trigger freed the table on *any* session close, which
  could flip a table to `available` under a brand-new customer, and the kiosk's
  settle overlay fired on someone else's span.
- **H1** — AOV read `kiosk_events` and counted each `order_submitted` event, so a
  multi-round session or a retried submit multiplied `accepted_count` and
  revenue.
- **H5** — double-tap / retry could submit the same round to the kitchen twice.
- **M4** — POS "Add Items" wrote a `{quantity,total}` shape and a tax-free
  `total = subtotal`, diverging from the kiosk's canonical line shape.
- **M5** — a reloaded or power-cycled kiosk lost all on-screen order history
  because it trusted `sessionStorage`.

The pilot's next milestone is *trustworthy AOV*. None of the above can be
patched independently without the distributed state re-introducing the next
variant of the same bug.

## Decision

All order/session lifecycle state is derived from a single append-only ledger,
`table_events`, written **only** by one `append_event()` Postgres RPC
(`SECURITY DEFINER`). The physical table is the root identity; a "span"
(= a customer visit, what we used to call a session) is opened by the first
event and closed only by `payment_settled`.

- **One writer.** `append_event(event_id, restaurant_id, table_id, event_type,
  payload)` is the sole path that mutates lifecycle state. It maintains the
  existing `sessions`, `orders`, `kot_tickets`, and `restaurant_tables` tables
  internally as *projections*, so POS/dashboard reads keep working unchanged.
- **Idempotency by client `event_id`.** A replayed `event_id` returns the stored
  result without re-executing — retries and double-taps can't double-submit
  (H5) or double-count (H1).
- **Server-held round identity.** The live order id lives in `table_state`, never
  in the client, so round 2+ always merges into the right order (C2), and a
  submit from `idle` implicitly opens a span (C1).
- **Table freeing owned by settle.** `payment_settled` archives to
  `order_history`, records the payment, frees the table, and resets
  `table_state`. The 0019 trigger `free_table_on_session_close` is retired (C3).
- **Kiosk is stateless.** On boot/wake it calls `get_table_state(table_id)` and
  rebuilds its UI from server truth (M5). `sessionStorage` holds only UI
  identity (display name), never lifecycle state.
- **Realtime demoted to a poke.** A change to the `table_state` row means
  "refetch"; a missed poke costs one stale render, never a wrong state.
- **AOV from the ledger.** `get_aov_summary` v4 (0050) reads `table_events` with
  span-level `DISTINCT` dedupe (H1). `recommendation_events` (dead since the
  event bus) is dropped (0051); `kiosk_events` is frozen as read-only history.

Migrations 0047–0051. Background: `docs/notes/2026-07-11-ledger-refactor-discussion.md`.

## Alternatives considered

- **Patch each bug in place** — leaves the distributed state intact, so the same
  class of race re-appears with the next feature. Rejected: treats symptoms.
- **Client-authoritative session with better sessionStorage discipline** — still
  loses everything on power-cycle (M5) and can't serialize concurrent
  kiosk/POS/voice writes. Rejected.
- **Full event-sourcing / CQRS with a rebuild-from-scratch read model** — correct
  in spirit but far past pilot scale; we keep the existing projection tables and
  just make one function their sole writer. Rejected as over-engineering.

## Consequences

- **Load-bearing:** every lifecycle mutation must go through `append_event`. A
  direct write to `orders`/`sessions`/`restaurant_tables` from any app now
  bypasses the state machine and is a bug. (POS settle and add-items were
  migrated in this refactor; `SettleBillModal` in POSLayout is a **known
  remaining direct-write path** to migrate.)
- **Easier:** any device can be power-cycled at any moment and converges from
  `get_table_state`. New surfaces (a second kiosk, a captain tablet) just call
  the same RPC.
- **Harder:** adding a new lifecycle event means extending the one function and
  its state machine — deliberately a single, reviewed chokepoint.
- **AOV trustworthy:** counts are span-deduped and computed from an append-only
  log, which is the pilot's gating milestone.
- **Revisit if:** we outgrow one Postgres function as the writer (multi-region,
  high write contention on a single `table_state` row), or need per-line
  recommendation attribution inside `order_submitted.items` (a follow-up; v4's
  approach only ever under-counts, never inflates).
- Supersedes **0010** (sessions as first-class entity — now a projection),
  **0014** (kiosk reset via `restaurant_tables.status` Realtime — now the
  `table_state` poke), and **0017** (kiosk event bus with localStorage retry
  queue — replaced by ledger appends).
