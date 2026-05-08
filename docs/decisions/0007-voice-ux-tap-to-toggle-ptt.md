---
status: accepted
date: 2026-05-08
tags: [voice, ux, ptt]
---

# 0007 — Voice UX: tap-to-toggle PTT, not hold-to-talk

## Context

Tabletot's voice feature lets customers speak their order instead of tapping.
The voice button needed an interaction model. The STT pipeline (Sarvam
saaras:v3) uses a WebSocket that is stateless per press — it opens, streams
audio, closes on end-of-speech or explicit stop.

Two models were prototyped:

1. **Hold-to-talk (PTT)** — button active while held, releases on finger-up.
   Common in walkie-talkie style interfaces.
2. **Tap-to-toggle** — first tap starts listening, second tap stops.

The context is a kiosk at a restaurant table. Customers hold phones, bags,
menus. Requiring them to hold a button while speaking is awkward, especially
for longer orders.

## Decision

Tap-to-toggle PTT. One tap starts the session (microphone opens, recording
begins), second tap ends it (recording stops, STT result is processed).

Visual state is explicit: the button changes appearance when active so the
customer knows they're being recorded.

The TTS WebSocket (Sarvam bulbul:v3) is persistent per session with a 30-
second keepalive, separate from the STT connection.

## Alternatives considered

- **Hold-to-talk** — prototyped first. Awkward at a table. Customers
  reflexively let go mid-sentence. High false-stop rate in testing.
  Replaced with tap-to-toggle (see commit history).
- **Always-on (VAD-triggered)** — rejected. Privacy concern in a restaurant
  environment. Customers should have explicit control over when they're
  being recorded. Also technically harder: VAD in a noisy restaurant
  generates many false triggers.
- **No voice at all** — voice is an add-on, not the primary path. The
  `voice_enabled` flag in `restaurants.config` controls whether the button
  appears. Restaurants can run touch-only.

## Consequences

- The voice button component must maintain clear visual state (active /
  inactive) and handle the toggle cleanly including error states (STT
  timeout, network drop).
- If a customer taps once and walks away, the session stays open until they
  tap again or a timeout fires. Timeout handling is required.
- The `voice_enabled` flag defaults to `true` in `RestaurantProvider` to
  avoid a flash of no-voice on load. If the DB fetch returns `false`, the
  button disappears after hydration.
- Voice analytics tie to `tt_session_id` / `voiceSessionId` for cross-system
  tracing. The unified ID was a deliberate decision to make voice funnel
  analysis possible post-pilot.
