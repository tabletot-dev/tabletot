# Voice conversation continuity across modal open/close

The voice chat **feels** like it has amnesia: every time the customer closes the
voice conversation modal and reopens it, the visible chat thread is gone and the
panel resets to the empty "Tell me what you need…" greeting — even though the
table's ordering session is still active.

This is a **frontend state-scoping bug, not a backend memory gap.** The backend
remembers the entire conversation the whole time. Only the UI throws away its
rendering of it.

## Why the customer perceives amnesia

Two independent voice components live in `apps/kiosk/src/pages/Index.tsx`, with
different lifecycles:

| Component | Mounted while | Owns |
|-----------|---------------|------|
| `VoiceOrderButton` (dock) | On the menu (`voiceEnabled`) | The backend session — `startSession()` on mount, `endSession()` on unmount |
| `VoiceConversationPanel` (modal) | Only while `voiceConversationOpen === true` | The visible transcript (`turns`) |

Closing the modal does **not** end the backend session — the session is tied to
the dock, which stays mounted across the whole browsing session. But the modal's
transcript lives in component-local state (`VoiceConversationPanel.tsx`:
`const [turns, setTurns] = useState<Turn[]>([])`), so it is destroyed on unmount
and re-initialised to `[]` on reopen.

## The backend already remembers

Each `VoiceSession` owns a stateful `Orchestrator`
(`services/order-engine/src/orchestrator.py`):

- `self.order_state = OrderState()`
- `self.conversation_history: list[dict] = []`
- Every turn appends user + assistant messages and feeds the full history into
  both LLM passes.

That orchestrator lives in `SessionManager._sessions[session_id]` and survives
until the dock unmounts (leaving the menu, `voiceEnabled` false, or
`activeSessionKey` change). The modal reuses the **same `voiceSessionId`**
(`sessionId={voiceSessionId}`), so after reopening, the next PTT press still gets
a context-aware response — the backend knows what was discussed and what is in
the order. Only the *display* of that history was lost.

## What this means

The continuity the customer expects ("voice should feel part of the same ordering
session") is already supported by the backend. Making it *feel* connected is a
contained frontend change: the transcript must outlive the modal.

## Planned fix

Lift transcript state out of the modal so it lives as long as the voice session:

1. Move `turns` (and `pressStatus` if it should survive) from
   `VoiceConversationPanel` up into `Index.tsx`, alongside `voiceSessionId` —
   or into a small voice store/context if it needs to be shared with the dock.
2. Pass `turns` + `setTurns` down as props; on reopen the panel renders the
   existing thread instead of an empty greeting.
3. Optionally seed/repair the thread from `order_state_snapshot`, which the
   backend already returns on every `done` message, so the displayed order stays
   truthful even after a page reload (where backend session may differ).
4. Reset the transcript only when the *session* actually ends (dock unmount /
   `activeSessionKey` change), not when the modal closes.

No backend changes required. See the implementation plan for the step-by-step.

## Related

- `voice-pipeline-integration.md` — how the STT/TTS/session wiring fits together
- `voice-fixes.md` — prior voice bug fixes
- `session-id-unification.md` — session id semantics across kiosk surfaces
