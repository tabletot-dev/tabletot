---
status: accepted
date: 2026-08-16
tags: [architecture, aov, revenue, ledger]
---

# 0023 — `get_aov_summary` reads settled revenue from `payments`, not `order_history`

## Context

ADR 0022 documented the KOT-status root cause and flagged two more confirmed
bugs, live-verified against local Docker Supabase and detailed in
`docs/plans/2026-08-15-revenue-integrity-and-cancellation-fixes.md`:

- **Discount dropped at settle.** `Billing.tsx`'s discount UI writes
  `orders.final_discount`/`final_total`, but `append_event`'s
  `payment_settled` branch copied `orders.discount`/`orders.total` (the
  pre-discount values) into `order_history`. A customer who paid ₹612 showed
  up as ₹756 in `order_history.total` and in `get_aov_summary`.
- **Cancelled-and-walked-out still counted as revenue.** `service_ended`
  (the "End Service" walkout path, already correct as a mechanism per ADR
  0020) copied `orders.total` into `order_history` regardless of order
  status. A fully cancelled ₹756 order, ended via "End Service" with
  `amount_paid: 0`, still showed `total: 756` in `order_history` and counted
  as ₹756 of revenue in `get_aov_summary`.

Both bugs share one root cause: `get_aov_summary` (0050/0058) sums
`order_history.total`/`orders.total` directly, trusting it as "the real
revenue figure" without checking for a discount or a cancellation. ADR 0020
already stated the intended invariant — "anything that computes revenue from
`payments`, not `order_history`, is automatically unaffected by
walkouts" — but `get_aov_summary` never followed it; it was written before
`payments` existed as a per-payment ledger table.

`payments.amount` already reflects the discounted amount actually paid
(`append_event` inserts it from `p_payload->>'amount_paid'`, the same value
Billing.tsx sends after applying its discount), and `service_ended` never
inserts a `payments` row at all — so sourcing revenue from `payments`
fixes both bugs for free, following the invariant ADR 0020 already named.

The blocker: `payments.order_id` had `ON DELETE SET NULL` on its FK to
`orders`, and `payment_settled` deletes the `orders` row in the same
transaction right after inserting the payment — so `payments.order_id` was
`NULL` for every settled payment, breaking the join `get_aov_summary` needs
to attribute a payment to a time-windowed span.

## Decision

Two migrations, in order:

1. **0061** — drop `payments_order_id_fkey` entirely (no replacement FK).
   `payments.order_id` becomes a plain durable UUID, matching the pattern
   `order_history.original_order_id` already uses (no FK at all). Insert-time
   validity was never FK-dependent — `append_event` only inserts a payment
   after `SELECT ... INTO v_order ... IF FOUND` — so this loses no
   correctness guarantee, only the survive-past-delete behavior being
   removed on purpose.
2. **0062** — re-source `get_aov_summary`'s settled-revenue branch from
   `SUM(payments.amount)` joined on the now-durable `order_id`, instead of
   `SUM(order_history.total)`. The live (unsettled) branch is unchanged — a
   live order has no `payments` row yet by definition, so it stays
   `orders.total`-based, already correctly excluding `cancelled` orders.
   `survived`'s `order_history` branch also gains
   `payment_method IS NOT NULL`, so a walkout's pairing taps stop counting
   toward `accepted_count` — `payment_method` is `NULL` only for
   `service_ended` rows, per ADR 0020's existing convention.

A third migration (0063) fixes the `order_history` write site itself
(`COALESCE(final_total, total)` / `COALESCE(final_discount, discount)` in
both `payment_settled` and `service_ended`) — now an audit-accuracy fix for
`Orders.tsx`/`Reports.tsx`'s History views only, since 0062 already moved
`get_aov_summary` off `order_history` entirely. 0063 also extends the
archive-KOT sweep to include `'cancelled'` (alongside
`accepted`/`preparing`/`ready`), so a KOT left `cancelled` by 0060's trigger
archives when the table actually closes, instead of staying `cancelled`
forever.

A cancelled or walked-out order keeps its real `total` in `order_history` —
no zeroing. `payment_method IS NULL` is the signal nothing was actually
paid; `get_aov_summary` reading from `payments` means it simply never sees a
row for that order, rather than needing `order_history.total` to lie about
what was ordered. History views can honestly show "this table had ₹756 on
it before the cancel" next to a blank payment method.

## Alternatives considered

- **Patch `order_history`'s two writers directly (`payment_settled`,
  `service_ended`) and leave `get_aov_summary` reading `order_history`.**
  Rejected as the primary fix ("Option A" from the original discussion) —
  it works for the discount bug, but for the walkout bug it forces a choice
  between zeroing `order_history.total` (destroying the honest audit record
  of what was on the table) or adding a `get_aov_summary`-side status check
  that duplicates logic `payments` already encodes for free. It's also two
  call sites to keep in sync forever, exactly how bug 3 slipped through the
  original 0058 AOV fix in the first place.
- **Zero `order_history.total` for a cancelled/walked-out order instead of
  re-sourcing revenue.** This was the first draft's judgment call before
  `payments`-sourcing was chosen; superseded once Option B made it
  unnecessary — a real total next to a blank payment method is strictly more
  informative than a zeroed one, and `get_aov_summary` no longer needs
  `order_history.total` to carry that signal.
- **Fold the direct writes (POS cancel via `/orders`, Billing's
  `final_discount`/`final_total`) into the `append_event` ledger instead of
  reading whatever ended up on `orders` at close time.** Out of scope here —
  a bigger architectural change warranting its own ADR if more direct-write
  bugs turn up. This plan works around the direct writes rather than
  removing them.

## Consequences

- **Load-bearing:** any future revenue computation must read `payments`, not
  `order_history`/`orders.total` — `get_aov_summary` is now the reference
  implementation of that invariant, not just a description of it (ADR 0020
  named the invariant; this ADR is the migration that makes it true).
- **Load-bearing:** `payments.order_id` no longer has referential integrity
  enforced by the database — a future migration must not re-add the FK
  without also solving the survive-past-delete requirement (e.g. deferring
  the `orders` row deletion, or pointing the FK at `order_history` instead).
- **Easier:** `order_history`'s discount/total accuracy (0063) is now purely
  a POS-audit-view concern, decoupled from AOV correctness — a future bug in
  one no longer risks silently reintroducing the other.
- **Revisit if:** refunds are ever built. `get_aov_summary`'s `payments`
  join already filters `WHERE p.status = 'completed'` defensively (every row
  is `'completed'` today), so a refund would need its own `payments.status`
  value and this filter starts doing real work instead of being a no-op.
