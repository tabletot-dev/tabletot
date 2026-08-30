# Task 6 — Integrate: host rewrite, Index wiring, delete dead ListeningScreen

**Status:** DONE_WITH_CONCERNS
**Branch:** `kiosk-v1-sprint-6-7` (worked directly, no worktree)
**Tests:** 104/104 pass (26 files). **Build:** `tsc --noEmit` + `vite build` both clean.

---

## What changed, per file

### `apps/kiosk/src/hooks/useMicLevels.ts` (deferred cleanup 1)
- Removed the dead `const IDLE = { levels: [], rms: 0 }` line and the trailing
  `void IDLE;`. No behavioural change — `IDLE` was never read.

### `apps/kiosk/src/styles/tabletot.css` (deferred cleanup 2 + Step 6 deletions)
- **Cleanup 2 (transform-based wave):** `.tt-voice-wave span` (the Task-4 dock
  waveform) now `height: 100%; transform-origin: bottom;
  transform: scaleY(var(--h, 0.08)); transition: transform 90ms linear;`
  (was `transition: height 90ms linear` with inline `height`).
  `.tt-voice-wave--idle span` → `transform: scaleY(0.12); opacity: .5;`
  (dropped the `!important` height). `is-accent` rule untouched. The
  `@media (prefers-reduced-motion)` block that kills the transition stays.
- **Step 6 deletions:** removed the ListeningScreen sheet block
  (`.tt-voice-sheet*`, `.tt-voice-sheet-handle`, `.tt-voice-sheet-top`,
  `.tt-voice-active-mark`, `.tt-voice-orb`, `.tt-voice-orb .tt-voice-mic-icon`,
  `.tt-voice-ring`, `.tt-voice-ring-b`, `.tt-voice-close`,
  `.tt-voice-sheet-copy h2`, the **old** `.tt-voice-wave` + its
  `nth-child` height table) and the entire conversation-panel block
  (`.tt-voice-conversation-backdrop / -panel / -head / -head h2 / -close /
  -stream / -stream::-webkit-scrollbar`, `.tt-voice-chat-row(.user/.ai)`,
  `.tt-voice-chat-bubble` + variants, `.tt-voice-prompt-grid` (+ span),
  `.tt-voice-recommendation-grid / -card / -media / -body / -title /
  -title strong / -action / -action span / -action button`,
  `.tt-voice-stepper` (+ button/span), `.tt-voice-conversation-input`
  (+ `.is-listening ...`), `.tt-voice-input-status`, `.tt-voice-live-dot`,
  `.tt-voice-frequency-meter` (+ span), `.tt-voice-stop-btn` (+ span/.muted)).
- **Kept:** `.tt-voice-ptt-*` (dock button), all Task-4 redesign rules
  (`.tt-voice-dock*`, `.tt-voice-convo*`, `.tt-voice-answer*`,
  `.tt-voice-earlier*`, `.tt-voice-speakdock*`, `.tt-voice-said*`, the **new**
  `.tt-voice-wave`), `@keyframes tt-voice-bar` (still used by
  `.tt-voice-modal-wave`).
- **Not touched (out of scope — the deferred ~100 dead pre-v1.0 rules):**
  `.tt-voice-button`, standalone `.tt-voice-mic-icon` + `.waiter-dot
  .tt-voice-mic-icon`, `.tt-voice-modal-*`, `.tt-voice-banner*`,
  `.tt-voice-prompt-list` / `.tt-voice-prompt` / `.tt-voice-prompt.active`,
  now-orphaned `@keyframes pulse-ring`. None are referenced by any component;
  the brief's Step 6 list did not include them.
- **Verify:** `grep -c "tt-voice-conversation-panel\|tt-voice-chat-row\|
  tt-voice-frequency-meter\|tt-voice-orb" apps/kiosk/src/styles/tabletot.css`
  → **0**.

### `apps/kiosk/src/hooks/useDeviceNavigation.ts` (Step 1)
- `ScreenType`: removed `| "listening"`, added `| "voice-conversation"`.

### `apps/kiosk/src/components/screens/ListeningScreen.tsx` (Step 2)
- Deleted. **No test file existed** (`__tests__/ListeningScreen.test.tsx` was
  not present), so nothing else to remove there.

