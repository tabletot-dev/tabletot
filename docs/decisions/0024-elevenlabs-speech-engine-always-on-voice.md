---
status: proposed
date: 2026-08-16
tags: [voice, elevenlabs, speech-engine, always-on]
---

# 0024 — Always-on voice via ElevenLabs Speech Engine is feasible, but a separate build from the PTT pipeline — not undertaken yet

## Context

The client's original ask was always-on voice ordering (no button, the kiosk
just listens). At the time ADR 0007 was written, always-on (VAD-triggered)
was evaluated and rejected in favor of tap-to-toggle PTT, for two reasons:
privacy (customers should control when they're recorded) and technical risk
(VAD false-triggers in a noisy restaurant floor).

Investigating ElevenLabs' **Speech Engine** product (2026-08-16, alongside
the dual-provider STT/TTS plan in
`docs/plans/2026-08-15-elevenlabs-voice-integration.md`) surfaced that it is
built specifically for this always-on, continuously-listening model —
ElevenLabs' SDK owns turn-taking, interruption detection, and VAD, so the
"technically harder" half of 0007's rejection is now handled by a vendor
instead of custom code.

This ADR records the feasibility findings and the decision to defer, not to
implement. **We are shipping the dual-provider PTT plan first** (Sarvam +
ElevenLabs raw STT/TTS, same PTT interaction model, same session shape) and
testing it in the pilot restaurant before touching the interaction model
itself.

## Decision

Always-on voice via ElevenLabs Speech Engine is **technically feasible now**,
but it is architecturally a second, parallel voice pipeline — not an
extension of the frozen PTT one. Six things change, not one:

1. **Connection direction inverts.** Speech Engine has ElevenLabs' cloud
   connect *into* `order-engine` as a WebSocket client — the reverse of
   today, where `order-engine` calls out to Sarvam/ElevenLabs. This needs a
   publicly reachable WS endpoint on the Railway deploy, with JWT
   verification (`X-Elevenlabs-Speech-Engine-Authorization`, HS256). New
   attack surface that doesn't exist today.
2. **Session model changes.** `session_manager.py` today is one PTT press →
   one STT call → one response. Speech Engine wants a persistent
   `conversation_id` with streamed `agent_response` chunks
   (`is_final: true/false`) and interruption handling keyed on `event_id`.
   This is a new session model, not a drop-in handler swap like the
   dual-provider plan.
3. **LLM orchestration adapts to streaming.** The two-pass resolver flow
   (`orchestrator.py`/`resolver.py`) is reusable for menu-matching logic, but
   the turn loop around it needs to emit streamed chunks instead of one-shot
   responses.
4. **Frontend voice UI is net-new.** This is the Sprint 6-7 work already
   deferred in the kiosk redesign (`docs/plans/2026-08-08-kiosk-v1-redesign.md`),
   except scoped up: always-listening state, live partial transcript, VAD
   state, and barge-in UI instead of a press-and-hold button.
5. **Config becomes a managed cloud resource.** `POST /v1/speech-engine`
   creates a workspace-level `speech_engine_id` (language, ASR/TTS model,
   voice ID). Today's config is per-restaurant, DB-driven
   (`restaurant_config.py` / migration `0028`). Needs a provisioning step —
   one engine per restaurant, kept in sync with the DB — that doesn't exist
   today.
6. **VAD tuning needs the real room.** A desk test doesn't validate
   always-on mic capture in an actual café. This step can only happen on
   the Tab K9, in the restaurant, with real ambient noise — not something
   Claude Code time covers.

Estimated implementation effort (Claude Code agent hours, not human hours;
excludes live smoke testing, on-device testing, and VAD tuning, none of
which are agent-measurable):

| Phase | Hours |
|---|---|
| Public WS server + JWT auth + session rewrite | 3–4 |
| Streaming LLM orchestration adapter | 3–4 |
| Restaurant provisioning (migration + REST wiring) | 1–2 |
| Frontend always-on voice UI | 4–6 |
| Unit tests + smoke test scaffolding | 2–3 |
| ADR + docs | 0.5–1 |
| **Total** | **~14–20 hours** |

Given this scope, and that the pilot restaurant hasn't yet validated the
*existing* PTT pipeline's AOV-lift value, we are not building this now.
Sequencing:

1. Ship the dual-provider PTT plan (ElevenLabs as second provider, same PTT
   UX) — in progress, `docs/plans/2026-08-15-elevenlabs-voice-integration.md`.
2. Test dual-provider mode in the pilot restaurant.
3. Only after that: revisit this ADR, decide whether to build always-on, and
   supersede ADR 0007's PTT decision explicitly if so.

## Alternatives considered

- **Build always-on now, in parallel with the dual-provider plan.** Rejected
  for sequencing reasons — two architectural changes to the voice pipeline
  at once (provider swap + interaction model swap) make it hard to isolate
  what caused a regression if something breaks in the pilot restaurant.
- **Custom VAD instead of Speech Engine's built-in turn-taking.** Not
  seriously evaluated — this is exactly the "technically harder" work ADR
  0007 flagged in 2026-05, and Speech Engine exists specifically to avoid
  building it in-house.
- **Hybrid: keep PTT button, add ambient always-listening as an opt-in
  toggle.** Not evaluated in depth. Worth a real look before committing to
  full always-on, since it would let the privacy concern from ADR 0007 stay
  addressed (explicit customer control) while still meeting the "no button"
  ask most of the time. Flagged here for the next revisit, not decided.

## Consequences

- ADR 0007 is not superseded by this ADR. Its PTT decision stands until the
  dual-provider pilot test is complete and a follow-up decision is made.
- `docs/plans/2026-08-16-elevenlabs-speech-engine-always-on.md` holds the
  implementation-level plan for when this is picked up — kept unexecuted
  until this ADR's status changes from `proposed`.
- If picked up later, Task 4 of the plan (frontend voice UI) overlaps
  directly with kiosk redesign Sprints 6-7 — those should be scoped
  together, not as two separate efforts, to avoid building the voice UI
  twice.
- Exposing a public WS endpoint on `order-engine` is a standing security
  review item if this is ever built — not just a config change.
