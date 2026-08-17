# CLAUDE.md — Tabletot Voice Engine

This file is the source of truth for the project. Read it fully before making any changes.

---

## What This Is

A voice-first, tablet-based self-ordering system for **Silver Specialty Coffee**, a specialty coffee bar in Hyderabad. Customers speak their order in Hindi, Telugu, or English at a tablet mounted at their table. The system processes, confirms, and routes orders to a KDS (Kitchen Display System).

**Pilot scope:** 1–2 outlets, ~21-day timeline, no POS integration.

---

## Current Status

| Stage | Description | Status |
|---|---|---|
| Stage 1 | Menu Resolver (deterministic) | ✅ Complete |
| Stage 2 | LLM Intent Extraction + Orchestrator | ✅ Complete |
| Stage 3 | Voice Layer (Sarvam STT + TTS) | ✅ Complete |
| Stage 4 | Kiosk PWA (React, touch + voice UI) | ⏳ Pending |
| Stage 5 | Integration & Hardening (Supabase, KDS) | ⏳ Pending |

---

## Architecture

### Two-Layer Processing (core, do not change)

```
Natural language input
        │
        ▼
Layer 1: LLM — Pass 1 (configurable: Claude / OpenAI / Gemini)
  → Extracts structured intents: {action, raw_name, qty, modifiers, special_notes}
  → Receives: item names, categories, tags ONLY (never prices or IDs)
  → Outputs XML: <intents>, <language> tags
        │
        ▼
Layer 2: Menu Resolver (deterministic Python)
  → Matches intents to canonical menu.json
  → 5-step cascade: exact → alias → fuzzy token_sort → fuzzy partial → no-match
  → Returns: ConfidentMatch | NeedsVariantSelection | Ambiguous | NoMatch | Unavailable
        │
        ▼
Layer 1: LLM — Pass 2 (streaming)
  → Generates customer-facing reply grounded in real resolver outcomes
  → Streams sentence-by-sentence directly into TTS queue
        │
        ▼
Order State Manager
  → Accumulates confirmed items
  → Tracks quantities, modifiers, totals
```

**Rule:** LLM never sees prices or IDs. Ever. This prevents hallucination of order data.

### Voice Pipeline (Stage 3)

```
PTT pressed → mic audio (PCM 16kHz)
        │
        ▼
FastAPI /voice/stt WebSocket (proxy)
        │
        ▼
Sarvam saaras:v3 STT
  → language_code: unknown (auto-detect)
  → flush_signal: True (PTT release = immediate finalize)
  → vad_signals: True (interim feedback)
        │
        ▼
Orchestrator.process_turn_streaming(transcript)
  → Pass 1 (sync, in thread): extract intents → resolver → order state
  → Pass 2 (async stream): LLM generates reply sentence by sentence
        │
        ▼  ← sentences yielded here as they arrive, not after full response
FastAPI /voice/tts WebSocket (persistent per session)
        │
        ▼
Sarvam bulbul:v3 TTS
  → configured once per session (language from restaurant config)
  → speaks each sentence as it arrives in the queue
  → sends speech_complete after TURN_END sentinel
        │
        ▼
Client plays audio — first sentence starts ~1–2s before LLM finishes
```

### Dual Input Model

- **Voice path:** PTT → STT → LLM → Resolver → TTS
- **Touch path:** Browse → Tap → Variant picker (bypasses LLM entirely)
- Both paths write to shared order state
- Touch is first-class, not a fallback

---

## Tech Stack

| Layer | Technology |
|---|---|
| STT | Configurable via `STT_PROVIDER` env var: `elevenlabs` (default, Scribe v2 Realtime) / `sarvam` (`saaras:v3`) |
| TTS | Configurable via `TTS_PROVIDER` env var: `elevenlabs` (default, `eleven_flash_v2_5`) / `sarvam` (`bulbul:v3`) |
| LLM | Configurable via `LLM_PROVIDER` env var: `claude` (default) / `openai` / `gemini` |
| Backend | Python FastAPI (modular monolith) |
| Database | Supabase PostgreSQL (`ap-south-1`) |
| Frontend | React PWA (Android Chrome, kiosk mode) |
| Auth (Sarvam) | `api-subscription-key` header |
| Auth (ElevenLabs) | `xi-api-key` header |

Both STT and TTS providers are selected independently via `create_stt_handler()`/
`create_tts_handler()` (`voice_agent/factory.py`) — same shape as
`LLM_PROVIDER`'s `create_provider()`. Sarvam remains fully wired as a
fallback; see `docs/plans/2026-08-15-elevenlabs-voice-integration.md`.

**Removed:** LiveKit, Deepgram, Cartesia — all gone.

---

## Repository Structure

