---
status: accepted
date: 2026-08-15
tags: [architecture, ledger, kitchen, pos]
---

# 0022 — `kot_tickets` gets a `cancelled` status distinct from `archived`

## Context

A read-only investigation of `docs/notes/pre-launch-readiness-assessment.md`
found that cancelling an order via POS `/orders`
(`orders.status = 'cancelled'`) silently reverted to `served` — the opposite
of what was written. Root cause was a collision between two independently
correct migrations:

- **0059** (`archive_kot_on_order_cancel`): when an order is cancelled, it
  archives that order's `kot_tickets` (`status = 'archived'`) so Kitchen
  Display stops showing them — fixing a real bug where a cancelled ticket
  lingered on the kitchen queue indefinitely.
- **0055** (`sync_order_status_from_kot`, from the earlier "Plating 85%
  forever" fix): whenever a KOT is archived and it was the *last* active KOT
  on its order, it sets `orders.status = 'served'` — this is how a normal
  round finishing service gets reflected on the order.

Cancelling an order triggers 0059's archive, which triggers 0055's sync,
which sees "all KOTs archived" and sets the order back to `served`,
overwriting the `cancelled` write in the same transaction. Verified directly
against the DB and via a new regression test
(`AOV v5` in `apps/kiosk/tests/golden-session.test.ts`, written for the
original AOV-inflation bug this caused): the order ends up `served`, its KOT
`archived`, indistinguishable from a normal completed round anywhere
`orders.status` or `kot_tickets.status` is read.

Both migrations were correct in isolation. The actual defect is that
`archived` on a KOT means two different things — "finished, service
complete" and "cancelled, nobody's paying for this" — and nothing
downstream can tell which one just happened.

## Decision

Give `kot_tickets` a `cancelled` status, distinct from `archived`. 0059's
`archive_kot_on_order_cancel()` now sets `status = 'cancelled'` instead of
`'archived'` on the order's active tickets. `kot_tickets.status` is plain
`text` with no CHECK constraint or enum (confirmed before this migration —
same pattern as `orders.status`), so this needed no schema/type change,
only a function body change (migration 0060).

No change was needed to `sync_order_status_from_kot()` (0055):
`NEW.status = 'cancelled'` matches none of its branches (not the `archived`
branch, not the `preparing`/`ready` counts), so it now correctly no-ops on
a cancel instead of colliding with it — the fix removes the ambiguity
rather than adding a special case around it.

This is scoped to the KOT-status vocabulary only. The follow-on work it
enables — Kitchen Display showing cancelled tickets instead of hiding them,
and making `order_history`/`get_aov_summary` correctly treat a cancelled or
walked-out order as zero revenue — is tracked in
`docs/plans/2026-08-15-revenue-integrity-and-cancellation-fixes.md` and may
warrant its own follow-up ADR once the revenue-source question in that plan
(fix at the `order_history` write site vs. re-sourcing `get_aov_summary`
from `payments`) is settled.

## Alternatives considered

- **Special-case `sync_order_status_from_kot()` to skip when the order is
  already `cancelled`.** Rejected: requires an extra lookup on every KOT
  archive, couples the two triggers more tightly instead of removing the
  ambiguity, and leaves `archived` still meaning two things everywhere else
  `kot_tickets.status` is read (Kitchen Display included) — just papered
  over in this one code path.
- **Don't archive the KOT at all on cancel; leave it in whatever active
  status it was in.** Rejected: this is the exact bug 0059 was written to
  fix — a cancelled ticket would linger on Kitchen Display indefinitely,
  looking like a real order the kitchen still needs to act on.
- **Add a separate boolean (`is_cancelled`) instead of extending the status
  string.** Rejected: `status` is already the single field every consumer —
  the sync trigger, Kitchen Display's queries and filters — branches on.
  A parallel boolean creates a second source of truth for "is this ticket
  done" that could disagree with `status`.

## Consequences

- **Load-bearing:** any future consumer of `kot_tickets.status` (Kitchen
  Display foremost) must now handle a fourth non-active state alongside
  `accepted`/`preparing`/`ready`/`archived`. This is the direct enabler for
  the Kitchen Display change in the linked plan — cancelled tickets can now
  be shown and styled distinctly instead of vanishing the instant they're
  cancelled.
- **Easier:** `sync_order_status_from_kot()` needed zero changes. The
  ambiguity it was tripping over is structurally gone, not special-cased
  away.
- **Revisit if:** a future case needs the same "done, but not a normal
  completion" treatment (e.g. a refunded or voided KOT) — extend the status
  vocabulary the same way rather than reusing `archived` or `cancelled` for
  a third meaning.
