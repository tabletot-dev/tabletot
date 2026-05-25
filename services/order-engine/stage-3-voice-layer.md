# Stage 3 — Voice Layer

**Status:** ✅ Complete (2026-04-17) — live PTT round trip verified; 3 DoD items deferred to live multilingual QA (see below)  
**Depends on:** Stage 1 (Menu Resolver ✅), Stage 2 (LLM Intent Extraction ✅)  
**Goal:** Wrap the existing `conversation.py` CLI pipeline with real audio — Sarvam STT in, Sarvam TTS out — over a FastAPI backend.

---

## What Stage 3 Is NOT

- No PWA, no React, no browser yet
- No Supabase writes yet
- No table session management via HTTP yet
- No kiosk UI

Stage 3 is: **mic → transcript → orchestrator → audio response**, testable from a terminal or a single test script.

---

## Architecture

```
[Voice CLI / Test Client]
        │
        │  PTT pressed → WAV chunks over WebSocket
        ▼
[FastAPI /voice/stt  WebSocket]
        │
        │  Proxy audio to Sarvam STT WebSocket
        │  Stream interim transcripts back to client
        ▼
[Sarvam saaras:v3 STT]
        │
        │  Final transcript on flush
        ▼
[FastAPI internal]
        │
        │  transcript → Orchestrator.process_turn()
        │  (LLM intent extraction → Menu Resolver → Order State)
        ▼
[Confirmation text (native script)]
        │
        │  Text → Sarvam TTS WebSocket (persistent per session)
        ▼
[Sarvam bulbul:v3 TTS]
        │
        │  Audio chunks streamed back to client
        ▼
[Voice CLI / Test Client plays audio]
```

---

## Sarvam API Reference

### Authentication
All requests use header: `api-subscription-key: <SARVAM_API_KEY>`  
Set in `.env` as `SARVAM_API_KEY=...`

### STT — saaras:v3
**Endpoint:** `wss://api.sarvam.ai/speech-to-text/ws`

**Connection parameters:**
| Parameter | Value for this project |
|---|---|
| `model` | `saaras:v3` |
| `language_code` | `unknown` (auto-detect Hindi/Telugu/English) |
| `mode` | `transcribe` |
| `flush_signal` | `True` (PTT release triggers immediate finalization) |
| `vad_signals` | `True` (get `speech_start`/`speech_end` events) |
| `input_audio_codec` | `pcm_s16le` |
| `sample_rate` | `16000` |

**Supported audio formats for streaming:** WAV or raw PCM only. MP3/AAC/OGG not supported.  
**Recommended:** `pcm_s16le` at 16kHz — matches `MediaRecorder` output on Android Chrome.

**PTT flow:**
1. PTT pressed → open STT WebSocket, start streaming PCM chunks via `ws.transcribe()`
2. PTT released → call `ws.flush()` → final transcript returned
3. Close STT WebSocket

**Message types received:**
- `speech_start` — mic activity detected
- `speech_end` — silence detected
- `transcript` — final transcribed text (after flush)

---

### TTS — bulbul:v3
**Endpoint:** `wss://api.sarvam.ai/text-to-speech/ws`

**Connection parameters:**
| Parameter | Value |
|---|---|
| `model` | `bulbul:v3` |
| `send_completion_event` | `True` |

**Config message (sent once after connect):**
```json
{
  "type": "config",
  "data": {
    "speaker": "meera",
    "target_language_code": "hi-IN",
    "pace": 1.0,
    "min_buffer_size": 50,
    "max_chunk_length": 150,
    "output_audio_codec": "linear16"
    // Note: Sarvam rejects codec "pcm" with an enum-validation error
    // (misleadingly reported as "Input parameters has to be a valid
    // dictionary"). Use "linear16" for raw PCM s16le output.
    // bitrate is not applicable to linear16.
  }
}
```

**Speaker recommendations:**
| Language | Female | Male |
|---|---|---|
| Hindi (`hi-IN`) | priya, suhani | shubh, ashutosh |
| Telugu (`te-IN`) | neha, priya | shubh, ratan |
| English (`en-IN`) | ishita | ratan |

**Language is set per restaurant in backend config — not per request.**

**Session lifecycle:**
- Open on table session start → configure once
- Send text via `{"type": "text", "data": {"text": ...}}` + `{"type": "flush"}` per confirmation (the Python SDK wraps these as `ws.convert(text)` + `ws.flush()`)
- Keep alive with `ping` every 30 seconds
- Auto-closes after 1 minute inactivity
- Close on table session end (order confirmed)

**bulbul:v3 notes:**
- Does NOT support `pitch` or `loudness` params (v2 only)
- Pace range: 0.5–2.0
- Default sample rate: 24000 Hz
- Preprocessing always enabled

---

## FastAPI Endpoints — Stage 3

### `GET /voice/health`
Simple health check. Returns Sarvam connectivity status.

---

### `WebSocket /voice/stt/{session_id}`
Per PTT press. Opens, streams, flushes, closes.

**Flow:**
1. Client connects
2. Client streams binary PCM audio chunks as WebSocket binary messages
3. Backend proxies to Sarvam STT WebSocket
4. Backend forwards interim events back to client as JSON:
   - `{"type": "interim", "text": "ek hakka noodles..."}` 
   - `{"type": "final", "text": "ek Hakka Noodles dena chicken wala"}`
5. Client sends `{"type": "flush"}` JSON message → backend calls `ws.flush()` on Sarvam
6. Final transcript returned → backend passes to orchestrator → TTS response triggered

---

### `WebSocket /voice/tts/{session_id}`
Persistent per table session.

