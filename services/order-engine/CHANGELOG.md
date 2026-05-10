# Changelog

All notable changes to the Menu Resolver project.

---

## [Unreleased]

### Added

- **Silver Specialty Coffee restaurant** (`backend/config/restaurants.json`) — added `silver-ssc-hyd` entry with `language_code: en-IN`, `speaker: rohan`, and `db_restaurant_id: b22b5d53-6dd8-4f5b-8276-2e828cd1ab91`. The `db_restaurant_id` field lets `SessionManager._resolve_restaurant_slug` accept the Supabase UUID sent by the kiosk (`VITE_RESTAURANT_ID`) in addition to the slug key, fixing a 404 on `POST /voice/session/start`.
- **DB alias loading** (`src/loader.py`) — `MenuIndex` now loads item aliases from the `menu_item_aliases` Supabase table (scoped by `restaurant_id`) in addition to aliases defined in the menu JSON. Refreshes every 5 minutes; falls back to JSON-only aliases on DB error.
- **Menu from Supabase DB** (`src/loader.py`) — menu items are loaded from the `menu_items` Supabase table with a 5-minute cache and `menu.json` fallback for offline/dev use.

### Fixed

- **Voice 404 on session start** — `POST /voice/session/start` returned 404 when the kiosk sent a Supabase UUID as `restaurant_id` (instead of the slug key). Root cause: `restaurants.json` had no `db_restaurant_id` field for Silver, so `_resolve_restaurant_slug` found no match. Fixed by adding the field; no code changes required.

### Changed

- **Two-pass LLM flow in Orchestrator** (`src/orchestrator.py`, `src/llm/`) — the customer-facing reply is now generated AFTER the resolver runs, eliminating hallucinated confirmations.
  - Pass 1 (`extract_intents`): parses transcript into structured intents + language only. No user-facing text.
  - Resolver runs; per-intent `turn_outcomes` are built (`added`, `no_match`, `ambiguous`, `needs_variant`, `unavailable`, etc.).
  - Pass 2 (`generate_response`): writes the natural-language reply with the extracted intents, real turn outcomes, and the updated order state. Hard rule in the prompt: never confirm an item that isn't under "Successfully processed".
  - Fixes the "Got it, one cinnamon roll coming up!" bug where the LLM confirmed items the resolver had actually rejected (e.g. STT-misheard "cinema room"). Also fixes the follow-up "I have the cinnamon roll added now" hallucination where no `add_item` intent was even emitted.
  - `LLMProvider` interface gains `generate_response`. Stub providers (OpenAI, Gemini) updated to match. `build_system_prompt` renamed to `build_intent_extraction_prompt`; new `build_response_prompt` added.
  - Tokens and raw output from both passes are merged into the single `LLMResponse` on `TurnResult`, so existing loggers and the voice router keep working unchanged.
  - Cost: one extra LLM call per turn (~400–700ms). Absorbed by TTS streaming — the customer hears audio as pass-2 tokens arrive.

### Fixed

- **PTT hang on STT timeout / silence** (`backend/routers/voice.py`, `voice-test-page/src/sttClient.ts`, `voice-test-page/src/App.tsx`, `voice-test-page/src/types.ts`) — when Sarvam STT timed out after flush (e.g. brief silence, network hiccup), `transcribe_session` returned `None` and the backend exited the handler silently with no message to the client. `pressStatus` stayed stuck at `"processing"` forever.
  - Backend: added `else` branch to send `{"type": "no_speech"}` when `final_transcript` is empty.
  - Frontend (`sttClient.ts`): added `terminalReceived` flag; on `ws.onclose`, emits a synthetic `no_speech` if no terminal message (`done`/`error`/`no_speech`) was received — covers any future silent-close edge case.
  - Frontend (`App.tsx`): `no_speech` resets `pressStatus` to `"idle"` and briefly shows "Didn't catch that — try again" in the transcript area (auto-clears after 2.5 s).
  - `types.ts`: added `{ type: "no_speech" }` to `SttMessage` union.

