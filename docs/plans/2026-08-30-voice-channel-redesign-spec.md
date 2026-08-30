# Voice Channel Redesign — Design Spec

**Date:** 2026-08-30
**Branch:** `kiosk-v1-sprint-6-7` (continues the Sprint 6–7 work)
**Status:** approved in brainstorm 2026-08-30, pending implementation plan

## Problem

Sprints 7.1/7.2 renamed the voice UI's CSS classes (`.voice-*` → `.tt-voice-*`)
and the reduced Task 7.0 swept its colours to v1.0 tokens, but the voice
channel's **structure, layout, and information architecture were never
rebuilt**. It still renders as the pre-redesign "Ask Tabletot" centred modal:
peach chat bubbles, a 2-up "Recommended" card grid, an in-modal dark pill with
an 18-bar frequency meter and a "SPEAK" button. It does not match the v1.0
screen spec (handoff screens 06 / 07 / 08).

Target: the three client mockups —
- **06 Voice / Listening** — menu stays visible; a docked ink panel at the
  bottom with an audio-reactive waveform, live transcript, collapsed history,
  quick-reply chips.
- **07 Voice / Recommendation** — full screen; conversation thread with an
  ink-header composite answer card holding addable dish rows.
- **08 Voice / Informational Answer** — same shell as 07; the answer card body
  is text-only.

## Constraints

**The voice pipeline is FROZEN.** Byte-for-byte untouched:
- everything in `apps/kiosk/src/lib/voice/*`
- `handleVoiceDone` in `apps/kiosk/src/pages/Index.tsx`
- inside `VoiceConversationPanel` / `VoiceOrderButton`: the
  `startSession` / `openTtsClient` / `startSttPress` sequence,
  `handleSttMessage`, the `handleToggle` recording state machine, all refs,
  and `ttsHandle.bargeIn()`.

We reshape **markup, CSS, navigation state, and add one read-only hook** around
that logic.

**Design system:** `apps/kiosk/src/styles/tokens.css` only. 2px borders, zero
`box-shadow`, zero `backdrop-filter`. Sora display / Manrope text. Coral
(`--tt-action`) is fill-only. Ink surfaces use `--tt-on-dark` / `--tt-on-dark-70`
for text.

## Data reality (decided: omit what has no source)

`MenuItem = { id, name, price, category, tags[], is_veg, description?, image? }`.
`Turn = { role, text, matchedItems?: MenuItem[] }`.
`DoneMessage = { transcript, response, resolver[], order, client_session_id }`.

**Not available, therefore not built:**
- 08's PROTEIN / FAT / CARBS stat row — no macro data anywhere.
- 07's dish meta line ("No dairy · 12 min · mild") — no prep time / spice /
  dairy flag; only `tags[]` + `is_veg`.
- Backend-driven quick replies — the chips are a small static set.

The layouts still match the mockups; the unbacked elements are simply not
drawn, and are forward-compatible (render if `tags[]` ever carries the info).

## Architecture

### Navigation
Add `"voice-conversation"` to `ScreenType`.

- **Recording (06)** happens while `currentScreen` stays `"menu"` — a bottom
  overlay, **no backdrop**, menu visible and scrollable behind.
- When `handleVoiceDone` appends the `ai` turn → switch to
  `currentScreen: "voice-conversation"` (full screen, 07/08).
- The answer screen's speak-dock → back to `"menu"` + recording overlay, via
  the **existing** `handleToggle`.
- `Close` → `currentScreen: "menu"`, overlay cleared. `voiceTurns` (owned by
  `Index.tsx`) persists across all of this — already true today.

### Phase (derived, no new source of truth)
From existing `pressStatus` / `backendStatus` / the last turn's role:

| voicePhase | condition | renders |
|---|---|---|
| `dock` | `pressStatus` is `recording` or `processing`, no fresh answer | 06 overlay |
| `answer` | last turn is `role: "ai"` | 07 / 08 full screen |
| `closed` | dismissed | nothing |