```
/
├── backend/                    # FastAPI app
│   ├── main.py
│   ├── routers/
│   │   └── voice.py            # Stage 3: STT/TTS/session endpoints
│   └── config/
│       └── restaurants.json    # Per-restaurant language/speaker config
│
├── voice-agent/                # Renamed from /livekit-agent
│   ├── stt_handler.py          # SarvamSTTHandler (per-press WebSocket)
│   ├── tts_handler.py          # SarvamTTSHandler (persistent WebSocket + keepalive)
│   ├── session_manager.py      # VoiceSession + SessionManager
│   └── restaurant_config.py   # RestaurantConfig loader
│
├── src/                        # Core library (Stages 1 & 2)
│   ├── models.py
│   ├── normalizer.py
│   ├── loader.py
│   ├── time_check.py
│   ├── resolver.py
│   ├── order_state.py
│   ├── orchestrator.py
│   └── llm/
│       ├── base.py
│       ├── _sentence_splitter.py   # shared streaming helper
│       ├── claude_provider.py
│       ├── openai_provider.py
│       ├── gemini_provider.py
│       ├── intent_parser.py
│       └── prompts/
│           ├── system_prompt.py
│           └── menu_summary.py
│
├── cli/
│   ├── interactive.py          # Stage 1 REPL
│   ├── batch.py                # Stage 1 batch runner
│   ├── conversation.py         # Stage 2 multi-turn CLI
│   └── voice.py                # Stage 3 voice CLI (PTT + audio)
│
├── kiosk-pwa/                  # React PWA (Stage 4)
│
├── tests/
├── review/
├── data/
│   ├── menu.json               # Canonical menu (source of truth)
│   ├── test_battery.txt
│   └── conversation_tests/
│
└── scripts/
    └── test_voice_pipeline.py  # Stage 3 WAV file integration test
```

---

## Key Files

### `data/menu.json`
Canonical menu. **Never auto-generate or modify programmatically during runtime.** Developer-edited only. Contains items, variants, aliases, time windows, add-on groups.

### `src/llm/prompts/system_prompt.py`
Builds the LLM system prompt. Must include:
- Simplified menu context (names/categories/tags — no prices, no IDs)
- Current order state summary
- Resolver feedback from previous turn
- **Script instruction:** "Always respond in native script. Devanagari for Hindi, Telugu script for Telugu, Roman for English. Never romanize Indic languages."

### `backend/config/restaurants.json`
Per-restaurant TTS configuration:
```json
{
  "silver-ssc-hyd": {
    "name": "Silver Specialty Coffee Hyderabad",
    "language_code": "hi-IN",
    "speaker": "meera",
    "fallback_language_code": "en-IN",
    "fallback_speaker": "ishita"
  }
}
```

---

## Voice Provider API Quick Reference

Two providers are wired, selected independently per STT/TTS via
`STT_PROVIDER`/`TTS_PROVIDER` (both default to `elevenlabs`, both fall back
to `sarvam`). See `voice_agent/factory.py` and
`docs/plans/2026-08-15-elevenlabs-voice-integration.md`.

### Sarvam STT WebSocket
- Endpoint: `wss://api.sarvam.ai/speech-to-text/ws`
- Model: `saaras:v3`
- Language: `unknown` (auto-detect)
- Mode: `transcribe`
- Audio: PCM `pcm_s16le` at 16kHz (WAV also supported; MP3/AAC NOT supported)
- `flush_signal=True` — PTT release triggers immediate finalize
- `vad_signals=True` — get `speech_start`/`speech_end` events
- **Session:** Open/close per PTT press (stateless)

### Sarvam TTS WebSocket
- Endpoint: `wss://api.sarvam.ai/text-to-speech/ws`
- Model: `bulbul:v3`
- Config sent once after connect: `speaker`, `target_language_code`, `pace`, `min_buffer_size`, `max_chunk_length`, `output_audio_codec`
- `bulbul:v3` does NOT support `pitch` or `loudness`
- Pace range: 0.5–2.0
- Output codec: `linear16` (raw PCM s16le @ 24 kHz). **Do not send `"pcm"`** — the server rejects it with a misleading `422 "Input parameters has to be a valid dictionary"` error. Audio arrives as base64 inside `{"type":"audio","data":{"audio":"…"}}` JSON frames, not raw binary
- Keep alive: ping every 30s (auto-closes after 60s inactivity)
- `send_completion_event=True` to know when speech ends
- **Session:** Persistent per table session

### Sarvam Auth
Header: `api-subscription-key: <SARVAM_API_KEY>`
Env var: `SARVAM_API_KEY`

