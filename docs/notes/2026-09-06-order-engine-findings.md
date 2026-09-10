# Order-engine findings — 2026-09-06

Read-only review session. No code changed. Three questions were asked:
(1) is an "AI agent" order-engine feasible, (2) why does TTS audio cut off
before the transcript ends, (3) can the engine answer food/restaurant
questions and feel less robotic. Findings below, in that order.

Everything here touches the frozen voice pipeline. Nothing should be
implemented without an explicit go-ahead.

---

## 1. Agent-style order engine — feasible, deferred

**Current design** (`services/order-engine/src/orchestrator.py`): a fixed
two-pass flow. Pass 1 turns the transcript into a list of pre-defined intents
(`add_item`, `remove_item`, `confirm_order`, `ask_menu`, `browse_category`,
`filter`, `recommend`, `none`). A deterministic resolver applies them to
order state. Pass 2 writes the reply knowing exactly what the resolver did,
so the LLM can never confirm an item that did not resolve.

**Agent alternative**: give the LLM tools (search menu, add/remove item, read
order, get pairings, confirm) in a loop. All three providers support native
tool calling.

| Gain | Cost |
|------|------|
| Multi-step asks ("light, veg, under 300") work without new intent types | 3–5 LLM calls per turn instead of 2 — noticeable on voice |
| Ambiguity handled in-turn | Less predictable; conversation tests must check order-state outcomes, not exact intents |
| New capability = new tool | Cost per turn rises with call count |
| Truth guarantee survives (agent only knows what tools returned) | Needs a new ADR |

**Constraints**: patterns 1/3/6 stay SQL-only on the touch path; the agent
would serve voice and Ask AI (pattern 5) only. Resolver and order state must
stay deterministic and be wrapped as tools, never replaced.

**If ever built, pilot-sized shape**: one provider (Claude native tool use),
5–6 tools wrapping existing resolver/order state, iteration cap of 4, one env
flag to switch orchestrator class, existing conversation tests rerun against
order-state outcomes. Roughly one new file plus a loader change.

**Decision**: deferred — latency and cost judged too high for the pilot.
Most of the "smarter" goal is reachable via data + prompt (section 3).

---

## 2. TTS audio cut-off — two code-side causes

Symptom: browser plays the reply but stops before the transcript ends.

### 2a. Backend: sentence silently skipped on ElevenLabs reconnect (most likely)

`services/order-engine/voice_agent/elevenlabs_tts_handler.py`

- `speak()` (line ~88) sends the sentence plus an empty-text close message,
  so ElevenLabs finishes the sentence and then closes the socket.
- The next sentence is usually already queued, so `speak()` runs again
  immediately. `_ensure_connected()` (line ~146) still sees state OPEN if
  the server's close frame has not been read yet.
- The new sentence is sent into a dying socket, `recv()` raises
  `ConnectionClosedOK`, and the loop (line ~93) treats that as "complete"
  and returns with **zero audio and no exception**.
- Because no exception is raised, the one-retry in
  `backend/routers/voice.py` (~line 459) never fires.
- Result: sentence appears in the transcript but is never spoken. It is a
  race, so it drops sentences intermittently; mid-reply sentences are most
  exposed because they arrive fastest.

**How to confirm without a mic**: set order-engine log level to DEBUG and
look for `TTS speak: connection closed by server (complete)` directly after
a `TTS speak: ...` line with no audio in between.

**Fix shape** (small, but frozen-code): treat a close with zero audio yielded
as a failure so the existing retry reconnects, or reconnect unconditionally
after every `isFinal` since the connection is closed per sentence anyway.

### 2b. Kiosk: leaving the menu screen kills audio and the session

- The TTS client lives inside `VoiceOrderButton`, which is mounted only as
  the menu screen's voice dock (`apps/kiosk/src/pages/Index.tsx` ~line 493).
- Its unmount cleanup closes the TTS socket and calls `endSession`
  (`apps/kiosk/src/components/VoiceOrderButton.tsx` ~line 113).
- Tapping a suggested item in the conversation panel, or navigating to
  Popular / Detail / Cart while the reply is playing, stops playback
  mid-sentence and destroys the backend session. Returning to the menu opens
  a fresh session with no conversation memory.

**Status (2026-09-10): DEFERRED to `kiosk-v1-sprint-6-7` — not fixed on this
branch.** Decision (Rohan): do not touch kiosk code on the findings branch;
the sprint branch has 20+ unmerged commits on the voice surface and a
divergent `Index.tsx`, so a fix here would conflict.

