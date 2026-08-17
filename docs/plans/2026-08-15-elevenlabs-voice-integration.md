# ElevenLabs Voice Integration Plan — dual-provider STT/TTS, ElevenLabs default

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ElevenLabs as a second voice provider alongside Sarvam — not a
replacement. `STT_PROVIDER` and `TTS_PROVIDER` become independent env-var
switches, each defaulting to `elevenlabs`, each falling back to `sarvam`.
Sarvam's existing handler code and behavior stay byte-for-byte untouched so
the swap is reversible with a config flip, no redeploy. (One exception,
necessary not incidental: `tests/test_session_manager.py`'s mock-patch
targets moved from `SarvamTTSHandler` to `create_tts_handler` in Task 4,
since that's genuinely where handler construction now happens — same
assertions, same intent, just following the real call site.)

**Source:** Feasibility check + live ElevenLabs documentation review
conducted 2026-08-15 (Scribe v2 Realtime STT, TTS WebSocket stream-input,
model catalogue), cross-referenced against the current Sarvam wiring in
`services/order-engine/voice_agent/` and `backend/routers/voice.py`, plus
the DB-backed restaurant config (`supabase/migrations/0028_restaurant_voice_config.sql`).
The voice pipeline is otherwise frozen per `services/order-engine/CLAUDE.md`
— this plan only adds a parallel path, it does not modify frozen code.

## Scope decisions, stated up front

1. **Dual independent switches**, not one combined toggle. `STT_PROVIDER`
   and `TTS_PROVIDER` can point at different providers if needed later
   (e.g. ElevenLabs STT + Sarvam TTS), though both default to `elevenlabs`
   now.
2. **No dedicated India low-latency endpoint** on the current ElevenLabs
   tier (Enterprise-only). Accepted as a known limitation, not a blocker.
3. **Model split by language need, not by symmetry:**
   - TTS is Hindi/English only for this pilot → `eleven_flash_v2_5`
     (~75ms latency, Hindi + English supported, cheapest tier).
   - STT must cover Hindi **and Telugu** (customers speak more languages
     than the restaurant replies in) → `scribe_v2_realtime` (covers
     Hindi/Telugu/English + code-switching in one model — no tradeoff
     needed on the STT side, unlike TTS).
4. **PCM-over-WebSocket output format reliability is unverified on paper**
   (a historical GitHub issue claimed the TTS WS endpoint silently returned
   MP3 regardless of `output_format`). Not resolved by documentation
   review — **Task 2 includes a live smoke test as part of "done," not a
   deferred risk.**
