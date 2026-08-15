# Free/Occupied label bug — investigated, not reproducible (2026-08-15)

Investigated finding #6 in `docs/notes/pos-only-live-qa-findings.md`: a table
with a `ready`-status order allegedly shows "Free" in the Billing sidebar
instead of "Occupied". No code changed — this is a report of the
investigation, not a fix.

## What the label is driven by

`Billing.tsx`'s sidebar badge (`STATUS_LABEL[table.status]`, line ~739) reads
`restaurant_tables.status` directly — no merge with `orders.status` or
`kot_tickets.status` at render time. That column is only ever written to
`'occupied'`/`'available'` by `append_event`'s branches (session start,
order_submitted, bill_requested, payment_settled, service_ended) — never by
anything KOT- or order-status-related. So for the reported symptom to be
real, `restaurant_tables.status` itself would have to incorrectly read
`'available'` while a `ready` order is open on that table.

## Repro attempt

Rebuilt the full lifecycle end-to-end via `append_event` (the same RPC the
kiosk/POS call) plus direct `kot_tickets.status` updates (the same write
`Kitchen.tsx`'s `updateStatus` does — confirmed by reading its handler, not
assumed):

`session_started` → `order_submitted` (₹360 item) → KOT `accepted` →
`preparing` → `ready` → `bill_requested` → water request inserted.

Checked `restaurant_tables.status` after every step: stayed `occupied`
throughout, including at `ready`. Confirmed live in-browser too, on a fresh
page load (matching the finding's "immediately after POS login" detail): T1
showed "Occupied", with the water-request badge visible and a correct
"Settle — ₹378" bill ready to go.

## Conclusion

Could not reproduce on the current codebase (post-migration 0059, and after
today's three cancelled-order fixes). Two plausible explanations, not
distinguished here:
1. It was already fixed as a side effect of migrations 0052–0055 (the
   service_ended/KOT-notes/archive fixes) — those migrations predate this
   investigation but postdate the original 2026-08-13 QA session.
2. The original QA session's repro involved days-old orphaned test debris
   (per `kiosk-pos-live-qa-findings.md` #2's stuck KOTs, 4-10 days old) whose
   `restaurant_tables` row may have been left in an inconsistent state by
   whatever bug *created* that debris, rather than by the `ready` transition
   itself. That debris no longer exists locally (wiped by `supabase db
   reset` earlier in this session), so this can't be checked directly.

Not marking this fixed — nothing was changed. If this resurfaces on the real
pilot deployment, the next debugging step is capturing the exact
`restaurant_tables` row + its `updated_at` timestamp at the moment "Free"
incorrectly shows, to see which write (or lack of one) produced it.
