---
status: accepted
date: 2026-06-06
tags: [telemetry, kiosk, architecture]
---

# 0017 — Kiosk telemetry routes through a single client-side event bus

## Context

Before this decision, the kiosk had no general-purpose interaction telemetry.
Four call sites — two in [DishCard.tsx](../../apps/kiosk/src/components/DishCard.tsx)
and two in [CompletionNudge.tsx](../../apps/kiosk/src/components/CompletionNudge.tsx) —
wrote directly to `recommendation_events` via fire-and-forget Supabase inserts.
Every other customer interaction was invisible.

This caused two concrete problems:

- **Silent measurement failure.** The inserts had no `.then()`/`await`. When
  they failed (RLS, FK, schema mismatch), the UI never noticed and the
  dashboard reported zeros. On 2026-06-05 we confirmed the dashboard was
  showing ₹0 direct revenue not because nothing was happening, but because
  the writes were silently failing.
- **Attribution gaps.** The pairing acceptance event only fired when the
  customer tapped the chip's "Add" button. Adds via the chip's stepper +,
  via the main-menu card after seeing a chip, or via voice were all
  invisible to attribution.

The deeper issue is structural: an upsell-focused product needs a coherent
event stream, not a handful of bespoke inserts at specific moments. Without
that, every new analytical question requires plumbing a new ad-hoc insert
into a UI component, and every failure mode is invisible.

## Decision

Every meaningful customer interaction in the kiosk routes through a single
client-side function `track(eventType, payload)` exported from
[apps/kiosk/src/lib/eventBus.ts](../../apps/kiosk/src/lib/eventBus.ts).
The bus enriches each event with `session_key`, `restaurant_id`, and a
client timestamp, then writes one row to a new `kiosk_events` table
(migration `0041_kiosk_events_table.sql`).

The vocabulary is intentionally small — five event types covering the
upsell flow end-to-end, enforced both at the TypeScript layer (`EventMap`)
and at the database layer (CHECK constraint on `event_type`):

| Event | Payload | Fires when |
|---|---|---|
| `recommendation_shown` | `{ itemId, surface }` | A recommendation chip / panel becomes visible |
| `recommendation_tapped` | `{ itemId, surface }` | Customer taps the explicit accept control |
| `item_added` | `{ itemId, source }` | Item enters the cart via any control on any surface |
| `item_removed` | `{ itemId }` | Item leaves the cart |
| `order_submitted` | `{ orderId, kotId, itemCount, total }` | KOT insert succeeds |

`source` values: `main_menu`, `detail_view`, `pairing_chip`,
`completion_nudge`, `voice`. `surface` values: `inline_pairing`,
`completion_nudge`.

`item_added` is emitted by the cart hook
([useDeviceNavigation.ts](../../apps/kiosk/src/hooks/useDeviceNavigation.ts))
as the single source of truth, so attribution can never double-count or
silently miss a cart mutation. Every UI surface that touches the cart
routes through `addToOrder` or `updateQuantity`, and each surface passes
its own source string.

Writes go directly from the kiosk to Supabase. There is no batching,
queueing, retry, or offline buffer. One event = one HTTP request.
Failures log to `console.error`.

Voice telemetry is explicitly out of scope for this round. Voice-driven
adds carry `source: "voice"` so they appear in the event stream, but the
voice pipeline (STT/LLM/TTS files in `services/order-engine` and
`apps/kiosk/src/lib/voice/`) is not modified.

## Alternatives considered

- **Keep ad-hoc Supabase inserts in UI components.** Status quo. Rejected
  because the failure modes are silent and every new event requires a
  bespoke insert in a component file. Doesn't scale past a handful of
  observation points.
- **Server-side event collection now.** Route `track()` through the
  order-engine FastAPI service, which validates and writes. Better
  long-term — the backend knows things the kiosk doesn't (session state,
  current cart server-side) — but pulls forward backend work that's not
  needed until the Petpooja adapter exists. Deferred: when the kiosk needs
  a backend anyway, `track()` switches transport with no call-site changes.
- **Generic key/value event with a freeform JSON `meta` blob.** Rejected.
  Saves a typed event schema but makes every query a JSON cast and makes
  it easy to invent fields that nobody else knows exist. The five typed
  events catch typos at compile time and keep attribution queries readable.
- **Batched / retry / offline buffer in v1.** Rejected for the pilot.
  Event volume is small (tens per session) and a tablet on the
  restaurant's wifi is online. Adds complexity without benefit at this
  scale. Easy to swap the bus internals later without changing call sites.
- **Log everything (scroll, dwell, screen-nav, voice-utterance-start).**
  Rejected. Scope discipline: log exactly what the dashboard's upsell
  question needs. Expanded taxonomy is a follow-up that should be driven
  by a specific dashboard need, not by speculative completeness.

## Consequences

What gets easier:

- New upsell surfaces (future "anchor on empty cart" patterns, future
  recommendation slots) plug into `track()` without writing bespoke
  insertion code or new database columns.
- Failures are visible. `console.error` calls surface schema mismatches
  and RLS regressions during hardware testing, instead of silently
  zeroing the dashboard.
- The cart hook is the single emitter of `item_added` and `item_removed`.
  TypeScript enforces that every cart-mutating surface declares its
  source. Drift is caught at compile time, not in production data.
- The dashboard's attribution query is a clean join across one table.
  Future analytics (acceptance rate, time-to-add, abandonment) read the
  same stream.

What gets harder:

- Adding a new event type requires updating both the TypeScript `EventMap`
  and the database CHECK constraint via a small ALTER. The friction is
  intentional — it forces a deliberate vocabulary decision each time.
- Anyone with the anon key can insert arbitrary `kiosk_events` rows via
  the permissive `anon_insert` RLS policy. Acceptable for the pilot;
  the eventual server-side collection path closes this.

What this commits us to:

- Maintaining the bus as the single observation point for kiosk
  interactions. New surfaces that bypass `track()` will not appear in the
  dashboard. ADR 0018 (the attribution rule) depends on this discipline
  holding.
- The voice gap. Voice adds are observable but excluded from
  recommendation attribution by design. Bringing voice into attribution
  is a separate ADR and requires routing recommendation context from the
  kiosk to the voice resolver.

What would force us to revisit:

- Event volume exceeding the per-row HTTP cost (~50 events / second
  sustained). Swap to batching internally.
- A new feature (multi-user table sessions, persistent customer
  identifiers) needing event fields the bus doesn't enrich today.
- Backend collection becoming necessary for cross-device or
  cross-restaurant analytics, at which point Petpooja adapter work brings
  the server-side path online.
