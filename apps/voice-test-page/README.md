# voice-test-page

Throwaway React spike that drives the full voice pipeline (STT + LLM + resolver + TTS) from a browser. Exists to validate Web Audio API playback of the Sarvam TTS stream before Stage 4 Kiosk PWA work begins.

**Not the Kiosk PWA.** No touch ordering, no category grid, no production design.

## Run

Two terminals.

**Terminal 1 — backend:**
```
cd ..
source .venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — frontend:**
```
npm install
npm run dev
```

Open http://localhost:5173 in Chrome. Click **Start session**, then hold the PTT button (or press and hold **Space**) to speak.

## Expected behaviour

- Transcript appears as you speak (grey = interim, white = final).
- LLM response text appears.
- Resolver pane lists each intent with a glyph (`+`/`!`/`?`/`✗`).
- Order pane updates.
- TTS audio plays through your speakers.

## Troubleshooting

- **No audio / silent TTS** — AudioContext probably wasn't unlocked. Click anywhere on the page first, or start a session and try again. Some browsers only allow audio after a user gesture.
- **Mic permission denied** — grant microphone access for `http://localhost:5173` in browser settings.
- **CORS errors in console** — backend must have `CORSMiddleware` enabled for `http://localhost:5173` (see `backend/main.py`).
- **Session not found** on WS connect — session must be created via `POST /voice/session/start` before opening WebSockets. The page does this automatically on "Start session".

## Known limitations

- Chrome only. Safari does not honour `sampleRate: 16000` on `AudioContext` and its autoplay rules are stricter.
- Desktop only — no mobile touch adaptation.
- No auto-reconnect on WebSocket failure. Refresh the page.
- No session recovery across reloads.

## Wire protocol summary

- `POST /voice/session/start` → `{ session_id }`
- `WS /voice/tts/{id}` — persistent; receives raw PCM s16le 24 kHz binary frames + `{ "type": "speech_complete" }` markers
- `WS /voice/stt/{id}` — per PTT; send raw PCM s16le 16 kHz binary frames, then `{ "type": "flush" }`; receive `interim`/`final`/`done` text frames
- `POST /voice/session/end`

See `backend/routers/voice.py` for the authoritative definition.
