---
status: accepted
date: 2026-05-30
tags: [kiosk, realtime, sessions, restaurant_tables]
---

# 0014 — Kiosk reset signal: watch `restaurant_tables.status` not `sessions.session_key`

## Context

After payment the kiosk must reset to its idle attract screen. The trigger for this
reset is the POS settling the bill, which closes the active session for the table.

The original implementation subscribed to `postgres_changes` on the `sessions` table,
filtered by `session_key=eq.<activeSessionKey>`. This had two compounding problems:

**Problem 1 — REPLICA IDENTITY not set on `sessions`.**
Supabase Realtime column-filtered UPDATE subscriptions require `REPLICA IDENTITY FULL`
on the source table. Without it the WAL only carries the primary key of changed rows;
the filter (`session_key=eq.X`) can't be evaluated and events are silently dropped.
`orders` and `restaurant_tables` had this set since migration 0024; `sessions` did not.
Migration 0036 added it, but this exposed Problem 2.

**Problem 2 — `activeSessionKey` is a runtime state variable that can silently be null.**
The Realtime subscription only armed when `activeSessionKey` was non-null. That value
was set in exactly one place: inside the `onStartOrdering` callback in `HomeView`
(`setActiveSessionKey(sessionStorage.getItem("tt_session_id"))`). If that callback was
missed — failed `startSession()`, component remount, or any other timing issue — the
state stayed null, the subscription was never established, and the kiosk was stuck on
the bill-summary screen indefinitely.

The existing DB trigger `trg_free_table_on_session_close` (migration 0019) already
writes to `restaurant_tables` on every session close: it sets `status = 'available'`
and clears `current_order_id`. `restaurant_tables` already had `REPLICA IDENTITY FULL`
and a proven Realtime subscription in `Billing.tsx`.

## Decision

The kiosk subscribes to `postgres_changes` on `restaurant_tables`, filtered by its own
table UUID (`id=eq.<tableUuid>`). When `status` changes to `'available'`, and the kiosk
is not already on the idle screen, it shows the 3-second payment-confirmed message then
calls `endSession()`.

The table UUID is resolved once on component mount via `resolveTableId()` and stored in
React state. The subscription is stable for the lifetime of the device — a physical
kiosk is always at the same table, across all customer sessions.

`activeSessionKey` state is removed entirely. The `onStartOrdering` handler no longer
needs to set it.

## Alternatives considered

- **Keep the `sessions` subscription and fix REPLICA IDENTITY (0036)** — 0036 was
  written and applied, but it only addressed Problem 1. Problem 2 (null `activeSessionKey`)
  remained a latent bug whenever `onStartOrdering` was skipped or failed. Fixing Problem 2
  would require ensuring `activeSessionKey` is always initialised from `sessionStorage`
  at mount, adding complexity and another failure mode. The table subscription avoids
  the problem entirely.

- **Poll the sessions table** — simpler to reason about, no REPLICA IDENTITY concerns,
  but introduces latency (1–5 s depending on interval) and wastes bandwidth on a tablet
  device that may be on shared WiFi. Not appropriate for the reset UX.

- **Listen to `sessions` on `bill_requested` → `closed` transition** — same as the
  original approach; inherits both problems above.

## Consequences

- The reset signal now comes from a proven Realtime path (same table, same REPLICA
  IDENTITY setting, same publication as `Billing.tsx` already uses).
- The kiosk subscription is device-scoped (table UUID, not session key) and boots
  immediately on mount — no user action required to arm it.
- If POS staff manually set a table status to `'available'` outside of a payment flow
  (e.g., via the Tables page), and the kiosk is mid-session, the kiosk will reset
  unexpectedly. For the pilot this is acceptable; staff are aware of the system.
  A future guard could check that a bill request was active before triggering reset.
- Migration 0036 (`REPLICA IDENTITY FULL` on `sessions`) remains applied — it is
  still useful for any future server-side logic or admin subscriptions on sessions,
  and costs nothing to leave in place.
- If `resolveTableId()` fails on mount (e.g., misconfigured `VITE_TABLE_ID`), the
  subscription is never established and the kiosk won't auto-reset. This is the same
  failure mode as before and is caught by the existing console warning in
  `orderSubmission.ts`.
