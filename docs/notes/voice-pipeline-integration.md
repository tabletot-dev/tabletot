# Voice Pipeline Integration

## FastAPI endpoints used

All endpoints live on `http://localhost:8000` (configured in `apps/kiosk/src/lib/voice/api.ts`).

| Endpoint | Type | Purpose |
|---|---|---|
| `POST /voice/session/start` | HTTP | Create a backend voice session; returns `{session_id}` |
| `POST /voice/session/end` | HTTP | Tear down session and close Sarvam TTS WebSocket |
| `WS /voice/stt/{session_id}` | WebSocket | Per-PTT-press: proxy PCM audio → Sarvam STT → LLM → resolver; returns `done` message with `{transcript, response, resolver, order}` |
| `WS /voice/tts/{session_id}` | WebSocket | Persistent per session: streams Sarvam TTS audio (PCM s16le @ 24 kHz) back to client |

The `/voice/stt/{session_id}` WS also runs the full two-pass LLM + resolver turn internally. The kiosk does NOT need a separate `/process-order` endpoint — the `done` message carries everything needed.

## Where voice client files live

```
apps/kiosk/src/lib/voice/
  api.ts          # startSession / endSession HTTP helpers; BACKEND_HTTP / BACKEND_WS constants
  types.ts        # SttMessage, TtsMessage, DoneMessage, OrderSnapshot, ResolverCall types
  pcm.ts          # floatToInt16 / int16ToFloat / resampleLinear — PCM conversion utilities
  micWorklet.ts   # AudioWorklet source string (PCMWorklet) — buffers mic samples
  sttClient.ts    # startSttPress(sessionId, onMessage) → SttPressHandle
                  #   Opens WebSocket, captures mic via AudioWorklet, streams PCM to backend
                  #   Sends {type:"flush"} on PTT release to trigger Sarvam finalize
  ttsClient.ts    # openTtsClient(sessionId, onMessage) → TtsClientHandle
                  #   Opens persistent WebSocket; decodes PCM chunks; queues into AudioContext
                  #   bargeIn() drops all pending audio (closes + recreates AudioContext)
```

These files are copied verbatim from `apps/voice-test-page/src/` — do NOT modify originals.

## How cart state is passed to the backend

It isn't passed directly. The STT WebSocket only accepts binary PCM audio. The backend's
`Orchestrator` maintains its own independent `OrderState` for LLM context across turns.

**Sync direction is one-way: backend → kiosk.**

After each voice turn, the `done` message includes `order: OrderSnapshot` — the backend's
full order state. `handleVoiceDone` in `Index.tsx` diffs this snapshot against the previous
one (`prevVoiceOrderRef`) and reconciles the kiosk cart:

- Items added/quantity increased → `addToOrder(kioskItem, delta)`
- Items removed/quantity decreased → `updateQuantity` or `removeItem`
- Item name matching: `normalizeName` lowercases and collapses `-`/`–`/`—` to spaces
  (handles the `"Filter Coffee - Small"` backend vs `"Filter Coffee – Small"` kiosk mismatch)

**Known limitation**: touch-added items are invisible to the backend LLM. If the user adds
something by tapping, then says "remove it", the backend won't know it's in the cart.

## How session_id is shared

There are **two separate session IDs**:

| ID | Where | Purpose |
|---|---|---|
| `tt_session_id` | `sessionStorage` (UUID, client-generated) | Supabase `recommendation_events` logging (ChefsPicks, PairingNudge, CompletionNudge) |
| `voiceSessionId` | Ref in `VoiceOrderButton` (UUID, server-generated) | Backend WebSocket URLs `/voice/stt/{id}` and `/voice/tts/{id}` |

They are different UUIDs for the same physical table session. Unifying them would require
the backend to accept a client-supplied session ID — not done in the pilot.

## How to test the voice path locally

Prerequisites:
- `ANTHROPIC_API_KEY` and `SARVAM_API_KEY` set in env
- Supabase local running (`supabase start`)

**Step 1 — Start the order-engine backend**
```bash
cd services/order-engine
source .venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
Confirm: logs show `Menu loaded: 423 entries for roast-ccx-hyd`.

**Step 2 — Start the kiosk dev server**
```bash
cd apps/kiosk
npm run dev   # http://localhost:5174
```

**Step 3 — Test PTT**
1. Open `http://localhost:5174`
2. Tap "Start" on the IdleScreen — kiosk wakes to menu
3. The mic button (bottom-right) starts as "Hold to order" once the backend session is ready
4. Hold the mic button, say "ek filter coffee" (or any item from the menu)
5. Release — button shows "Processing…" while the turn completes
6. Cart should update (item added), and TTS plays the confirmation in Hindi/English

**Step 4 — Verify event**
```sql
-- In Supabase Studio or psql
SELECT * FROM recommendation_events ORDER BY created_at DESC LIMIT 5;
```

## Known limitations / open issues

1. **Touch cart invisible to LLM**: Items added by tapping are not in the backend's `OrderState`.
   Voice remove commands won't find them. Fix: sync kiosk cart to backend on each turn (needs
   a new backend endpoint to accept cart state).

2. **Backend session started immediately on mount**: `VoiceOrderButton` calls `session/start` when
   it mounts (on any active screen). If the backend is down, the button shows "Voice unavailable"
   and the touch path is completely unaffected.

3. **Variant name mismatch**: The backend returns "Filter Coffee - Small" (hyphen) while the kiosk
   DB has "Filter Coffee – Small" (en dash). `normalizeName` handles this, but any other encoding
   differences would silently fail to add to cart. Monitor the browser console for missed matches.

4. **Single restaurant hardcoded**: `VoiceOrderButton` uses `restaurant_id: "roast-ccx-hyd"` and
   `table_id: "T-01"`. For multi-table deployment, pass these as props from `Index.tsx`.

5. **No microphone permission error UX**: If the browser denies mic access, `startSttPress` throws
   and the button returns to idle silently. Add a visible error banner for production.