5. **Voice IDs are deliberate placeholders**, picked from ElevenLabs'
   documented default voice library, explicitly meant to be swapped after
   a real listening test:
   - Primary (maps to Sarvam's current `speaker: "rohan"`): **Adam** —
     `pNInz6obpgDQGcFmaJgB`
   - Fallback (maps to Sarvam's current `fallback_speaker: "ishita"`):
     **Rachel** — `21m00Tcm4TlvDq8ikWAM`
6. **Scribe v2 Realtime access confirmed available** on the account's plan
   — no gating workaround needed.

## Architecture

Mirrors the pattern already in this codebase for LLM providers
(`LLM_PROVIDER` env var → `create_provider()` factory in `src/llm/__init__.py`
→ `LLMProvider`-shaped classes) rather than inventing a new abstraction.
Sarvam's handlers are already called only through their public methods
(`transcribe_session`, `configure`, `speak`, `close`) by
`session_manager.py`/`routers/voice.py` — no Sarvam-specific internals leak
out — so the new ElevenLabs handlers just need to match that same method
shape. No formal ABC needed; the Sarvam handlers aren't under one today
either, and adding one would be structure the codebase doesn't otherwise use.

```
STT_PROVIDER=elevenlabs (default) ──┐
                                     ├─→ create_stt_handler() ─→ handler used per PTT press
STT_PROVIDER=sarvam ────────────────┘    (voice.py, unchanged call site)

TTS_PROVIDER=elevenlabs (default) ──┐
                                     ├─→ create_tts_handler() ─→ handler held per session
TTS_PROVIDER=sarvam ─────────────────┘   (session_manager.py, unchanged call site)
```

---

## Task 1 — ElevenLabs STT handler

**Files:** new `voice_agent/elevenlabs_stt_handler.py`,
new `tests/test_elevenlabs_stt_handler.py`

- [x] `ElevenLabsSTTHandler.__init__(api_key: str)` — same constructor
      shape as `SarvamSTTHandler`.
- [x] `async def transcribe_session(self, client_ws: WebSocket) -> str | None`
      — same signature as `SarvamSTTHandler.transcribe_session`. Internally:
      - Connect to `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
        with `xi-api-key` header, query params `model_id=scribe_v2_realtime`,
        `audio_format=pcm_16000` (matches the mic's existing 16kHz PCM —
        no resampling needed on the client side).
      - Forward client PCM frames as `input_audio_chunk` messages
        (base64-encoded, per-chunk) — **snake_case**, verified against the
        current API reference (2026-08-16); the plan originally had this
        as `InputAudioChunk` (PascalCase), which is wrong and would have
        caused the handler to send malformed messages.
      - On the client's flush signal (same trigger the Sarvam handler
        listens for), send the chunk with `commit: true` instead of
        Sarvam's separate `{"type":"flush"}` message.
      - Read `session_started` / `partial_transcript` / `committed_transcript`
        messages back (also available: `final_transcript`,
        `final_transcript_with_timestamps` — not needed here). There is no
        `speech_start`/`speech_end` message type in the real API; map
        `session_started` → client's session-open signal,
        `partial_transcript` → `interim`, `committed_transcript` → `final`,
        in the shape the frontend already expects (frontend is
        provider-agnostic — confirmed in earlier investigation, it only
        reads these message types, never Sarvam-specific fields).
      - Return the committed transcript string, or `None` on
        disconnect/no-speech — same contract as Sarvam's handler.
- [x] Unit tests mirroring `tests/test_stt_handler.py`'s structure: mocked
      WebSocket, no live API calls, covering the commit/finalize path and
      the no-speech path. 5/5 passing, TDD'd (watched red on missing
      module first). Full suite otherwise unaffected — pre-existing
      DB-dependent failures (local Supabase not running) unrelated to this
      change.

**Verify:** `pytest services/order-engine/tests/test_elevenlabs_stt_handler.py -v`

## Task 2 — ElevenLabs TTS handler

**Files:** new `voice_agent/elevenlabs_tts_handler.py`,
new `tests/test_elevenlabs_tts_handler.py`

- [x] `ElevenLabsTTSHandler.__init__(api_key: str)` — same constructor
      shape as `SarvamTTSHandler`.
- [x] `async def configure(self, language_code: str, speaker: str) -> None`
      — same signature. `speaker` here is the ElevenLabs `voice_id` (see
      decision 5's placeholders). Opens
      `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`
      with query params `output_format=pcm_24000&model_id=eleven_flash_v2_5&inactivity_timeout=180`,
      sends the `InitializeConnection` message (`{"text": " "}`).
- [x] `async def speak(self, text: str) -> AsyncGenerator[bytes, None]` —
      same signature. Sends `SendText` with `flush: true`, yields decoded
      PCM bytes read off `audio` fields until an `isFinal: true` message
      arrives (confirmed via live doc fetch 2026-08-16: server messages
      have no discriminator field — `AudioOutput` carries `audio`,
      `FinalOutput` carries `isFinal`, distinguished by field presence,
      not a `type` tag).
- [x] `keepalive()`, `close()`, `is_configured`, `start_keepalive()` — same
      shape as `SarvamTTSHandler`. `inactivity_timeout` set to 180s (the
      ElevenLabs max) on connect, ping every 30s — verified via web search
      2026-08-16 that the *default* inactivity_timeout is 20s, so setting
      it explicitly avoids relying on the default.
- [x] **Live smoke test — done 2026-08-17**, via `scripts/smoke_test_elevenlabs.py`
      against a real ElevenLabs key and a real audio file (user-supplied
      MP3, converted to WAV with ffmpeg). Output confirmed genuinely raw
      PCM at `pcm_24000` — **not** MP3-in-disguise, so decision 4's risk
      did not materialize.
      However, the smoke test surfaced a **different, real bug**, found
      via `superpowers:systematic-debugging`: `speak()` sent the flushed
      `SendText` but never signaled end-of-input, so ElevenLabs delivered
      the audio but never sent `isFinal` — the call hung until the
      connection's own `inactivity_timeout` (180s) killed it with
      `1008 policy violation`. Root cause: unlike Sarvam, which closes the
      connection proactively when speech is done, ElevenLabs waits for an
      explicit `{"text": ""}` (`CloseConnection`) before finishing.
      Confirmed via a raw, handler-bypassing probe (with vs. without that
      message — reproduced clean pass/hang on demand, twice), then fixed:
      `speak()` now sends `{"text": ""}` right after the flush. Existing
      unit test `test_speak_sends_text_with_flush` updated to assert both
      messages; TDD'd (watched it fail against pre-fix code first). Full
      suite green after the fix (197 passed). Re-ran the live smoke test
      end-to-end post-fix — completes in seconds, both STT and TTS pass.
- [x] Unit tests mirroring `tests/test_tts_handler.py`. 7/7 passing, TDD'd
      (watched red on missing module first, and again for the
      CloseConnection fix above). Full suite otherwise unaffected — same
      pre-existing DB-dependent failures as Task 1, unrelated to this
      change (now resolved anyway since local Supabase is up — see Task 5).

**Verify:** `pytest services/order-engine/tests/test_elevenlabs_tts_handler.py -v`
plus the live smoke test — both done, both passing as of 2026-08-17.

## Task 3 — Provider factory

**Files:** new `voice_agent/factory.py`, new `tests/test_voice_provider_factory.py`

- [x] `create_stt_handler(provider_name: str, sarvam_api_key: str, elevenlabs_api_key: str) -> SarvamSTTHandler | ElevenLabsSTTHandler`
      — `if provider_name == "elevenlabs": ... elif provider_name == "sarvam": ... else: raise ValueError(...)`,
      same shape as `src/llm/__init__.py:create_provider`.
- [x] `create_tts_handler(provider_name: str, sarvam_api_key: str, elevenlabs_api_key: str) -> SarvamTTSHandler | ElevenLabsTTSHandler`
      — same pattern.
- [x] 6 unit tests, TDD'd (watched red on missing module first): both
      providers construct the right handler type, unknown provider raises
      `ValueError` for both `create_stt_handler` and `create_tts_handler`.
      29/29 passing across Tasks 1-3's test files combined; Sarvam's own
      suite still untouched and green.

**Verify:** `pytest services/order-engine/tests/test_voice_provider_factory.py -v`

## Task 4 — Wire into session lifecycle

**Files:** `voice_agent/session_manager.py`, `backend/routers/voice.py`,
`backend/main.py`

- [x] `SessionManager.__init__` gains `elevenlabs_api_key: str = ""` and
      `tts_provider: str = "elevenlabs"` params — defaulted so any existing
      caller (tests, CLI) that doesn't pass them keeps working unchanged.
      Also store `stt_provider` (used by `routers/voice.py`, not internally
      by `SessionManager`, since STT handlers are created fresh per PTT
      press rather than held on the session). 5 new DB-independent unit
      tests (`tests/test_session_manager_provider_selection.py`), TDD'd.
- [x] `SessionManager.create_session()` — replace the hardcoded
      `SarvamTTSHandler(self._sarvam_api_key)` with
      `create_tts_handler(self._tts_provider, self._sarvam_api_key, self._elevenlabs_api_key)`.
      `test_session_manager.py`'s 8 patch sites moved from patching
      `SarvamTTSHandler` directly to patching `create_tts_handler` (the
      new call site) — same test intent, updated to match the refactor.
      Verified green (11/11) once local Supabase was brought up.
- [x] `routers/voice.py` line ~301 — replace the hardcoded
      `SarvamSTTHandler(mgr._sarvam_api_key)` with
      `create_stt_handler(mgr._stt_provider, mgr._sarvam_api_key, mgr._elevenlabs_api_key)`.
- [x] `routers/voice.py` `/voice/health` — extend to report both providers'
      reachability (Sarvam WS ping + ElevenLabs equivalent) rather than
      only Sarvam, so either can be checked regardless of which is active.
      3 new tests (`tests/test_voice_health.py`), TDD'd. Post-implementation
      `ponytail-review` caught the two nearly-identical try/except blocks
      as duplication — extracted to a shared `_check_reachable()` helper,
      `-12` lines, tests stayed green.
- [x] `backend/main.py` `lifespan()` — add
      `elevenlabs_api_key = os.environ.get("ELEVENLABS_API_KEY", "")`,
      `stt_provider = os.environ.get("STT_PROVIDER", "elevenlabs").strip().lower()`,
      `tts_provider = os.environ.get("TTS_PROVIDER", "elevenlabs").strip().lower()`,
      passed into `SessionManager(...)`. Missing-key case logs a warning
      (same pattern as the existing `if not sarvam_api_key: logger.warning(...)`
      at line 117-118) rather than raising — a misconfigured deploy should
      degrade loudly, not crash on startup. No dedicated test file (plain
      imperative bootstrap wiring, same shape as the existing `LLM_PROVIDER`
      pattern already in this function) — verified by syntax check and by
      the app booting correctly during the local Supabase work in Task 5.

**Verify:** `pytest services/order-engine/tests/test_session_manager_provider_selection.py tests/test_voice_health.py -v`

## Task 5 — Restaurant config + migration

**Files:** `voice_agent/restaurant_config.py`,
new `tests/test_restaurant_config_elevenlabs.py`,
new `supabase/migrations/0064_restaurant_elevenlabs_voice_config.sql`

- [x] `RestaurantConfig` dataclass gains
      `elevenlabs_voice_id: str | None = None` and
      `elevenlabs_fallback_voice_id: str | None = None`. Existing Sarvam
      `speaker`/`fallback_speaker` fields untouched.
- [x] `load_restaurant_config()` — extend the `SELECT` to also pull
      `elevenlabs_voice_id, elevenlabs_fallback_voice_id`. 2 new unit
      tests (psycopg2.connect mocked), TDD'd, both green.
- [x] Migration — additive columns only, same shape as `0028`. Numbered
      `0064` (repo is actually at 0063, not 0036 as the project CLAUDE.md
      states — that doc is stale):
      ```sql
      ALTER TABLE restaurants
        ADD COLUMN IF NOT EXISTS elevenlabs_voice_id          text,
        ADD COLUMN IF NOT EXISTS elevenlabs_fallback_voice_id text;

      UPDATE restaurants
      SET elevenlabs_voice_id          = 'pNInz6obpgDQGcFmaJgB',  -- Adam (placeholder)
          elevenlabs_fallback_voice_id = '21m00Tcm4TlvDq8ikWAM'   -- Rachel (placeholder)
      WHERE id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';           -- Silver SSC Hyd
      ```
      Apply to local Supabase (Docker) only per project convention — do not
      push to remote. **Applied** via `supabase db reset` (all 64 local
      migrations replayed against Docker, confirmed `"target":"local"` —
      remote `tabletot-staging` untouched). Verified by querying
      `restaurants`: Silver SSC Hyd got the two placeholder voice IDs,
      Sozo (out of scope for this plan) stayed `NULL`.
- [x] Regenerate Supabase TypeScript types after applying locally (per
      standing project convention — needed for both apps if either reads
      the `restaurants` table's typed columns). Ran
      `supabase gen types typescript --local` and applied the output to
      all three apps that vendor a generated types file (kiosk, pos,
      dashboard) — each diff is exactly the 2 new columns × 3 shapes
      (Row/Insert/Update), nothing else touched.

## Task 6 — Docs

- [x] This plan file, checkboxes updated as tasks complete.
- [x] Update `services/order-engine/CLAUDE.md`'s "Tech Stack" and
      "Environment Variables" tables to list both providers once wired,
      not just Sarvam. Also expanded "Sarvam API Quick Reference" into
      "Voice Provider API Quick Reference" with the ElevenLabs wire-format
      details (Task 1's corrected snake_case STT fields, Task 2's
      PascalCase TTS fields and no-discriminator server messages).
- [x] Add a short `docs/notes/2026-08-15-elevenlabs-voice-integration-implementation.md`
      recording the smoke-test outcome (Task 2) and the final voice IDs if
      they change from the placeholders. Updated 2026-08-17 with the actual
      smoke-test run, the bug it found, and the fix — voice IDs are still
      the plan's placeholders, unchanged.

---

## Explicitly out of scope

- **Removing Sarvam.** Not requested, not planned. Both handlers live
  side by side indefinitely unless a future decision says otherwise.
- **Cost comparison / usage-based provider selection.** Static env-var
  switch only — no runtime logic to pick a provider based on cost or load.
- **Telugu TTS.** Confirmed out of scope for this pilot (decision 3) — if
  it becomes needed later, that's a model change (`eleven_flash_v2_5` →
  `eleven_v3`/multilingual v2) with a latency/cost tradeoff to revisit at
  that time, not something this plan builds room for now.
- **India dedicated low-latency endpoint.** Enterprise-tier only; not
  pursued (decision 2).
- **Voice ID curation.** The two IDs in this plan are placeholders by
  design (decision 5) — picking final voices is a separate, human
  listening-test task, not something to resolve here.

## Verification gate

```
cd services/order-engine
pytest tests/ -v                                  # full existing suite — must stay green,
                                                    # Sarvam code paths are untouched
pytest tests/test_elevenlabs_stt_handler.py -v     # new
pytest tests/test_elevenlabs_tts_handler.py -v     # new
```

Plus the live smoke test in Task 2 (real ElevenLabs key, confirm PCM output
format is actually PCM). No golden-session/order-state changes expected —
this plan doesn't touch `orchestrator.py`, `resolver.py`, or menu matching,
confirmed unaffected in the investigation that preceded this plan.
