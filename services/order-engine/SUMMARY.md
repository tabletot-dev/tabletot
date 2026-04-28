# Menu Resolver — Project Summary

**Last updated:** 2026-04-19

## Status: Stage 3 Complete — Voice Layer + Two-Pass LLM (truthful replies)

Orchestrator now runs the LLM twice per turn: once to extract intents, and a second time (after the resolver) to write the customer-facing reply grounded in real outcomes. This closes the "LLM confirms items the resolver actually rejected" class of bug (e.g. STT mishears "cinnamon roll" as "cinema room", resolver returns NoMatch, but the old single-pass LLM had already replied "Got it, one cinnamon roll coming up!"). See `docs/ORCHESTRATOR.md` for the flow and `CHANGELOG.md` [Unreleased] for details.

## Status: Stage 3 Complete — Voice Layer (Sarvam STT + TTS live end-to-end)

| Stage | Description | Status |
|---|---|---|
| Stage 1 | Menu Resolver (deterministic) | ✅ Complete |
| Stage 2 | LLM Intent Extraction + Orchestrator | ✅ Complete |
| Stage 3 | Voice Layer (Sarvam STT + TTS) | ✅ Complete |
| Stage 4 | Kiosk PWA (React, touch + voice UI) | ⏳ Pending |
| Stage 5 | Integration & Hardening (Supabase, KDS) | ⏳ Pending |

Stage 3 voice pipeline is live end-to-end via `python -m cli.voice`. STT (saaras:v3), LLM, menu resolver, and TTS (bulbul:v3, `linear16` codec) are all validated across consecutive PTT presses with auto-reconnect. Remaining QA (multilingual native-script TTS, WAV-scenario regression, code-switch STT) is deferred to Stage 4 prep.

---

## What's Built

### Core Library (`src/`)

| Module | Purpose |
|---|---|
| `models.py` | All dataclasses — `MenuItem`, `VariantItem`, `IndexEntry`, `ResolveResult` union type |
| `normalizer.py` | Text normalization — lowercasing, accent stripping, filler word removal |
| `loader.py` | Loads `menu.json`, builds `MenuIndex` with flat entries, alias dict, lookups |
| `time_check.py` | Availability checking — category/item time windows and day-of-week |
| `resolver.py` | 5-step matching cascade — exact → alias → fuzzy → fuzzy partial → no match |
| `order_state.py` | In-memory order accumulator — add/remove/modify items, track totals |
| `orchestrator.py` | Wires LLM → Resolver → Order State per conversation turn |

### LLM Layer (`src/llm/`)

| Module | Purpose |
|---|---|
| `base.py` | Abstract `LLMProvider` interface + `LLMResponse` dataclass |
| `claude_provider.py` | Full Claude Sonnet implementation via Anthropic SDK |
| `intent_parser.py` | Parses `<intents>/<response>/<language>` tags from LLM output |
| `prompts/system_prompt.py` | Builds system prompt with menu, feedback, and order state sections |
| `prompts/menu_summary.py` | Generates simplified menu text for LLM context (no prices, no IDs) |

### Voice Backend (`backend/`)

| Module | Purpose |
|---|---|
| `main.py` | FastAPI app entry point — lifespan startup, `SessionManager` on `app.state` |
| `routers/voice.py` | Health, session start/end, STT WebSocket proxy, TTS WebSocket streamer |
| `config/restaurants.json` | Per-restaurant TTS config (language code, speaker, fallbacks) |

### Voice Agent Layer (`voice_agent/`)

| Module | Purpose |
|---|---|
| `stt_handler.py` | Per-PTT-press Sarvam saaras:v3 proxy — base64 PCM encoding, flush/finalize |
| `tts_handler.py` | Persistent Sarvam bulbul:v3 WebSocket — auto-reconnect, 30s keepalive |
| `session_manager.py` | `VoiceSession` + `SessionManager` — lazy TTS init, `tts_queue` decoupling |
| `restaurant_config.py` | `RestaurantConfig` loader from `restaurants.json` |

### CLI Tools (`cli/`)

| Module | Purpose |
|---|---|
| `interactive.py` | Stage 1 REPL — direct resolver testing |
| `batch.py` | Stage 1 batch test runner |
| `conversation.py` | Stage 2 multi-turn conversation mode with LLM |
| `voice.py` | Stage 3 PTT harness — mic capture, STT/TTS WebSocket client, resolver display |

### Test Suite (`tests/`)

| File | Tests | Coverage |
|---|---|---|
| `test_normalizer.py` | 23 | Lowercasing, whitespace, punctuation, accents, fillers |
| `test_loader.py` | 11 | Item/alias/category counts, variant expansion, modifiers |
| `test_time_check.py` | 9 | Breakfast/high-tea windows, unrestricted items, variant inheritance |
| `test_resolver.py` | 20 | All 5 cascade steps, variants, modifiers, unavailability |
| `test_order_state.py` | 16 | Add/remove/modify/confirm/clear, duplicate handling, dict outputs |
| `test_menu_summary.py` | 10 | No prices/IDs in output, categories, variants, modifiers, time windows |
| `test_intent_parser.py` | 15 | Valid/malformed/missing tags, action validation, quantity normalization |
| `test_orchestrator.py` | 14 | Full flow with MockProvider — add, remove, confirm, ambiguity, feedback |
| `test_stt_handler.py` | 5 | Base64 encoding, flush, interim/final protocol, VAD events |
| `test_tts_handler.py` | 6 | Config message, audio streaming, keepalive, close, reconnect guard |
| `test_session_manager.py` | 7 | Session lifecycle, missing restaurant, end_all |

---

## Test Results

- **Unit tests:** 136/136 passing
- **Batch test battery:** 98/98 passing (Stage 1)
- **Natural speech tests:** 46/48 passing (96%) — 2 are genuinely ambiguous inputs, known and accepted

---

## Menu Data

- **285 items**, **66 variants**, **~440 index entries**, **191 aliases**, **38 categories**
- 2 time-windowed categories: Breakfast (07:00–11:00 daily), High Tea (15:00–19:00 Mon–Fri)

---

## Architecture

```
PTT press → mic audio (PCM 16kHz)
        │
        ▼
FastAPI WS /voice/stt/{session}
        │
        ▼
Sarvam saaras:v3 STT
  PCM → base64 JSON → transcript
        │
        ▼
Orchestrator.process_turn(transcript)
  └── LLM (Claude Sonnet) — intent extraction
  └── Resolver (5-step cascade) — per intent
  └── OrderState — accumulate confirmed items
        │
        ▼
response_text → tts_queue → FastAPI WS /voice/tts/{session}
        │
        ▼
Sarvam bulbul:v3 TTS → PCM chunks → client plays audio
```

**Key design decisions:**
- LLM never sees prices or IDs — prevents hallucination of order data
- STT stateless per PTT press — fresh WebSocket per recording
- TTS persistent per table session — reconnects automatically on idle close
- `tts_queue` decouples the STT and TTS WebSocket handlers
- Touch input is first-class alongside voice (Stage 4)

---

## How to Run

```bash
source .venv/bin/activate

# Stage 1: direct resolver
python -m cli.interactive

# Stage 1: batch test
python -m cli.batch data/test_battery.txt

# Stage 2: LLM conversation (typed input)
python -m cli.conversation

# Stage 3: backend + voice CLI
uvicorn backend.main:app --host 0.0.0.0 --port 8000
python -m cli.voice  # separate terminal

# All unit tests
pytest tests/ -v

# Stage 3 integration test (WAV file injection)
python scripts/test_voice_pipeline.py
```