### `apps/kiosk/src/components/VoiceConversationPanel.tsx` (Step 4 — the host)
- Now a thin frozen-code host. Dropped the framer-motion / Radix Dialog import,
  `DietMark`, `itemImageBackground`, and the entire old modal `return (...)`.
- **Frozen code preserved byte-for-byte** (see quote below): the `useState`
  `pressStatus`, all three `useRef`s (`sttRef`, `streamEndRef`,
  `pressStatusRef`), the `pressStatusRef` sync effect, the auto-scroll effect,
  the `handleToggle` recording state machine incl. `ttsHandle?.current?.bargeIn()`
  and the `startSttPress(sessionId, handleSttMessage, cartItems)` call with the
  same `order.map(...)` shape, and the unmount cleanup effect.
- **Added (brief-sanctioned):**
  - `const [transcript, setTranscript] = useState("")` — a display-only state.
  - In `handleSttMessage`, a leading `if (msg.type === "interim" || msg.type
    === "final") { setTranscript(msg.text); return; }`. The pre-existing
    `done` / `no_speech` / `error` branches are unchanged. `interim`/`final`
    were previously silently ignored (no-op), so this adds a re-render only,
    no pipeline effect.
  - Two lifting effects:
    `useEffect(() => { onToggleReady(handleToggle); }, [handleToggle, onToggleReady])`
    and
    `useEffect(() => { onPressStatusChange(pressStatus); }, [pressStatus, onPressStatusChange])`.
  - New additive props: `voicePhase`, `onPressStatusChange`, `onToggleReady`,
    `transcript?`, `onExpandHistory`, `onChip`. All existing props kept
    (`getQuantity`/`onAddItem`/`onUpdateQuantity`/`onSelectItem` are now unused
    inside the host but retained in the interface as instructed).
  - New `return`: `if (voicePhase !== "dock") return null;` then
    `<VoiceDockPanel status={pressStatus === "processing" ? "processing" :
    "recording"} transcript={transcript} turns={turns}
    onToggle={() => void handleToggle()} onClose={onClose}
    onExpandHistory={onExpandHistory} onChip={onChip} />`.

### `apps/kiosk/src/components/voice/VoiceDockPanel.tsx` (cleanup 2)
- Waveform bars now `style={{ ["--h" as any]: Math.max(0.08, h) }}` instead of
  `style={{ height: ... }}`. `is-accent` class logic unchanged.

