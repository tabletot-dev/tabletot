# Always-On Voice via ElevenLabs Speech Engine — plan (not started)

> **Status: deferred.** See ADR `docs/decisions/0024-elevenlabs-speech-engine-always-on-voice.md`
> for why. Not to be picked up until the dual-provider PTT plan
> (`docs/plans/2026-08-15-elevenlabs-voice-integration.md`) has shipped and
> been tested in the pilot restaurant. This file exists so the shape of the
> work is captured now, while it's fresh, not to be executed yet.

**Goal:** Replace tap-to-toggle PTT with always-listening voice ordering,
using ElevenLabs Speech Engine to own turn-taking, interruption detection,
and VAD, instead of building that in-house. Runs alongside — not
replacing — the PTT pipeline until it's proven out, per ADR 0024's
sequencing.

**Source:** Feasibility investigation 2026-08-16, cross-referenced against
Speech Engine's cookbook, upstream WebSocket protocol reference, Python SDK
reference, and REST config reference (`docs/notes/elevenlabsapi-helper/`).

## Scope decisions, stated up front

1. **New session model, not a handler swap.** Unlike the dual-provider STT/
   TTS plan, this does not reuse `session_manager.py`'s existing call
   shape. Speech Engine's protocol (persistent `conversation_id`, streamed
   `agent_response`, `event_id`-keyed interruption) doesn't map onto
   `transcribe_session`/`configure`/`speak`/`close`.
2. **Public WS server required.** `order-engine` must expose a WS endpoint
   ElevenLabs' cloud connects into (connection direction is inverted vs.
   today). JWT verification required on every connection.
3. **Reuse the resolver, not the turn loop.** The two-pass LLM resolver
   (`orchestrator.py`/`resolver.py`) logic for menu matching stays; the
   turn loop wrapping it does not.
4. **One `speech_engine_id` per restaurant.** Provisioned via ElevenLabs'
   REST API, tracked in the `restaurants` table (new migration), kept in
   sync — not hardcoded to one config.
5. **PTT pipeline stays.** Not superseding ADR 0007 in this plan. Both
   interaction models could coexist behind a restaurant-level flag if this
   ships, decided at implementation time.
6. **Frontend voice UI scoped with kiosk redesign Sprints 6-7**, not
   separately — building it twice would be wasted work (see ADR 0024
   consequences).

## Task 1 — Public WS endpoint + auth

**Files:** new `backend/routers/speech_engine.py`, `backend/main.py`

- [ ] New WS route in `order-engine`, publicly reachable via the Railway
      deploy's domain.
- [ ] Verify `X-Elevenlabs-Speech-Engine-Authorization` JWT on connect
      (HS256, HMAC secret = SHA-256 of the ElevenLabs API key, per protocol
      reference). Reject unverified connections before any session state is
      created.
- [ ] Security review of the exposed endpoint before this is considered
      done — this is new inbound attack surface, not a config change.

**Verify:** connection rejected without valid JWT; accepted with one.

## Task 2 — Session + turn loop

**Files:** new `voice_agent/speech_engine_session.py`

- [ ] Handle `init` (`conversation_id`) and `user_transcript` (full turn
      history + `event_id`) messages from ElevenLabs.
- [ ] On `user_transcript`, invoke the existing LLM resolver flow with the
      transcript, stream the response back as `agent_response` messages
      (`is_final: false` per chunk, final `agent_response` with
      `is_final: true` and empty `content`).
- [ ] Interruption: if a new `user_transcript` arrives with a newer
      `event_id` before the in-flight response completes, cancel the LLM
      call and start responding to the new one. Discard messages carrying
      a stale `event_id`.
- [ ] Handle `ping`/`pong` keepalive and `close`.

**Verify:** unit tests mocking the WS, covering normal turn completion and
mid-response interruption.

## Task 3 — Restaurant provisioning

**Files:** `voice_agent/restaurant_config.py`,
new `supabase/migrations/00XX_restaurant_speech_engine_id.sql`

- [ ] Migration: additive `speech_engine_id text` column on `restaurants`.
- [ ] Provisioning script/step: `POST /v1/speech-engine` per restaurant at
      onboarding time (language, `asr.provider=scribe_realtime`,
      `tts.model_id`, `tts.voice_id`, `ws_url` pointed at Task 1's
      endpoint), store the returned `speech_engine_id`.
- [ ] `load_restaurant_config()` extended to read it.

**Verify:** provisioning script run against a test restaurant row, config
readable back.

## Task 4 — Frontend always-on voice UI

**Files:** TBD — scope with kiosk redesign Sprints 6-7, not decided here.

- [ ] Always-listening mic capture (persistent permission grant, not
      press-triggered).
- [ ] Live partial-transcript display.
- [ ] Listening / thinking / speaking visual states.
- [ ] Barge-in handling (customer speaks while kiosk is mid-response).
- [ ] Privacy affordance — ADR 0007 raised customer control over recording
      as a real concern; always-on needs *some* visible signal (e.g. a
      persistent "listening" indicator, an explicit mute option) so this
      isn't silently recording. Not optional — carries ADR 0007's concern
      forward, doesn't dismiss it.

## Task 5 — Real-environment VAD tuning

**Not agent-executable.** Requires the Tab K9 on-site at the pilot
restaurant, with real ambient noise (espresso machine, other tables,
staff conversation). Budget separate time for this; it's iterative and
needs a human listening and judging false-trigger rate.

## Task 6 — Docs

- [ ] This plan file, checkboxes updated as tasks complete.
- [ ] ADR 0024 status updated from `proposed` once a go/no-go decision is
      made.
- [ ] If shipped, ADR 0007 explicitly marked superseded (or amended to
      note always-on as an alternative interaction mode, restaurant's
      choice) — never edit 0007 directly, write the supersession as a new
      ADR revision per project convention.

---

## Explicitly out of scope (for this plan, as currently scoped)

- **Removing PTT.** Coexists behind a flag unless a future decision says
  otherwise.
- **Building this before the dual-provider PTT plan ships and is tested.**
  Sequencing decision, see ADR 0024.
- **Frontend implementation detail.** Deferred to whenever Sprints 6-7 are
  scoped — this plan only notes the always-on requirements that Sprint 6-7
  scoping needs to account for.

## Verification gate (once picked up)

```
cd services/order-engine
pytest tests/ -v                                    # existing suite stays green
pytest tests/test_speech_engine_session.py -v        # new
```

Plus: live smoke test against a real ElevenLabs Speech Engine key (JWT
verification, one full turn, one interruption), and on-site VAD tuning at
the pilot restaurant before this is considered ready for customers.