**Flow:**
1. Client connects on session start
2. Backend opens Sarvam TTS WebSocket, sends config (language from restaurant config)
3. When orchestrator produces confirmation text → backend sends `{"type": "text", "data": {"text": …}}` + `{"type": "flush"}` to Sarvam
4. Sarvam streams `{"type": "audio", "data": {"audio": "<base64 PCM>"}}` JSON frames; backend base64-decodes and forwards to the client as binary WebSocket messages (raw linear16 PCM @ 24 kHz)
5. Client plays audio chunks via Web Audio API as they arrive
6. Backend sends `{"type": "ping"}` to Sarvam every 30s to keep alive

---

### `POST /voice/session/start`
```json
{ "table_id": "T-01", "restaurant_id": "silver-ssc-hyd" }
```
Creates a session, opens persistent TTS WebSocket, returns `session_id`.

---

### `POST /voice/session/end`
```json
{ "session_id": "..." }
```
Closes TTS WebSocket, clears order state, ends session.

---

## New Modules

### `voice_agent/stt_handler.py`
- `SarvamSTTHandler` class
- Opens/closes WebSocket per PTT press
- Proxies audio chunks to Sarvam
- Emits interim and final transcript events
- Calls `ws.flush()` on PTT release signal

### `voice_agent/tts_handler.py`
- `SarvamTTSHandler` class
- Persistent WebSocket per session
- `configure(language_code, speaker)` — called once on session start
- `speak(text)` — converts text to audio, streams chunks
- `keepalive()` — sends ping every 30s (run as background task)
- `close()` — graceful shutdown

### `voice_agent/session_manager.py`
- `VoiceSession` dataclass: `session_id`, `table_id`, `restaurant_id`, `tts_handler`, `orchestrator`
- `SessionManager` — in-memory dict of active sessions
- `create_session()`, `get_session()`, `end_session()`

### `voice_agent/restaurant_config.py`
- `RestaurantConfig` dataclass: `language_code`, `speaker`, `name`
- Loaded from `config/restaurants.json` at startup
- Used to configure TTS per session

---

## LLM Prompt Update Required

The system prompt in `src/llm/prompts/system_prompt.py` needs one new instruction:

> "Always respond in native script. For Hindi: Devanagari (हिंदी). For Telugu: Telugu script (తెలుగు). For English: Roman script. Never use romanized transliteration for Indic languages. This is mandatory for TTS quality."

The `<language>` tag already exists in LLM output — this just enforces script fidelity.

---

## Voice CLI — `cli/voice.py`

Test harness for Stage 3. Not the final product.

**What it does:**
- Opens mic on PTT keypress (spacebar hold)
- Streams PCM audio to `/voice/stt/{session_id}` WebSocket
- Shows interim transcript on screen in real time
- On PTT release: sends flush, waits for final transcript
- Receives audio chunks from `/voice/tts/{session_id}` WebSocket
- Plays audio via `sounddevice` or `pyaudio`

**Dependencies:**
- `sounddevice` — mic capture + playback
- `websockets` — client WebSocket
- `keyboard` — PTT spacebar detection (or any key)

---

## Environment Variables

Add to `.env`:
```
SARVAM_API_KEY=your_key_here
```

Add to `.env.example`:
```
SARVAM_API_KEY=your_sarvam_api_subscription_key
```

---

## restaurants.json (new config file)

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

## Test Plan

### Unit tests (new)
- `tests/test_stt_handler.py` — mock Sarvam WebSocket, verify proxy logic, flush signal
- `tests/test_tts_handler.py` — mock Sarvam WebSocket, verify configure/speak/keepalive
- `tests/test_session_manager.py` — create/get/end sessions, concurrent sessions

### Integration test
- `scripts/test_voice_pipeline.py` — end-to-end: WAV file → STT → Orchestrator → TTS → audio output file
- Run with pre-recorded WAV files from the 5 conversation test scenarios in `data/conversation_tests/`

### Manual test
- `cli/voice.py` — live mic test on development machine before tablet

---

## Directory Changes

```
/voice-agent/                  ← renamed from /livekit-agent/
  stt_handler.py               ← NEW
  tts_handler.py               ← NEW
  session_manager.py           ← NEW
  restaurant_config.py         ← NEW

/backend/
  routers/
    voice.py                   ← NEW (FastAPI voice router)
  config/
    restaurants.json           ← NEW

/cli/
  voice.py                     ← NEW

/tests/
  test_stt_handler.py          ← NEW
  test_tts_handler.py          ← NEW
  test_session_manager.py      ← NEW

/scripts/
  test_voice_pipeline.py       ← NEW

/.env                          ← add SARVAM_API_KEY
/.env.example                  ← add SARVAM_API_KEY
```

---

## Definition of Done — Stage 3

- [x] `cli/voice.py` successfully completes a full PTT → transcript → orchestrator → audio round trip (verified 2026-04-17 after `voice_agent/tts_handler.py` wire-protocol fix)
- [ ] All 5 conversation test scenarios pass via WAV file injection (not just typed CLI) — *pending live run of `scripts/test_voice_pipeline.py`*
- [ ] Hindi and Telugu TTS responses are in native script — no romanization — *pending live multilingual session*
- [x] TTS WebSocket stays alive across 3+ consecutive PTT presses without reconnecting (`_ensure_connected()` auto-reconnects + 30s keepalive; observed across 6 consecutive PTTs in 2026-04-17 log)
- [ ] STT auto-detects language correctly on code-switched input ("ek Hakka Noodles dena") — *pending live multilingual session*
- [x] Unit tests pass: `tests/test_stt_handler.py`, `tests/test_tts_handler.py`, `tests/test_session_manager.py` (136/136 green)
- [x] No LiveKit imports anywhere in the codebase (only historical references remain in docs noting its removal)