### `apps/kiosk/src/pages/Index.tsx` (Step 5)
- Removed the `ListeningScreen` import and the whole `case "listening":` block.
- Added `import VoiceConversationScreen from "@/components/voice/VoiceConversationScreen"`.
- Replaced `voiceConversationOpen` state with:
  - `voicePressStatus` (`"recording"|"processing"|"idle"|"error"`, set via the
    host's `onPressStatusChange`),
  - `voiceAnswerOpen` (bool; set true on a fresh ai turn, cleared on Close),
  - `voiceToggleRef` (`useRef<(() => void) | null>`, set via `onToggleReady`).
- Derived, non-authoritative:
  `voicePhase = (voicePressStatus is recording|processing) ? "dock"
   : (last turn role === "ai" && voiceAnswerOpen) ? "answer" : "closed"`.
- New effect watching `voiceTurns`: when the array grows and the last turn is
  `role: "ai"`, `setVoiceAnswerOpen(true)` + `setCurrentScreen("voice-conversation")`.
  `handleVoiceDone` itself is **untouched**. Guarded by a
  `prevVoiceTurnCountRef` so it fires once per new answer.
- `case "voice-conversation":` renders `<VoiceConversationScreen turns={voiceTurns}
  getQuantity={getOrderQuantity} onAddItem={(i) => handleAddToOrder(i, "voice")}
  onUpdateQuantity={(id, d) => handleUpdateQuantity(id, d, "voice")}
  onSelectItem={handleSelectItem} onClose={closeVoiceConversation}
  onRequestSpeak={() => { setCurrentScreen("menu"); voiceToggleRef.current?.(); }} />`.
  `closeVoiceConversation` = clear the answer flag + `setCurrentScreen("menu")`.
- `menu` case: `VoiceConversationPanel` is now rendered **unconditionally**
  when `voiceEnabled` (no longer gated on an "open" flag) in the `voicePanel`
  slot, with the new props. `onExpandHistory` → `setCurrentScreen("voice-conversation")`.
  `onChip` → `handleVoiceChip` (appends the chip text as a user `Turn`,
  visual-only — the spec's sanctioned fallback since there is no non-frozen
  pipeline entry point for injected text).
- `VoiceOrderButton`'s `onOpenConversation` is now
  `() => voiceToggleRef.current?.()` — the dock button triggers the first
  capture via the lifted toggle instead of opening a modal. The frozen
  `VoiceOrderButton.handleToggle` conversation-mode branch still just calls
  `onOpenConversation?.()` and returns.

### Tests
- **New:** `apps/kiosk/src/components/__tests__/VoiceConversationPanel.frozen.test.tsx`
  — the brief's frozen-pipeline guard. Two adaptations were required and are
  test-fixture-only (the frozen component was not touched):
  1. `const startSttPress = vi.fn()` at top level then referenced inside
     `vi.mock` throws `Cannot access 'startSttPress' before initialization`
     (vi.mock is hoisted). Switched to
     `const { startSttPress } = vi.hoisted(() => ({ startSttPress: vi.fn()... }))`.
  2. `{ stop: vi.fn() }` makes `stop()` return `undefined`, and the **frozen**
     unmount cleanup does `sttRef.current?.stop().catch(...)` → TypeError on
     teardown. Mock is now `{ stop: vi.fn().mockResolvedValue(undefined) }`.
  The assertion itself is verbatim: `startSttPress` called with
  `("s1", expect.any(Function), [{ id:"a", name:"X", qty:1, price:10 }])`.
- **Rewritten:** `VoiceConversationPanel.test.tsx` — the old "B1 Radix Dialog
  wrapper" / opaque-backdrop / Escape-closes cases are obsolete (no Dialog, no
  backdrop). Replaced with: renders `VoiceDockPanel` when `voicePhase==="dock"`;
  renders nothing for `"answer"` / `"closed"`; `onToggleReady` receives a
  function; the dock Close button calls `onClose`.

---

## Frozen call sequence preserved (verbatim from the committed file)

```tsx
const handleToggle = useCallback(async () => {
  if (!sessionId) return;

  if (pressStatusRef.current === "recording") {
    setPressStatus("processing");
    try {
      await sttRef.current?.stop();
    } catch {
      setPressStatus("idle");
    }
  } else if (pressStatusRef.current === "idle") {
    ttsHandle?.current?.bargeIn();
    setPressStatus("recording");
    try {
      const cartItems = order.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.quantity,
        price: item.price,
      }));
      const handle = await startSttPress(sessionId, handleSttMessage, cartItems);
      sttRef.current = handle;
    } catch {
      setPressStatus("idle");
    }
  }
}, [sessionId, order, handleSttMessage]);
```

`git diff` on `VoiceConversationPanel.tsx` shows **no `+`/`-` line** touching
`startSttPress`, `handleToggle`'s body, `bargeIn`, any `useRef`, `sttRef`,
`pressStatusRef`, `setPressStatus`, or the unmount cleanup. The only edit
inside `handleSttMessage` is the prepended `interim`/`final` branch.
`handleVoiceDone` in `Index.tsx` is unchanged.

---

## Guard-test output

```
✓ src/components/__tests__/VoiceConversationPanel.frozen.test.tsx (1 test)
  ✓ still calls startSttPress(sessionId, handler, cartItems) when the mark is toggled
```

## Full suite + build

```
Test Files  26 passed (26)
     Tests  104 passed (104)

> tsc --noEmit -p tsconfig.app.json && vite build
✓ 2495 modules transformed.
✓ built in 2.93s
```

---

## Concerns

