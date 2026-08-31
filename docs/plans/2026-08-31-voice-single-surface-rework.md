# Voice channel — single continuous surface (rework)

**Date:** 2026-08-31
**Branch:** `kiosk-v1-sprint-6-7` (continues the voice redesign)
**Status:** plan drafted, awaiting approval — NOT started
**Supersedes:** the 06-overlay / 07-08-separate-screen split from
`docs/plans/2026-08-30-voice-channel-redesign-spec.md` and its plan. The new
components (`VoiceAnswerCard`, `EarlierStrip`, `useMicLevels`,
`VoiceConversationScreen`) stay; the way they compose changes.

## Why

After building the redesign, in use the flow forces the guest out of the
conversation to speak again:

1. Menu — the mic is a small icon tucked bottom-right.
2. Tap → a dark dock overlays the **menu** (old screen 06).
3. An answer lands → the app **switches to a separate full-screen**
   `voice-conversation` view (07/08).
4. Its "Tap the mark to speak" bar calls `onRequestSpeak` →
   **`setCurrentScreen("menu")`** — bounces back to the menu to find the small
   mic again.

Steps 3–4 are the "open a new window / go back" the guest hits every follow-up
turn. (Step 4 came from review fix C1/round-2 — the old speak-dock drove a
stale session, so it was made to navigate instead of record.)

## Target

One continuous surface. Tap a prominent entry → land on the voice screen → tap
its mic → talk → the answer appends to the thread → tap the mic **in the same
view** → talk more → the thread extends. No screen switch mid-conversation.
`Close ✕` returns to the menu and keeps the session + thread warm.

## Decisions (locked 2026-08-31)