### ElevenLabs STT WebSocket (Scribe v2 Realtime)
- Endpoint: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- Model: `scribe_v2_realtime`
- Audio: `audio_format=pcm_16000` (matches the mic's existing 16kHz PCM)
- Client sends `input_audio_chunk` messages (`audio_base_64`, `commit`, `sample_rate` — **snake_case**, not the `InputAudioChunk`/PascalCase the plan originally assumed)
- Server sends `session_started` / `partial_transcript` / `committed_transcript` — no `speech_start`/`speech_end` events exist on this API, unlike Sarvam
- **Session:** Open/close per PTT press (stateless) — same lifecycle as Sarvam

### ElevenLabs TTS WebSocket
- Endpoint: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`
- Model: `eleven_flash_v2_5` (~75ms latency)
- Query params: `output_format=pcm_24000&model_id=eleven_flash_v2_5&inactivity_timeout=180` — the timeout is set explicitly since the API default is only 20s (vs. Sarvam's fixed 60s)
- Client sends `InitializeConnection` (`{"text": " "}`) then `SendText` (`{"text": ..., "flush": true}`) — these ARE PascalCase-shaped field names per the real API, unlike the STT side
- Server messages have **no discriminator field** — an `audio` key means audio data, an `isFinal` key means done
- **Session:** Persistent per table session — same lifecycle as Sarvam

### ElevenLabs Auth
Header: `xi-api-key: <ELEVENLABS_API_KEY>`
Env var: `ELEVENLABS_API_KEY`

---

## Environment Variables

```
# Voice — provider selection (default: elevenlabs, falls back to sarvam)
STT_PROVIDER=elevenlabs      # elevenlabs | sarvam
TTS_PROVIDER=elevenlabs      # elevenlabs | sarvam
SARVAM_API_KEY=
ELEVENLABS_API_KEY=

# LLM — provider selection (default: claude)
LLM_PROVIDER=claude          # claude | openai | gemini
LLM_MODEL=                   # must be set explicitly; blank = provider default

# LLM API keys — only the one matching LLM_PROVIDER is required at runtime
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Database (Stage 5)
SUPABASE_URL=
SUPABASE_KEY=
```

The backend selects the correct API key automatically based on `LLM_PROVIDER`.
Missing `SARVAM_API_KEY`/`ELEVENLABS_API_KEY` logs a warning at startup
rather than crashing — a misconfigured deploy should degrade loudly, not
fail to boot.

---

## Test Counts

| Suite | Count | Status |
|---|---|---|
| Unit tests (all) | 151/151 | ✅ |
| Batch test battery | 98/98 | ✅ |
| Natural speech tests | 46/48 (96%) | ✅ |
| Silver voice intent tests | 15/15 | ✅ |

2 failing natural speech tests are genuinely ambiguous inputs — known and accepted.

Silver intent tests (`tests/test_silver_voice_intents.py`) cover: single add, multi-add, qty add, remove, remove-not-in-order, modify qty, ambiguous, no-match, ask-menu, confirm empty, confirm with items, full 4-turn happy path. Run offline — no API calls, no audio required.

---

## Pilot Scope — What Is Explicitly Excluded

- ❌ Petpooja POS integration (post-pilot)
- ❌ Payment processing
- ❌ Admin/manager dashboard
- ❌ Phone number entry screen
- ❌ Multi-tenant admin UI
- ✅ Orders route: Supabase → `POST /orders` → existing KDS PoC

---

## Non-Negotiable Rules

1. **LLM never sees prices or IDs.** `menu_summary.py` enforces this. Do not break it.
2. **Touch is first-class.** Never treat touch as a fallback for voice.
3. **Native script only in TTS responses.** No romanized Hindi/Telugu ever reaches Sarvam TTS.
4. **menu.json is the source of truth.** No runtime writes. No CMS. Developer-edited only.
5. **Alias dictionary grows from real transcripts.** Do not pre-specify exhaustively.
6. **STT is stateless per PTT press.** Do not persist STT connections between presses.
7. **TTS is stateful per table session.** Do not open/close TTS on every response.

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
python -m cli.conversation --provider openai --model gpt-4o-mini
python -m cli.conversation --provider gemini --model gemini-2.5-flash

# Stage 3: voice (PTT + audio)
python -m cli.voice

# All unit tests (no API calls, no audio required)
pytest tests/ -v

# Stage 3 integration test (WAV file injection, needs running backend + API keys)
python scripts/test_voice_pipeline.py data/conversation_tests/simple_order.wav --inprocess
```

---

## ADR Index

| ADR | Decision |
|---|---|
| 007 | Two-layer processing (LLM + deterministic resolver) |
| 008 | Dual input model (touch + voice, both first-class) |
| 009 | No Petpooja for pilot |
| 010 | JSON over YAML for menu schema |
| 011 | PTT over always-on voice activation |
| 012 | Sarvam AI for STT + TTS (replaces Deepgram + Cartesia) |
| 013 | LiveKit removed — direct WebSocket to Sarvam via FastAPI proxy |
| 014 | STT stateless per PTT press; TTS persistent per table session |