- **PTT barge-in during TTS playback** (`backend/routers/voice.py`, `voice-test-page/src/ttsClient.ts`, `voice-test-page/src/App.tsx`) — two bugs that caused the PTT button to hang in "Processing…" while TTS was still speaking:
  - `voice.py`: `process_turn` was a synchronous call inside an `async def` WebSocket handler, blocking the entire event loop for 2–5 s during LLM processing. TTS audio delivery was frozen for that window. Fixed with `asyncio.to_thread` — LLM calls now run in a thread pool; TTS streams uninterrupted.
  - `ttsClient.ts` / `App.tsx`: pressing PTT while TTS was playing left the old audio running under the new recording. Added `bargeIn()` to `TtsClientHandle`: closes the current `AudioContext` (drops all scheduled `BufferSource` nodes instantly) and creates a fresh one, leaving the persistent TTS WebSocket untouched. `startPress` now calls `bargeIn()` before opening the mic.

- **TTS WebSocket wire protocol** (`voice_agent/tts_handler.py`) — three separate bugs, all surfaced by Sarvam as the same misleading `422 "Input parameters has to be a valid dictionary"` error:
  - Config codec `"pcm"` is not a valid enum value for `bulbul:v3`; switched to `"linear16"` (the docs list `pcm`, but the server rejects it).
  - Send-text message type was `"convert"`; the server accepts `"text"` (matches Sarvam's updated WebSocket reference).
  - Audio frames arrive as text frames of the form `{"type":"audio","data":{"audio":"<base64>"}}`, not as raw binary; `speak()` now base64-decodes the payload before yielding.
  - Completion is signalled by `{"type":"event","data":{"event_type":"final"}}`, not `type:"complete"`; reception of the `final` event now ends the per-utterance loop cleanly. Server `error` frames are now logged and also break the loop.
- **Docs** — `CLAUDE.md` and `stage-3-voice-layer.md` now document the correct codec, message types, and audio-frame envelope; `tests/test_tts_handler.py` updated to assert the corrected protocol.

---

## [0.3.0] — 2026-04-16

### Added

- **FastAPI voice backend** (`backend/`)
  - `main.py` — app entry point with lifespan startup, env loading, `SessionManager` wired to `app.state`
  - `routers/voice.py` — four endpoints: `GET /voice/health`, `POST /voice/session/start`, `POST /voice/session/end`, `WS /voice/stt/{session_id}`, `WS /voice/tts/{session_id}`
  - `config/restaurants.json` — per-restaurant TTS config (language, speaker, fallbacks)

- **Voice agent layer** (`voice_agent/`)
  - `stt_handler.py` — `SarvamSTTHandler`: per-PTT-press Sarvam saaras:v3 proxy; encodes PCM as base64 JSON per the real Sarvam protocol; handles progressive transcripts (no `is_final` flag); sends `flush`, waits up to 10s for finalization
  - `tts_handler.py` — `SarvamTTSHandler`: persistent Sarvam bulbul:v3 WebSocket per table session; auto-reconnects if Sarvam closes due to inactivity; 30s keepalive ping; stores config for reconnection
  - `session_manager.py` — `SessionManager` + `VoiceSession`: in-memory session store, lazy TTS init, `tts_queue` decouples STT endpoint from TTS endpoint
  - `restaurant_config.py` — `RestaurantConfig` loader from `restaurants.json`

- **Stage 3 CLI** (`cli/voice.py`)
  - PTT (push-to-talk) harness using `pynput` + `sounddevice`; hold SPACE to speak, release to flush
  - Connects to backend STT and TTS WebSockets; plays audio chunks as they stream
  - Prints transcript, LLM response, **resolver results**, and running order total per turn

- **Resolver output in voice flow** (`backend/routers/voice.py`)
  - `_serialize_resolver_results()` — converts `ResolverCall` list to JSON-serializable dicts
  - `done` message now includes `resolver` (per-intent match type, method, score, applied) and `order` (snapshot with item count and total)

- **Stage 3 test suite** (`tests/`)
  - `test_stt_handler.py` (5 tests) — base64 encoding of PCM, flush forwarding, interim/final protocol, VAD events, final transcript return
  - `test_tts_handler.py` (6 tests) — config message, audio chunk streaming, text+flush sending, keepalive ping, close, unconfigured guard
  - `test_session_manager.py` (7 tests) — session lifecycle, missing restaurant, duplicate session IDs, end_all

- **Stage 3 integration test** (`scripts/test_voice_pipeline.py`) — WAV file injection end-to-end test

### Fixed

- **STT protocol bug** — original code sent raw binary PCM frames; Sarvam saaras:v3 requires JSON `{"audio": {"data": <base64>, "sample_rate": "16000", "encoding": "audio/wav"}}`. Fixed encoding and response parsing (real envelope is `{type, data}`, not flat `{type, transcript, is_final}`).
- **TTS idle disconnect** — Sarvam closes the bulbul:v3 WebSocket after a short inactivity window. Added `_ensure_connected()` check before every `speak()` call; auto-reconnects and re-sends config without interrupting the session.

### Changed

- `pyproject.toml` — added `fastapi`, `uvicorn[standard]`, `websockets>=12.0`, `sounddevice`, `pynput`, `numpy`, `httpx`, `certifi` to runtime dependencies
- `CLAUDE.md` — updated repository structure; Stage 3 architecture section added (voice pipeline diagram, dual-input model, Sarvam API quick reference, ADRs 012–014)

### Test Counts

| Suite | Count | Status |
|---|---|---|
| Unit tests | 136/136 | ✅ |
| Batch test battery | 98/98 | ✅ |
| Natural speech tests | 46/48 (96%) | ✅ |

---

## [0.2.0] — 2026-04-12

### Added

- **LLM intent extraction layer** (`src/llm/`)
  - `base.py` — abstract `LLMProvider` interface and `LLMResponse` dataclass
  - `claude_provider.py` — full Claude Sonnet implementation via Anthropic SDK with error handling
  - `openai_provider.py` — OpenAI stub (`NotImplementedError`)
  - `gemini_provider.py` — Gemini stub (`NotImplementedError`)
  - `intent_parser.py` — parses `<intents>/<response>/<language>` XML tags from LLM output, validates actions, normalizes quantities
  - `prompts/system_prompt.py` — builds dynamic system prompt with menu context, resolver feedback, and order state sections
  - `prompts/menu_summary.py` — generates simplified menu text for LLM context (no prices, no IDs)
  - `__init__.py` — provider factory function `create_provider()`

- **Order state manager** (`src/order_state.py`)
  - `OrderItem` dataclass and `OrderState` class
  - Add/remove/modify/confirm/clear operations
  - Duplicate detection (same item_id + same notes = increment quantity)
  - `to_summary_dict()` for LLM context (no prices/IDs), `to_display_dict()` for CLI

- **Orchestrator** (`src/orchestrator.py`)
  - `Orchestrator` class — wires LLM → Resolver → Order State
  - `process_turn()` — processes one conversation turn through the full pipeline
  - Handles all intent actions: add, remove, modify, select_variant, confirm, ask_menu, none
  - Generates resolver feedback (ambiguous, needs_variant, no_match, unavailable, not_in_order, empty_order)
  - Rolling conversation history window (last 10 turns)

- **Conversation CLI** (`cli/conversation.py`)
  - Multi-turn conversation mode with LLM-powered intent extraction
  - Commands: `!order`, `!clear`, `!provider`, `!raw`, `!history`, `!stats`, `!failures`, `!time`, `!verdict`
  - Per-turn review with failure layer tracking (llm/resolver/orchestrator)
  - Provider switching mid-session

- **Review system extension** (`review/logger.py`)
  - New `conversation_turns` table for Stage 2 logging
  - `log_turn()` — logs full turn data (LLM output, intents, resolver results, order state)
  - `get_turn_stats()` — stats by verdict, failure layer, and provider
  - `get_turn_failures()` — filtered failure list
  - `update_turn_verdict()` — update verdict with failure layer

- **Stage 2 test suite** — 55 new unit tests
  - `tests/test_order_state.py` (16 tests) — all OrderState operations
  - `tests/test_menu_summary.py` (10 tests) — no prices/IDs, categories, variants, modifiers
  - `tests/test_intent_parser.py` (15 tests) — valid/malformed/missing tags, validation
  - `tests/test_orchestrator.py` (14 tests) — full flow with MockProvider

- **Conversation test scenarios** (`data/conversation_tests/`)
  - `simple_order.txt` — basic English order + confirmation
  - `multi_item.txt` — Hindi quantities, code-switching, 4-item order
  - `modification.txt` — remove item, add replacement
  - `ambiguity.txt` — ambiguous input → clarification → resolution
  - `hindi_mixed.txt` — stress test with 6 items, Hindi-English-Telugu mixing

- **Environment setup**
  - `data/.env.example` — API key template
  - `.env` added to `.gitignore`

### Changed

- **menu.json** — added 17 new aliases for common abbreviated/colloquial names:
  - Shakes: `kunafa shake`, `bounty shake`, `peanut shake`, `berry shake`, `biscoff shake`
  - Food: `chicken pulao`, `udon noodles`, `veg sandwich`, `cheese pizza`, `fish and chips`, `fish n chips`, `fried fish`
  - Drinks: `frappe`, `cold frappe`, `kunafa` (standalone)
- **README.md** — updated for Stage 2 with conversation mode docs and revised architecture diagram
- **SUMMARY.md** — updated with Stage 2 modules, test counts, and architecture

### Dependencies

- `anthropic` — Claude API SDK (primary LLM provider)
- `python-dotenv` — load API keys from `.env`

---

## [0.1.0] — 2026-04-12

### Added

- **Core library** — full Stage 1 implementation
  - `src/models.py` — dataclasses for `MenuItem`, `VariantItem`, `IndexEntry`, and `ResolveResult` union (`ConfidentMatch`, `NeedsVariantSelection`, `Ambiguous`, `NoMatch`, `Unavailable`)
  - `src/normalizer.py` — text normalization (lowercase, accent stripping, filler removal, `&`/`n'` substitution, hyphens-to-spaces)
  - `src/loader.py` — menu.json loader and `MenuIndex` builder with flat entries, alias dict, and item/variant/category lookups
  - `src/time_check.py` — time-of-day and day-of-week availability checking against category and item windows
  - `src/resolver.py` — 5-step matching cascade (exact → alias → fuzzy token_sort → fuzzy partial → no match)

- **Review system**
  - `review/logger.py` — SQLite interaction logger with verdict tracking
  - `review/reporter.py` — formatted stats, failure lists, and recent interaction views

- **CLI tools**
  - `cli/interactive.py` — interactive REPL with commands: `!stats`, `!failures`, `!recent`, `!search`, `!aliases`, `!time`, `!batch`, `!verdict`, `!help`, `!quit`
  - `cli/batch.py` — batch test runner with `input | expected` format and auto-verdicts
  - `cli/_format.py` — shared output formatting for all result types

- **Test suite** — 63 unit tests across 4 test files
  - `tests/test_normalizer.py` (23 tests)
  - `tests/test_loader.py` (11 tests)
  - `tests/test_time_check.py` (9 tests)
  - `tests/test_resolver.py` (20 tests)

- **Test battery** — `data/test_battery.txt` with 98 cases (exact, alias, fuzzy, variant, ambiguous, no-match)

- **Project scaffolding** — `pyproject.toml`, `.gitignore`, `README.md`, `CLAUDE.md`, docs/

### Changed

- **menu.json** — removed misleading `ramen → jampong_ramen` alias (4 ramen items exist; generic "ramen" should be ambiguous). Reformatted to compact one-item-per-line layout.

### Tuning

- Fuzzy step 3 uses `token_sort_ratio` only (not combined with `partial_ratio`) — prevents short-input false matches
- Fuzzy step 4 uses `partial_ratio` only with threshold 90 (raised from spec's 85) and 4-char minimum input length
- Single-word variant names (e.g. "Masala", "Plain") excluded from bare index entries — only reachable via compound forms or aliases
- Single-word index fallback from `normalize_for_index` removed — caused collisions between items sharing a word (e.g. "americano" vs "iced americano")
