# Session ID Unification

## The two IDs

| ID | Created by | Scope | Used for |
|----|-----------|-------|----------|
| `tt_session_id` (= `clientSessionId`) | Kiosk frontend on first voice press, persisted in `sessionStorage` | One diner sitting — survives multiple PTT presses and voice sessions | Key for `recommendation_events` rows (nudge impressions, completions) |
| `voiceSessionId` (= `session.session_id`) | Backend `POST /voice/session/start` | One WebSocket pair (STT + TTS). Re-created if the backend restarts or the session is explicitly ended | WebSocket URL path param: `/voice/stt/{voiceSessionId}` and `/voice/tts/{voiceSessionId}` |

Before this change, post-pilot analytics couldn't join voice turns to nudge events because the two IDs were unrelated UUIDs.

## How client_session_id flows through the system

```
sessionStorage["tt_session_id"]          (generated once, persists for the browser tab)
        │
        ▼
api.ts: startSession()
  → reads / generates tt_session_id
  → POST /voice/session/start  { table_id, restaurant_id, client_session_id: tt_session_id }
  → returns { voiceSessionId, clientSessionId }
        │
        ▼
Backend: POST /voice/session/start
  → SessionManager.create_session(table_id, restaurant_id, client_session_id)
  → VoiceSession.client_session_id = client_session_id
  → response: { session_id: voiceSessionId }
        │
        ▼
WS /voice/stt/{voiceSessionId}  (each PTT press)
  → orchestrator processes turn
  → sends "done" message: { ..., client_session_id: session.client_session_id }
        │
        ▼
VoiceOrderButton / Index.tsx
  → DoneMessage.client_session_id == tt_session_id
  → use this when writing recommendation_events rows for voice turns
```

## Invariant

`DoneMessage.client_session_id` is always equal to `sessionStorage["tt_session_id"]` for the current tab. Analytics queries can join on this field to link voice turns (`done` messages) to nudge impression/conversion events logged under the same `tt_session_id`.