### Files

**New:**
- `src/components/voice/VoiceDockPanel.tsx` — 06 recording overlay.
- `src/components/voice/VoiceConversationScreen.tsx` — 07/08 full screen shell.
- `src/components/voice/VoiceAnswerCard.tsx` — ink-header composite card;
  `rec` variant (dish rows) and `info` variant (text + footnote).
- `src/components/voice/EarlierStrip.tsx` — collapsed-history row (light +
  on-dark variants).
- `src/hooks/useMicLevels.ts` — audio-reactive bar levels (read-only).
- Tests for each (`*.test.tsx` / `*.test.ts`).

**Rewritten:**
- `src/components/VoiceConversationPanel.tsx` → thin host: keeps ALL frozen
  STT/TTS code and the `handleToggle` machine in place (not moved). Stays
  mounted whenever voice is active; renders `VoiceDockPanel` (06) itself when
  phase is `dock`, renders nothing when phase is `answer`. It **lifts
  `handleToggle`** up through a prop/callback so `Index.tsx` can pass it to
  `VoiceConversationScreen`'s speak-dock — the answer screen never touches the
  frozen machine directly, it just calls the lifted toggle. Other props
  unchanged where possible.

**Modified:**
- `src/pages/Index.tsx` — `"voice-conversation"` case; phase wiring;
  overlay-on-menu placement.
- `src/hooks/useDeviceNavigation.ts` — `ScreenType`.
- `src/styles/tabletot.css` — new `.tt-voice-*` rules (replace the
  renamed-but-old ones for the panel; the dock-button `.tt-voice-ptt-*` rules
  stay).

**Deleted:**
- `src/components/screens/ListeningScreen.tsx` + `__tests__/ListeningScreen.test.tsx`
  — dead code (nothing sets `currentScreen = "listening"`).
- `"listening"` from `ScreenType` and the `case "listening"` in `Index.tsx`.

## Component detail

### 06 — `VoiceDockPanel` (bottom overlay, ink surface)
- **Status row:** coral `● LISTENING` pill (mic glyph) · "Tap the mark again to
  stop" · outlined `Close ✕` pill. When `backendStatus === "error"`: pill reads
  "Voice unavailable", mic mark disabled, no waveform.
- **`EarlierStrip`** (on-dark) — only if `turns.length > 0`: first user turn
  truncated + "· N more"; tap → `voice-conversation` screen.
- **Waveform:** coral circular mic mark (left, = the stop control, calls
  `onToggle`) + ~24 bars from `useMicLevels`; coral/white on ink, eased fall;
  idle ripple when `rms` below threshold.
- **Live transcript:** the `interim` / `final` STT text, `--tt-size-dish`,
  white, quoted, ellipsis while partial.
- **Quick-reply chips:** static 3 — "What's popular?", "Something for two",
  "No onion or garlic" — outlined on ink. Wiring: append the chip text as a
  user `Turn` and feed the same path `handleSttMessage`'s `done` branch uses;
  **fallback** if that entry point needs frozen-code edits: prefill the next
  capture (visual only). Decided at build; no pipeline edit either way.

### 07 — `VoiceConversationScreen` + `VoiceAnswerCard` (rec)
Full screen, real app bar, `--tt-field` ground.
- **Header:** "Your conversation" (Sora) · "N messages · kept until you leave
  the table" · outlined `Close ✕`.
- **`EarlierStrip`** (light) + "Show all" → expands full thread inline.
- **`YOU SAID`** card per recent user turn — white, 2px border, label + quote.
- **`VoiceAnswerCard` rec:** ink header band (coral circular avatar + `turn.text`
  white) fused to a white body. Body = `matchedItems.slice(0, 3)` rows: image
  thumb or category-gradient fallback, `DietMark`, name, price, coral `Add` OR
  the existing stepper when `getQuantity(id) > 0`. `--tt-line` hairline
  dividers. No meta line.
- **Quick-reply chips:** static 3 — "Add both", "Show me more", "Something
  warmer" — same wiring rule as 06.
