# Cancel-doesn't-cascade-to-KOT fix (2026-08-15)

Fixes finding #2 in `docs/notes/pos-only-live-qa-findings.md`: cancelling an
order via `/orders` left its kitchen ticket sitting in Kitchen Display as
`ready`/`accepted`/`preparing` forever — kitchen staff would keep seeing it as
something to prepare or serve.

## Root cause

Migration 0035 added `trg_sync_order_status_from_kot` — a one-way trigger,
KOT → Order only, propagating kitchen progress up to `orders.status`. There
was no trigger in the other direction. `payment_settled`/`service_ended` (in
`append_event`) archive a session's KOT tickets explicitly as part of their own
logic, but the POS `/orders` page's manual status dropdown is a direct
`orders.update({status: 'cancelled'})` write (per 0056's comment identifying
this as one of POS's two remaining direct-write call sites) with nothing
downstream reacting to it.

## Fix

`supabase/migrations/0059_archive_kot_on_order_cancel.sql` adds the missing
direction: `trg_archive_kot_on_order_cancel`, `AFTER UPDATE OF status ON
orders`, archives that order's active (`accepted`/`preparing`/`ready`)
`kot_tickets` rows when `orders.status` transitions to `cancelled`. Mirrors the
exact archive semantics `payment_settled`/`service_ended` already use —
`archived` is this schema's only "done, remove from the active kitchen queue"
state; there's no separate `cancelled` vocabulary for `kot_tickets`.

Applied directly via `psql -f` against the running local instance (not a full
`supabase db reset`, to avoid re-wiping the auth user / grants / test data
already set up this session) and registered in
`supabase_migrations.schema_migrations` for tracking.

## Verification

1. DB-level: seeded an order + a `ready` KOT ticket wired to it, set
   `orders.status = 'cancelled'` directly, confirmed the KOT flipped to
   `archived`.
2. Live browser, full repro of the original finding: seeded a fresh order +
   `ready` KOT ticket on Table T1 (POS dev server, localhost:8081, logged in
   as `user@test.com`), confirmed it appeared in Kitchen Display's active
   queue ("Ready (1)", with a "Complete & Archive" button). Cancelled the
   order via `/orders` → status dropdown → Cancelled — the same repro path as
   the finding. Reloaded Kitchen Display: the ticket is gone from the active
   queue (only pre-existing, unrelated stuck test debris from the original QA
   session remains).