1. **Behind the live dock: the conversation thread**, not the menu. (Overrides
   the mockup's screen-06 "menu visible while listening".)
2. **Menu tap opens the voice screen with an *idle* dock** — the guest taps the
   big mic there to start (a beat to read the greeting/prompts first). No
   auto-record.
3. **Menu entry = a labelled coral pill, "🎙 Ask Tabletot"**, docked above the
   order bar, clearly visible. Replaces the small `VoiceOrderButton` icon.
4. **`Close ✕` keeps the session warm and the thread preserved.** Re-opening
   resumes the same conversation.

## Frozen — unchanged, in every task

`handleToggle`, `handleSttMessage`, the `startSession`/`endSession` /
`openTtsClient` / `startSttPress` sequence, every `useRef`, `ttsHandle.bargeIn()`,
`handleVoiceDone`, and all of `apps/kiosk/src/lib/voice/*`. The existing
render-only `setTranscript` / `setInterim` inside `handleSttMessage` is the one
accepted deviation and stays as-is. This rework changes *which screen renders*,
the dock's markup/CSS, and the `Index.tsx` wiring only.

---

## Architecture change

### Before (current, `c02b320`)
- `Index.tsx` derives `voicePhase: "dock" | "answer" | "closed"` and, on a fresh
  ai turn, `setCurrentScreen("voice-conversation")`.
- `VoiceConversationPanel` (host) renders `<VoiceDockPanel>` as a
  `position: fixed` dark overlay when `voicePhase === "dock"`, `null` otherwise.
- `VoiceConversationScreen` (`case "voice-conversation"`) renders the thread +
  a dead "speak-dock" button whose tap navigates to the menu.

### After
- **`voice-conversation` is the whole voice experience.** You enter it from the
  menu pill and stay until `Close ✕`. No phase-driven screen switching.
- **`VoiceConversationPanel` becomes headless** — a logic-only container that
  owns the frozen STT/TTS machine and lifts `{ pressStatus, transcript,
  interim, toggle }` up to `Index.tsx`. It renders `null`. The `voicePhase`
  prop and the `<VoiceDockPanel>` render are removed from it.
- **`VoiceConversationScreen` renders a persistent bottom dock**, driven by
  those lifted values:
  - **idle** — a large coral mic mark + "Tap to speak". Plus, when
    `turns.length === 0`, a greeting line + the three prompt chips above it.
  - **recording** — the waveform (`useMicLevels`) + live transcript + "Tap to
    stop"; the mark is the stop affordance.
  - **processing** — "One moment…", mark disabled.
  - the mark's `onClick` → the lifted `toggle` (the frozen `handleToggle`).
  The thread scrolls above; the dock is pinned to the bottom of the screen
  (flex column: header / scroll region / dock).
- **`VoiceDockPanel`** is restyled from a `position: fixed` dark overlay to an
  in-screen footer element and gains an `idle` status. It stays a component
  (reused, tested); `VoiceConversationScreen` renders it as its footer.
- **Menu entry** — a new `.tt-voice-ask-pill` button in `Index.tsx`'s menu dock
  slot: coral fill, mic glyph + "Ask Tabletot". Tap →
  `setCurrentScreen("voice-conversation")` (idle dock, no capture).
- **`VoiceOrderButton`** — no logic change; it stays mounted for
  `menu | voice-conversation | item-detail` purely to own the session
  (`startSession` on mount / `endSession` on unmount / `onSessionReady`) and is
  rendered **always hidden** now (the visible entry is the pill; the visible
  record control is the in-screen dock).

### Deleted / collapsed
- `voicePhase`, `voiceAnswerOpen`, `voiceDockDismissed` state in `Index.tsx`.
- The "fresh ai turn → `setCurrentScreen`" effect (`Index.tsx:236-250`).
- `onRequestSpeak` / the `.tt-voice-speakdock*` button + CSS.
- `VoiceConversationPanel`'s `voicePhase` prop, its `<VoiceDockPanel>` render,
  and `onExpandHistory` (history expand stays inside `VoiceConversationScreen`
  via its existing local `expanded` state).
- The `.tt-voice-dock` `position: fixed` / dark-scrim framing (becomes a footer).

---

## Files

**Modify:**
| File | Change |
|---|---|
| `src/pages/Index.tsx` | Remove `voicePhase`/`voiceAnswerOpen`/`voiceDockDismissed` + the auto-switch effect. Add the `.tt-voice-ask-pill` entry in the menu dock slot. Wire the lifted `{pressStatus, transcript, interim, toggle}` from the headless host into `<VoiceConversationScreen>`. `Close` → `setCurrentScreen("menu")` only. `<VoiceOrderButton>` wrapper always `hidden`. |
| `src/components/VoiceConversationPanel.tsx` | Headless: keep the frozen machine + the existing lifts of `pressStatus`; add `useEffect` lifts of `transcript` + `interim`; `return null` always. Drop `voicePhase`, `onExpandHistory`, `onChip`, and the `<VoiceDockPanel>` import/render. |
| `src/components/voice/VoiceConversationScreen.tsx` | New props: `pressStatus`, `transcript`, `interim`, `onToggle`. Render `<VoiceDockPanel>` (or its inline equivalent) as a pinned footer driven by those. Add the empty-thread greeting + prompt chips. Remove `onRequestSpeak` + the `.tt-voice-speakdock` button. Layout: `display:flex; flex-direction:column; height:100%` — head, `overflow-y:auto` thread, footer dock. |
| `src/components/voice/VoiceDockPanel.tsx` | `status` gains `"idle"`. Idle render: big mark + "Tap to speak", no waveform/transcript. Container: drop `position:fixed`; it's a normal footer block now. Keep the recording/processing/error renders. |
| `src/components/VoiceOrderButton.tsx` | No code change (session owner). Index wraps it permanently hidden. |
| `src/styles/tabletot.css` | `.tt-voice-ask-pill` (coral pill, mic glyph, `--tt-tap` min-height, docked). `.tt-voice-dock` → footer layout, `--tt-ink` surface, `border-top: 2px solid var(--tt-line-dark)`, no `position:fixed`. `.tt-voice-convo` → flex column with a scrolling thread region and the pinned dock. Delete `.tt-voice-speakdock*`. Idle-mark styling (`.tt-voice-dock-mark--idle`, larger). |

**Tests to update:** `VoiceConversationScreen.test.tsx` (new dock props +
idle/recording/processing render, greeting on empty thread, no more
`onRequestSpeak`), `VoiceDockPanel.test.tsx` (idle status), `VoiceConversationPanel.test.tsx`
+ `.frozen.test.tsx` (headless — renders null, still lifts the toggle + now the
transcript), and any `Index`-level voice assertion.

**No new files.** No migrations. No `lib/voice/*` changes.

---

## Task breakdown (TDD, one commit each)

### Task 1 — `VoiceConversationPanel` goes headless
- Add `onTranscriptChange(text: string, interim: boolean)` (or lift both via an
  `onLiveState` callback) alongside the existing `onPressStatusChange`.
- Remove `voicePhase`, `onExpandHistory`, `onChip` props and the
  `<VoiceDockPanel>` import + render. `return null`.
- Frozen machine (`handleToggle`, `handleSttMessage`, refs, effects, the
  `startSttPress` call) byte-identical.
- Tests: `.frozen.test.tsx` still asserts `startSttPress(sessionId, handler,
  cartItems)` on the lifted toggle; add an assertion that
  `onTranscriptChange` fires when an `interim` message arrives; assert the
  component renders nothing.
- Commit: `refactor(kiosk): VoiceConversationPanel becomes a headless voice host`

### Task 2 — `VoiceDockPanel` gains an idle state, becomes a footer
- `status: "idle" | "recording" | "processing" | "error"`.
- `idle`: `.tt-voice-dock--idle` — large `.tt-voice-dock-mark` + "Tap to speak",
  no `EarlierStrip`/waveform/transcript/chips (those belong to the screen now —
  or keep `EarlierStrip` + chips, see Task 3's decision; simplest: the dock is
  JUST the mark + status line + waveform + transcript, and the screen owns
  `EarlierStrip` + chips).
- Container CSS: remove `position: fixed`; it lays out as a block. The screen
  pins it.
- Tests: idle renders the mark + "Tap to speak" and fires `onToggle`; recording
  unchanged; processing unchanged.
- Commit: `feat(kiosk): VoiceDockPanel idle state; render as an in-screen footer`

### Task 3 — `VoiceConversationScreen` hosts the persistent dock
- New props `pressStatus: "idle"|"recording"|"processing"|"error"`,
  `transcript: string`, `interim: boolean`, `onToggle: () => void`. Drop
  `onRequestSpeak`.
- Layout: `.tt-voice-convo` = `flex column, height 100%`; header (unchanged);
  `.tt-voice-convo-thread` = `flex: 1; overflow-y: auto` holding
  EarlierStrip/expand + `YOU SAID` + `VoiceAnswerCard` + the follow-up chips;
  `<VoiceDockPanel status={pressStatus} … onToggle={onToggle} />` pinned as the
  last child.
- Empty-thread state: when `turns.length === 0`, render a greeting
  ("Tell me what you need — I can suggest by appetite, diet, group size,
  allergens or pairings.") + the three prompt chips ("Suggest a post-gym meal"
  / "Recommend for three people" / "One veg, one non-veg") above the dock;
  tapping a prompt chip appends a visual user turn via the existing `onChip`.
- Remove the `.tt-voice-speakdock` button.
- Tests: renders the dock in each `pressStatus`; `onToggle` fires from the
  mark; greeting shows only when `turns` is empty; the existing rec/info/chip
  assertions still pass.
- Commit: `feat(kiosk): one continuous voice screen with a pinned live dock`

### Task 4 — `Index.tsx` wiring + the menu entry pill
- Delete `voicePhase`, `voiceAnswerOpen`, `voiceDockDismissed`, the auto-switch
  effect, `handleVoiceDockClose`'s dismiss logic (Close is now just
  `setCurrentScreen("menu")`).
