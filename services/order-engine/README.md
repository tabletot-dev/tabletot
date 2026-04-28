# Roast CCx Voice Kiosk

Voice-first self-ordering system for Roast CCx (Hyderabad). Customers speak their order in Hindi, Telugu, or English at a tablet mounted at their table. The system processes, confirms, and routes orders to a KDS.

## Stage Status

| Stage | Description | Status |
|---|---|---|
| 1 | Menu Resolver (deterministic) | ✅ Complete |
| 2 | LLM Intent Extraction + Orchestrator | ✅ Complete |
| 3 | Voice Layer (Sarvam STT + TTS) | 🔄 STT ✅ · TTS 🔧 |
| 4 | Kiosk PWA (React, touch + voice UI) | ⏳ Pending |
| 5 | Integration & Hardening (Supabase, KDS) | ⏳ Pending |

---

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Copy and fill in API keys
cp .env.example .env
# ANTHROPIC_API_KEY=...
# SARVAM_API_KEY=...
```

---

## Usage

### Stage 3: Voice (PTT)

```bash
# Terminal 1 — backend
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2 — voice CLI
python -m cli.voice
# Hold SPACE to speak, release to send. Press Q to quit.
```

Each turn prints:
```
[STT] Final: ek butter chicken aur do garlic naan
[Response] Sure! I've added Butter Chicken and 2 Garlic Naan...
[Resolver]
  + "butter chicken" → Butter Chicken  [exact, 100.0]
  + "garlic naan" → Garlic Naan  [alias, 100.0]
[Order] 2 item(s)  total ₹689
```

### Stage 2: Conversation Mode (typed input)

```bash
python -m cli.conversation
python -m cli.conversation --time 08:30   # simulate breakfast hours
```

Commands: `!order`, `!clear`, `!raw`, `!history`, `!stats`, `!failures`, `!time`, `!quit`

### Stage 1: Direct Resolver

```bash
python -m cli.interactive
python -m cli.batch data/test_battery.txt
```

### Tests

```bash
pytest tests/ -v          # 136 unit tests
python scripts/test_voice_pipeline.py   # Stage 3 WAV integration test
```

---

## Architecture

```
PTT press → mic audio (PCM 16kHz)
        │
        ▼
Layer 1: Sarvam saaras:v3 STT (WebSocket, auto language detection)
  → transcript in Hindi / Telugu / English
        │
        ▼
Layer 2: LLM (Claude Sonnet)
  → extracts structured intents: {action, raw_name, qty, modifiers}
  → receives item names/categories/tags only — never prices or IDs
        │
        ▼
Layer 3: Menu Resolver (deterministic, 5-step cascade)
  → exact → alias → fuzzy token_sort → fuzzy partial → no-match
  → returns: ConfidentMatch | NeedsVariantSelection | Ambiguous | NoMatch | Unavailable
        │
        ▼
Order State Manager
  → accumulates confirmed items, tracks quantities and totals
        │
        ▼
Layer 4: Sarvam bulbul:v3 TTS (WebSocket, persistent per session)
  → streams PCM audio back to client
```

**Rules that don't change:**
- LLM never sees prices or IDs
- STT is stateless per PTT press
- TTS is persistent per table session (reconnects on idle close)
- `menu.json` is developer-edited only — no runtime writes

---

## Project Structure

```
/
├── backend/                    # FastAPI voice backend
│   ├── main.py
│   ├── routers/voice.py        # STT/TTS/session WebSocket endpoints
│   └── config/restaurants.json
│
├── voice_agent/                # Sarvam WebSocket handlers
│   ├── stt_handler.py          # Per-PTT-press STT proxy (base64 PCM)
│   ├── tts_handler.py          # Persistent TTS with auto-reconnect
│   ├── session_manager.py      # VoiceSession + SessionManager
│   └── restaurant_config.py
│
├── src/                        # Core library (Stages 1 & 2)
│   ├── models.py
│   ├── normalizer.py
│   ├── loader.py
│   ├── resolver.py
│   ├── time_check.py
│   ├── order_state.py
│   ├── orchestrator.py
│   └── llm/
│       ├── claude_provider.py
│       ├── intent_parser.py
│       └── prompts/
│
├── cli/
│   ├── interactive.py          # Stage 1 REPL
│   ├── batch.py                # Stage 1 batch runner
│   ├── conversation.py         # Stage 2 typed conversation
│   └── voice.py                # Stage 3 PTT voice client
│
├── tests/                      # 136 unit tests
├── scripts/
│   └── test_voice_pipeline.py  # Stage 3 WAV integration test
├── data/
│   ├── menu.json               # Canonical menu (source of truth)
│   └── test_battery.txt        # 98 Stage 1 test cases
└── docs/                       # Specs and ADRs
```