1. **No `backendStatus` in the host.** The brief's Step 4 snippet references
   `backendStatus === "error"` for both `onPressStatusChange` and the dock
   `status` prop, but `VoiceConversationPanel` has no such state (it only ever
   had `pressStatus`; `backendStatus` lives in `VoiceOrderButton`). Per the
   "additive props / no new state" and frozen rules I did **not** add one, so
   the host never emits `"error"` and the dock's `status="error"` visual path
   (degraded pill, disabled mark, per spec's error-handling section) is
   currently unreachable through this host. Backend failure still degrades
   gracefully in practice — `onSessionReady` never fires, so `sessionId` stays
   `null` and `handleToggle` early-returns — but the dock won't *show* the
   "Voice unavailable" state. Wiring `VoiceOrderButton`'s `backendStatus` up to
   Index and down as a prop is a small follow-up if that visual is wanted.

2. **Host unmounts on the answer screen.** `VoiceConversationPanel` (and
   `VoiceOrderButton`) live in the `menu` case only, so navigating to
   `currentScreen: "voice-conversation"` unmounts them and tears down the
   STT/TTS session (frozen cleanup + `VoiceOrderButton`'s `endSession`). The
   speak-dock's `onRequestSpeak` does `setCurrentScreen("menu");
   voiceToggleRef.current?.()` synchronously — the ref still holds the *old*
   (torn-down) toggle at that instant, and the remounted `VoiceOrderButton`
   needs a network round-trip to establish a fresh session, so the first tap
   of the speak-dock will not start recording; the user taps the mic mark
   again once the new session is ready. This matches the brief's literal
   wiring; a clean fix (hoist the host above the screen switch, or defer the
   toggle to a post-remount effect) is out of scope for this task. Same
   applies to tapping `EarlierStrip` mid-recording. Flagged for the K9 manual
   QA pass.

3. **Dock quick-reply chips are visual-only** (`handleVoiceChip` appends a
   user `Turn`). This is the fallback the spec explicitly allows ("no pipeline
   edit either way"); a real chip→answer path needs backend/frozen work.

---

## Fix round 1

**Finding addressed:** the frozen STT/TTS host (`VoiceConversationPanel`) unmounted
whenever `currentScreen` left `"menu"`, because it was rendered in `MenuView`'s
`voicePanel` slot — which only exists in `case "menu":` of `renderScreen()`. On the
answer screen (`currentScreen === "voice-conversation"`) the host tore down (frozen
unmount cleanup + `sttRef.current?.stop()`), and `voiceToggleRef.current` became a
stale closure, so the answer screen's speak-dock drove a dead toggle and every
menu→voice-conversation→menu round-trip restarted the frozen session.

### What moved (render LOCATION only — no prop wiring changed)

- **`apps/kiosk/src/pages/Index.tsx`**
  - Deleted the `voicePanel={ voiceEnabled ? <VoiceConversationPanel .../> : null }`
    prop from the `<MenuView>` call in `case "menu":`.
  - Re-rendered the **same** `<VoiceConversationPanel>` with the **same** props
    (`sessionId`, `turns`, `order`, `getQuantity`, `onClose`, `onDone={handleVoiceDone}`,
    `onAddItem`, `onUpdateQuantity`, `onSelectItem`, `ttsHandle`, `voicePhase`,
    `onPressStatusChange`, `onToggleReady`, `transcript=""`, `onExpandHistory`,
    `onChip`) at the top-level return, inside the `position:relative` wrapper next to
    the `{paymentConfirmed && …}` / `{nudgeMounted && …}` overlays, gated on
    `voiceEnabled && (currentScreen === "menu" || currentScreen === "voice-conversation")`.
    `.tt-voice-dock` is `position: fixed; z-index: 9980`, so it needs no `MenuView`
    layout. The host renders `null` unless `voicePhase === "dock"`, so on the answer
    screen it is mounted-but-invisible — the spec's "stays mounted whenever voice is
    active".
- **`apps/kiosk/src/components/screens/MenuView.tsx`**
  - Dropped the now-unused `voicePanel?: ReactNode` from `MenuViewProps`, the
    destructure, and the `{voicePanel}` render node. Nothing else passed `voicePanel`
    (verified with `rg`).

Frozen code untouched: `src/lib/voice/*`, `handleVoiceDone`, and everything inside
`VoiceConversationPanel` / `VoiceOrderButton` (`startSession`/`openTtsClient`/
`startSttPress`, `handleSttMessage`, `handleToggle`, refs, `bargeIn()`). `git diff`
touches only the two files above.

### Reasoning through the flipped screen

With `currentScreen` toggling `"menu"` ↔ `"voice-conversation"`, the gate stays
true the whole time, so `<VoiceConversationPanel>` never unmounts across that
transition. Its `handleToggle` `useCallback` stays alive; `onToggleReady` already
handed it to `voiceToggleRef.current`, which keeps pointing at a live closure. The
frozen unmount cleanup does not fire. menu→voice-conversation→menu no longer
restarts the frozen session.

### Verify

- `pnpm --dir apps/kiosk test` → **Test Files 26 passed (26) · Tests 104 passed (104)**
  (unchanged; no test asserted the host lived under the menu screen —
  `VoiceConversationPanel.test.tsx` mounts it in isolation — so no test edit needed).
- `pnpm --dir apps/kiosk build` → `tsc --noEmit` clean + `vite build` ✓ 2495 modules,
  built in 3.10s.

### Remaining concern (unchanged from concern 2, now narrower)

`VoiceOrderButton` still lives only in `MenuView`'s `voiceDock` slot, so it still
unmounts on the answer screen and its `endSession` fires. It owns the backend
session (`onSessionReady={setVoiceSessionId}`), so `voiceSessionId` can go stale
while on `"voice-conversation"`, and the frozen `handleToggle` early-returns
`if (!sessionId) return`. The speak-dock's first tap after `onRequestSpeak` may
therefore still no-op until `VoiceOrderButton` remounts on `"menu"` and
re-establishes a session. The review finding scoped this fix to the panel and
marked `VoiceOrderButton` do-not-touch, so it was left as-is. Flagged for the K9
manual QA pass; hoisting `VoiceOrderButton` the same way is the follow-up if the
speak-dock's first tap needs to be instant.

---

## Fix round 2

**Finding addressed:** the answer screen's speak-dock (`VoiceConversationScreen`'s
`onRequestSpeak` handler) was driving a stale `voiceToggleRef.current` closure.
When the speak-dock button tapped, the handler did
`setCurrentScreen("menu"); voiceToggleRef.current?.()` synchronously, but by that
instant the ref still held the *old* toggle from the torn-down session. The second
line (the `voiceToggleRef.current?.()` call) was the bug.

### What changed

**`apps/kiosk/src/pages/Index.tsx`**
- `case "voice-conversation":` → `onRequestSpeak` prop simplified from
  ```tsx
  onRequestSpeak={() => {
    setCurrentScreen("menu");
    voiceToggleRef.current?.();
  }}
  ```
  to
  ```tsx
  onRequestSpeak={() => setCurrentScreen("menu")}
  ```
  The guest now lands on the menu where the real coral mic dock is and taps it
  to speak once the session is ready — no attempt to auto-start a capture from
  a stale or remounting toggle.

**`voiceToggleRef` remains declared** (line 217) because it is still:
- Read by `VoiceOrderButton`'s `onOpenConversation` callback (line 559)
- Set by `VoiceConversationPanel`'s `onToggleReady` prop (line 760)

Verified with `grep voiceToggleRef`: 5 hits (declaration, comment, old call site
now removed, button use, setter). Only the call site in `onRequestSpeak` was
deleted.

### Verify

- `pnpm --dir apps/kiosk test` → **Test Files 26 passed (26) · Tests 104 passed (104)**
- `pnpm --dir apps/kiosk build` → `tsc --noEmit` clean + `vite build` ✓ 2495 modules,
  built in 2.93s

---

## Final fix wave

Branch `kiosk-v1-sprint-6-7`. One pass, one commit. Every item from
`final-fix-brief.md` (C1, C2, I2–I5, minors 1–16). I1 left as accepted.

### Critical

**C1 — hoist `VoiceOrderButton` so the voice session survives the answer screen.**
`VoiceOrderButton` (owns the backend session; unmount cleanup calls `endSession`)
moved out of `MenuView`'s `voiceDock` slot to the Index top-level overlay block
(`Index.tsx:764–784`), wrapped in `<div className="tt-voicedock">`. Mounted for
`voiceEnabled && (currentScreen === "menu" || "voice-conversation" || "item-detail")`;
hidden (not unmounted) off the menu via `tt-voicedock--hidden` (`Index.tsx:773`).
`voiceDock` prop removed from the `<MenuView>` call and from `MenuViewProps` /
the destructure / the render (`MenuView.tsx:8–19,~138`; unused `ReactNode` import
dropped). `.tt-voicedock` rebuilt as `position: fixed; right: var(--tt-gutter);
bottom: calc(var(--tt-tap-primary) + var(--tt-space-4)); z-index: 9970` +
`.tt-voicedock--hidden { display:none }` (`tabletot.css:3876–3891`) — it no longer
sits in MenuView's flow. The `setVoiceTurns([])` effect on `voiceSessionId` is
untouched (not guarded), as instructed.

**C2 — the dock's `Close ✕` is now live.**
New `voiceDockDismissed` state (`Index.tsx:222`). `voicePhase` consults it first:
`voiceDockDismissed ? "closed" : …` (`Index.tsx:446–452`). New `handleVoiceDockClose`
(`Index.tsx:459–464`): if `voicePressStatus === "recording"` it calls
`voiceToggleRef.current?.()` to stop capture, then `setVoiceDockDismissed(true)` +
close; passed to `<VoiceConversationPanel onClose>` (`Index.tsx:792`). Cleared on
the next capture in the new `handleVoicePressStatusChange` wrapper — sets
`voiceDockDismissed=false` when the incoming status is `"recording"`, then
`setVoicePressStatus` (`Index.tsx:467–473`), wired at `Index.tsx:796`. The
`processing` case: the answer-screen auto-switch effect is now gated on
`!voiceDockDismissed` (`Index.tsx:240–250`), so a `done` landing after a Close
during processing no longer yanks the guest onto the answer screen.

### Important

**I2 — `useMicLevels` no longer `setState`s per frame.** `useMicLevels.ts`
rewritten: the rAF loop keeps `smoothed` in a closure and writes each bar's
height straight to the DOM via a `barsRef` callback ref
(`bars[i].style.setProperty("--h", …)`, `useMicLevels.ts:53`). React state now
carries only a coarse `rms` bucket (`0`/`1`), pushed only when it flips
(`useMicLevels.ts:58–59`). Return shape kept as `{ levels, rms, barsRef }` —
`levels` stays a zeroed array for the inactive / reduced-motion / denied paths.
`VoiceDockPanel.tsx` renders a fixed 24 `<span>`s with `ref={(el) => barsRef(el, i)}`
and no inline style (`VoiceDockPanel.tsx:64–70`). Test mocks updated to return
`barsRef` (`VoiceDockPanel.test.tsx:6`, `VoiceConversationPanel.test.tsx:14`);
`useMicLevels.test.ts` still passes unchanged (its assertions are all on the
inactive/denied `levels`/`rms` shape).

**I3 — dock shows a distinct `processing` state.** `VoiceDockPanel.tsx` status is
now three-way (`VoiceDockPanel.tsx:29–48`): `processing` → `● PROCESSING` pill +
`One moment…` hint, mic mark disabled, no live waveform (bars render static);
`recording` → unchanged; `error` → unchanged. Mark `disabled={!isRecording}`
(`VoiceDockPanel.tsx:61`). Added `.tt-voice-dock-pill--processing`
(`tabletot.css:5823–5829`). New tests cover the processing pill/hint/disabled
mark (`VoiceDockPanel.test.tsx`).

**I4 — `Add both` only adds shown items.** `VoiceConversationScreen.tsx`:
`itemsShown = (lastAi?.matchedItems ?? []).slice(0, 3)` (`:50`); `Add both`
iterates `itemsShown` (`:59`); the chip renders only when
`itemsShown.length === 2` (`:54`). For 3 shown the chip is dropped.

**I5 — earlier/recent split no longer assumes the tail is `[user, ai]`.**
`VoiceConversationScreen.tsx:44–48` now anchors on the last `ai` turn via
`turns.map(t => t.role).lastIndexOf("ai")`, then the last `user` before it, and
`earlier = turns.slice(0, iUser >= 0 ? iUser : iAi >= 0 ? iAi : turns.length)`.

### Minors

1. **Dead `streamEndRef`** — removed the ref and the `scrollIntoView`-on-`[turns]`
   effect from `VoiceConversationPanel.tsx` (the target `<div>` was already gone).
2. **Dead `transcript` prop** — removed from `VoiceConversationPanelProps`, the
   `Index.tsx` call site (`transcript=""`), and both test files' props
   (`VoiceConversationPanel.test.tsx`, `.frozen.test.tsx`). Internal
   `useState("")` keeps the name.
3. **Four dead `_`-prefixed host props** — `getQuantity`/`onAddItem`/
   `onUpdateQuantity`/`onSelectItem` removed from the interface, the destructure,
   the `Index.tsx` `<VoiceConversationPanel>` call, and the two test files. Unused
   `MenuItem` import dropped from `VoiceConversationPanel.tsx`.
4. **Transcript cleared between presses** — new render-only effect in
   `VoiceConversationPanel.tsx:63–68`: on `pressStatus === "recording"`,
   `setTranscript("")` + `setInterim(false)`. `handleToggle` untouched.
5. **Ellipsis only on partials** — `VoiceConversationPanel` now tracks `interim`
   (`:52`, set beside the frozen `setTranscript(msg.text)` at `:73–75`) and passes
   `interim={interim}` to the dock (`:140`); `VoiceDockPanel` renders the trailing
   `…` only when `interim` (`VoiceDockPanel.tsx:76–79`). New test covers both.
6. **Error state drops the stop hint** — the `Tap the mark again to stop` hint
   now renders only for `recording` (`VoiceDockPanel.tsx:44–46`); `error` and
   `processing` don't show it. Test asserts absence.
7. **Mic mark on the left** — DOM order in `.tt-voice-dock-wave-row` swapped so
   the `.tt-voice-dock-mark` button precedes the waveform
   (`VoiceDockPanel.tsx:54–71`).
8. **`["--h" as any]`** — gone: I2's ref-based writes removed the inline style
   object entirely.
9. **Pluralisation** — `VoiceConversationScreen.tsx:87`:
   `{turns.length} {turns.length === 1 ? "message" : "messages"}`.
10. **Redundant "Show all"** — deleted the standalone `Show all` button under the
    `EarlierStrip` in `VoiceConversationScreen.tsx` (the strip is itself
    tap-to-expand). `Show recent` kept as the single collapse affordance in the
    expanded view.
11. **Chip fallback consistency** — `VoiceConversationScreen` now takes an
    `onChip` prop; unmatched chip labels call `onChip(label)` (`:66`) instead of
    `onRequestSpeak()`. `Index.tsx` passes the same `handleVoiceChip`
    (append-a-user-turn) to both the convo screen (`:539`) and the dock panel.
    `Back to the menu` / `Add both` stay special-cased. `onChip: vi.fn()` added
    to the screen test's `base`.
12. **Leftover integration comments in CSS** — removed the two "Paste this block
    into apps/kiosk/src/styles/tabletot.css …" lines (`tabletot.css`, Task 4 and
    Task 5 headers).
13. **Token drift in the new voice CSS** — `border-radius: 999px` →
    `var(--tt-radius-pill)` in `.tt-voice-convo-close`, `.tt-voice-convo-chip`,
    `.tt-voice-speakdock-mark`; `var(--tt-font-display, "Sora", sans-serif)` →
    `var(--tt-font-display)` in `.tt-voice-convo-head h1`;
    `.tt-voice-speakdock-mark` `40px` w/h → `calc(36px * var(--tt-scale))`.
14. **Sticky convo chips were transparent** — `.tt-voice-convo-chips` given
    `background: var(--tt-field)` + `padding: var(--tt-space-2) 0`
    (`tabletot.css`).
15. **Test isolation** — `VoiceConversationScreen.test.tsx` got a
    `beforeEach(() => vi.clearAllMocks())`.
16. **Frozen guard test tidy** — `VoiceConversationPanel.frozen.test.tsx`:
    `let toggle: (() => void) | null = null`, `await waitFor(() =>
    expect(toggle).not.toBeNull())` then `toggle!()`, unused `fireEvent` import
    removed. The real `startSttPress(sessionId, handler, cartItems)` assertion
    kept.

### Not done (per brief)

Real `backendStatus`/error signal wiring; deleting the ~200 lines of older dead
`.tt-voice-*` CSS; graphify refresh.

### Verify

- `pnpm --dir apps/kiosk test` → **Test Files 26 passed (26) · Tests 106 passed
  (106)** (104 + 2 new VoiceDockPanel tests for the processing state and the
  interim ellipsis).
- `pnpm --dir apps/kiosk build` → `tsc --noEmit -p tsconfig.app.json` clean +
  `vite build` ✓ 2495 modules, built in ~2.9s.