- Headless host: keep it mounted for `menu | voice-conversation`; store the
  lifted `transcript`/`interim` in Index state; pass `{pressStatus, transcript,
  interim, onToggle: () => voiceToggleRef.current?.()}` into
  `<VoiceConversationScreen>`.
- Menu dock slot: render `<button className="tt-voice-ask-pill">` (mic glyph +
  "Ask Tabletot") → `setCurrentScreen("voice-conversation")`. Keep
  `<VoiceOrderButton>` mounted in a permanently-`hidden` wrapper for the
  session.
- `case "voice-conversation"` renders `<VoiceConversationScreen>` with the new
  props; `onClose={() => setCurrentScreen("menu")}`.
- Tests: an `Index`-level test that tapping "Ask Tabletot" shows the voice
  screen; the frozen host stays mounted across `menu ↔ voice-conversation`;
  no console errors.
- Commit: `feat(kiosk): menu "Ask Tabletot" entry; single-surface voice wiring`

### Task 5 — CSS + cleanup + verification
- `.tt-voice-ask-pill`, `.tt-voice-dock` footer layout, `.tt-voice-convo` flex
  column + scrolling thread, larger idle mark, delete `.tt-voice-speakdock*`.
- All new colour via `var(--tt-*)`; 2px borders; zero `box-shadow`.
- `grep -c 'tt-voice-speakdock\|voicePhase\|voiceAnswerOpen' src` → 0.
- `pnpm --dir apps/kiosk test` green; `pnpm --dir apps/kiosk build` clean.
- Browser walk (Supabase + order-engine up), 800×1340: menu → "Ask Tabletot" →
  voice screen (empty greeting) → tap mic → waveform + transcript in place →
  stop → answer appends to the thread → tap mic again **without leaving the
  screen** → second turn extends the thread → `Close ✕` → menu → "Ask Tabletot"
  again → same thread still there. Reduced-motion pass.
- Commit: `style(kiosk): single-surface voice CSS; drop the dead speak-dock`

---

## Open risks

- **Lifting `transcript` to `Index` state** re-renders the page on each STT
  partial (~2–5 Hz, not 60). Acceptable; the 60 Hz waveform already bypasses
  React via `useMicLevels`' direct DOM writes. If it ever matters, the dock
  could read transcript from a context/ref instead.
- **`VoiceOrderButton` hidden-but-mounted** is still the session owner; leaving
  `menu|voice-conversation|item-detail` unmounts it and ends the session
  (intended — "warm within the voice area"). Confirm `Close ✕` → `menu` keeps
  it mounted (it does: `menu` is in the guard).
- **Scroll position** — when an answer appends, the thread should stick to the
  bottom (show the newest). Add a `scrollIntoView` on the last turn (the old
  `streamEndRef` was removed as dead; a fresh one, correctly attached, is
  fine).