What the sprint branch already does (checked 2026-09-10, tip `7399b60`):
`Index.tsx` keeps `VoiceOrderButton` **mounted but hidden** (not unmounted)
across `menu`, `voice-conversation`, and `item-detail` — commit `c02b320`
"address final voice-redesign review (session lifetime, dock close…)",
referenced in-code as "review C1". So Detail no longer kills the session
there.

What is still NOT covered on the sprint branch: navigating to `popular`
(FrequentlyOrderedView), `order-summary` (Cart), `sent`, or any other screen
outside those three still unmounts `VoiceOrderButton` and tears down the
session mid-reply. The remaining screens need folding into the same
"mounted, hidden off-menu" list, or the voice-session ownership lifted out of
`VoiceOrderButton` entirely per the single-surface rework
(`docs/plans/2026-08-31-voice-single-surface-rework.md`).

Action for whoever picks up the sprint branch: extend the mount condition in
`Index.tsx` to every screen reachable while voice is active, or hoist the
session/TTS handle into a parent that never unmounts.

### Checked and ruled out

- `speech_complete` is sent when audio is fully *sent*, not played, but
  nothing in the kiosk listens for it — cannot truncate playback.
- `apps/kiosk/src/lib/voice/ttsClient.ts` chains buffers by
  `nextStartTime`; gaps between sentences do not drop audio. Barge-in only
  fires on a PTT press.
- Streaming providers drain the trailing partial sentence; Pass 2 has a
  512-token cap, enough for a reply.
- `ListeningScreen` is dead code — nothing sets the screen to `"listening"`,
  so its 600 ms auto-close is not in play.
- Idle reaper is 15 min; the TTS loop touches the session every 60 s.

### Minor, not cut-off causes

- Sentence splitter (`src/llm/_sentence_splitter.py`) breaks on every
  period, so "Rs. 250" sends a fragment "Rs." to TTS on its own.
- Each sentence pays a fresh TLS + WebSocket handshake to ElevenLabs,
  adding a short pause between sentences.

---

## 3. "Smarter / more humane" engine — mostly a data + prompt problem

### What the reply-writer LLM knows today

(`src/llm/prompts/system_prompt.py` ~line 151, `src/llm/prompts/menu_summary.py`)

- Restaurant persona from DB (`restaurants.voice_persona`, migration 0028).
  Silver's: calm, unhurried barista voice.
- Menu list per category: item name, veg tag, one-line description,
  modifier options. Prices deliberately hidden ("Do NOT mention prices").
- Last 10 exchanges of conversation history.
- What the resolver did this turn, plus the current order.

### How each question type fares

| Question | Today | Why |
|----------|-------|-----|
| Food suggestions | Works | `recommend` intent pulls curated pairings/anchors from DB; free-form asks fall to `ask_menu` and answer from names + descriptions (shallow) |
| Nutrients / calories / allergens | **Fails, may guess** | No such fields in `src/models.py` or `menu_items`; prompt says "answer from the menu above" with no "admit you don't know" rule |
| Preparation time | **Fails, may invent** | No field, no kitchen timing feed |
| Restaurant info (hours, location, story) | Brushed off | Only the one-sentence persona; Scope rule redirects anything not menu/order |
| Off-topic, rude, prompt injection | Handled well | Scope, Decorum, Role Integrity, Privacy rules all present |

### Why it feels robotic

- Hard cap of 1–2 sentences on every reply, including real questions.
- Descriptions are thin (migration 0031 — e.g. "Avocado mash on sourdough.").
- No small-talk allowance; every reply is written fresh from a rule sheet.
- Prices hidden, so "how much is it" gets a dodge.

### Recommended path (no agent, no latency cost)

1. Add a `facts` JSONB column on `menu_items` (calories, allergens, spice
   level, prep minutes, ingredients) and render it in the menu summary.
   Add a restaurant-level facts blob (hours, story, specialties).
2. Add a truth rule: if a fact is not in the menu section, say you will
   check with staff. Never estimate.
3. Relax the length rule: 1–2 sentences for order confirmations, up to 4
   for questions.
4. Enrich descriptions to 2–3 sentences per item (owner-written, or
   generated once and reviewed).

Scope: one migration, a loader change, a menu-summary change, prompt edits.
Two-pass design unchanged.