- **Speak-dock:** slim full-width ink bar — coral mic mark + "Tap the mark to
  speak" / "Tap it again to stop · this conversation is kept". Tap → 06.

### 08 — `VoiceAnswerCard` (info)
Same shell as 07. Card body: `turn.text` large (Sora), then a muted footnote —
"Kitchen estimate — ask a staff member for anything allergy-critical." — shown
whenever `matchedItems` is empty. No stat row. Chips: "Show me lighter dishes",
"Back to the menu", + one more static.

**07 vs 08:** `turn.matchedItems?.length ? rec : info`.

### `useMicLevels(active: boolean)` — read-only
- On `active`: a **second, separate** `getUserMedia({ audio: true })` →
  `AudioContext` → `AnalyserNode` (`fftSize: 64`). Never feeds the STT client;
  never imports from `lib/voice/*`.
- `requestAnimationFrame` loop → `getByteFrequencyData` → `number[]` of ~24
  heights (0–1), smoothed with a short decay.
- Returns `{ levels: number[], rms: number }`. `rms < threshold` → caller shows
  idle ripple.
- Cleanup on `active === false` / unmount: stop tracks, close context, cancel
  frame. try/catch around acquisition — denial → returns zeros, 06 still fully
  works, capture unaffected.
- `prefers-reduced-motion`: no rAF loop, static low bars.
- **Risk:** two concurrent audio `getUserMedia` streams. Normally fine in
  Chrome on the K9; if the device serialises mic access the analyser stream
  fails → zero-fallback. On the physical-device QA list.

## Error / edge handling

- Backend `error`: 06 opens, degraded (no waveform, disabled mark), no answer
  screen.
- `no_speech`: back to `menu`, no turn (existing behaviour).
- Analyser denied: idle ripple only; capture unaffected.
- `ai` turn with empty `matchedItems`: renders 08, never an empty rec card.
- `EarlierStrip` reopen: full-history `voice-conversation` screen; `voiceTurns`
  already persists.
- `prefers-reduced-motion`: static waveform, instant transitions, no transcript
  typing effect.
- TTS speaking on mic tap: existing `bargeIn()` in the frozen `handleToggle`.

## Testing

vitest + @testing-library, no new frameworks.
- `VoiceDockPanel.test.tsx` — LISTENING pill + transcript from `interim` prop;
  `EarlierStrip` hidden at 0 turns / "· 2 more" at 3; `Close` → `onClose`;
  mic-mark tap → `onToggle`.
- `VoiceAnswerCard.test.tsx` — rec: one row per `matchedItems` (cap 3), `Add` →
  `onAddItem`, stepper when `getQuantity > 0`; info: `text` + footnote, no rows
  when `matchedItems` empty.
- `EarlierStrip.test.tsx` — truncation + count; tap → `onExpand`.
- `useMicLevels.test.ts` — mock `AudioContext` / `getUserMedia`; zeroed array
  when inactive; zeros (no throw) on rejection; tracks stopped on `active →
  false`.
- `VoiceConversationScreen.test.tsx` — 07 vs 08 branch; speak-dock → toggle;
  `Close` → close handler.
- **Frozen-pipeline guard:** assert `VoiceConversationPanel` still calls
  `startSttPress(sessionId, handler, cartItems)` on mic toggle (mock
  `lib/voice/sttClient`).
- `pnpm test` green; `pnpm build` clean.
- **Manual, order-engine up, on the K9:** speak → 06 waveform reacts → answer
  → 07 addable dishes → ask a fact → 08 text-only → speak-dock → 06.
  Reduced-motion pass. Two-stream mic check on the physical tablet.

## Out of scope

- Any change to `lib/voice/*` or the STT/TTS call sequence.
- Macro / prep-time / allergen data (backend work).
- Backend-generated quick replies.
- The `VoiceOrderButton` dock button on the menu itself (its
  `.tt-voice-ptt-*` styling stays as-is).
