---
id: "0010"
title: "Sessions table as the anchor for kiosk-POS bidirectional communication"
date: 2026-05-25
status: accepted
tags: [kiosk, pos, db, realtime]
---

# 0010 — Sessions table as the anchor for kiosk-POS bidirectional communication

## Context

The kiosk and POS are separate browser contexts on separate devices. Before this decision:

- The kiosk wrote `orders` and `kot_tickets` rows but never touched `restaurant_tables`.
- The POS had no way to know a customer was at a table until the first KOT arrived.
- There was no way for the POS to signal the kiosk to reset (e.g. after payment).
- `session_id` existed as a loose `text` column on `orders` and `kot_tickets` (migration 0013) but had no anchor row — it was an opaque string with no lifecycle.

The gap: between "customer taps Start Ordering" and "first item sent to kitchen", the POS saw the table as available, staff had no signal, and the kiosk had no persistent identity in the DB.

## Decision

Introduce a `sessions` table as a first-class entity representing a single customer visit. The session row is created when the customer taps "Start Ordering" on HomeView (before any ordering happens), and closed when payment completes or staff manually end service.

Three DB triggers enforce consistency without requiring coordinated writes from application code:
1. **Session INSERT** → `restaurant_tables.status = 'occupied'`
2. **Session UPDATE (→ closed)** → `restaurant_tables.status = 'available'`, `current_order_id = NULL`
3. **Orders INSERT (with `table_id`)** → `restaurant_tables.current_order_id = NEW.id` (first order only)

Both kiosk and POS subscribe to `sessions` via Supabase Realtime. The kiosk reacts to `status = 'closed'` by resetting to idle. The POS reacts to new sessions by seeing the table turn occupied in the table grid.

## Alternatives considered

- **Redis pub/sub** — would give lower latency (~10ms vs ~200ms) but requires a separate service, connection string, and failure domain. For a 10-table pilot, 200ms is imperceptible.
- **Polling from POS** — already removed as part of the Google Sheets sync cleanup. Polling adds latency, burns DB connections, and gives staff a stale view.
- **Kiosk writes directly to `restaurant_tables`** — avoids the sessions table but makes `restaurant_tables` the session state store, conflating two concerns. Also doesn't give the POS a "session start" event it can subscribe to specifically.
- **`session_id` text column is enough** — the text column exists but has no lifecycle. There's no row to subscribe to, no status transitions, no `ended_at`. Everything that connects kiosk events to POS visibility requires a real row.

## Consequences

- The table grid in POS Billing goes occupied the moment a customer taps Start Ordering, before any food is ordered. Staff see intent, not just orders.
- POS can close a session (payment complete or manual) and the kiosk resets automatically — no customer action needed, no staff action on the kiosk.
- All session-scoped entities (`orders`, `kot_tickets`, `bill_requests`, `table_requests`, `voice_turns`) link to the session via `session_key` for analytics.
- Session start is non-blocking on the kiosk — if the INSERT fails, the customer still reaches the menu. The table won't go occupied in that case; staff can handle manually.
- If a customer refreshes the kiosk tab mid-session: `tt_session_id` persists in `sessionStorage`, so the session row already exists and `tt_order_id` will resume appending to the same orders row. A hard tab close loses `sessionStorage` — the session row remains `active` in DB until POS closes it.
