# Kiosk Sprints 6–7 + reduced Task 7.0 — 2026-08-30

Branch `kiosk-v1-sprint-6-7` (cut from `main` @ `1de774c`). Not pushed/merged.
Plan: `docs/plans/2026-08-30-kiosk-sprint-6-7.md`.

## What shipped

| Commit | |
|---|---|
| `1076c69` | **6.1a** Venue/About screen (16). New `AboutView.tsx`; `restaurantContext` exposes `hours`/`chefName`/`chefNote` from `restaurants.config`; migration `0071` seeds them for Silver (**chef copy is placeholder — replace before pushing remote**); `onAbout` wired to the app-bar venue button; Back returns to the origin screen. |
| `c2fd137` | **6.1b** Third "About" secondary on the Attract panel, next to Popular/Wi-Fi. No `startSession()` (read-only). |
| `8a8c7bf` | **6.2** Games + Table Talk classes renamed off the legacy namespace (`.classic-ludo-*`→`.tt-ludo-*`, `.game-*`→`.tt-game-*`, `.conversation-*`→`.tt-talk-*`, …). Rule bodies untouched — screens render identically. |
| `74197f8` | **7.1/7.2** Voice dock + conversation panel + Listening screen classes renamed (`.voice-*`→`.tt-voice-*`, `.ptt-*`→`.tt-voice-ptt-*`). Voice pipeline untouched. |
| `b1cefa5` | **reduced 7.0** Warm Espresso CSS bridge removed: deleted the bridge `:root` (var aliases + `--shadow-*: none`) and the `body` dot-grid `!important` override; swept every bridge var to its `--tt-*` token globally; stripped all `box-shadow`/`backdrop-filter` declarations; `body` now paints flat `--tt-field`. |

## State of `apps/kiosk/src/styles/tabletot.css`

- **0** `:root` blocks (tokens live in `tokens.css`).
- **0** non-`--tt-*` `var()` refs.
- **0** `box-shadow` / `backdrop-filter` (2 doc-comment mentions remain).
- Still present, **deliberately deferred** (see plan doc, Task 7.0 note):
  - ~16 pre-`.tt-` primitive classes still used by shipped screens —
    `.eyebrow`, `.panel`, `.summary-line`, `.total-line`, `.row-total`,
    `.order-*`, `.bill-row`, `.detail-mic-*`, `.water-icon`, `.toast`,
    `.primary-btn`, `.secondary-btn`, `.hero-sub`, `.view`, `.ghost-pill`,
    `.card-stepper`. They read `--tt-*` tokens now; renaming them means
    touching CartView/BillView/DetailView + 5 more files.
  - ~100 dead pre-v1.0 rules (`.app-shell`, `.menu-sidebar*`, `.home-view`,
    old `.ludo-*`, `.ttboot-*`, `.utility-*`, …) above the `v1.0 SYSTEM`
    banner. No live selector matches them. A keep-list rebuild removes them.
  - Bridge-var → token sweep + physical relocation of the renamed
    `.tt-ludo-*` / `.tt-game-*` / `.tt-voice-*` rules (still sit above the
    banner). The global var sweep in `b1cefa5` already fixed the var refs;
    relocation is cosmetic.
- **StatusStrip** on the games screens (plan 6.2) was dropped — it needs
  cooking-round data `GamesView` doesn't take. Belongs with a real design pass.

## Verified

85 kiosk tests pass, build clean at every commit. Browser-walked at 800×1340:
Attract, Menu, Detail, Cart/Review, **Bill**, session status, Games, Ludo (full
board), Table Talk, voice dock — all render unchanged after the sweep. Migration
0071 applied to local Supabase; `types.ts` regenerated (was stale since 0068/0070).

---

# Voice channel redesign (screens 06/07/08) — 2026-08-30, same branch

Spec: `docs/plans/2026-08-30-voice-channel-redesign-spec.md`.
Plan: `docs/plans/2026-08-30-voice-channel-redesign.md`.
Executed subagent-driven (3-parallel batches, worktree-isolated), controller-reviewed,
final whole-branch review + 1 fix wave.

## What shipped (commits `a9ebada`..`c02b320`)

The pre-redesign "Ask Tabletot" centred modal is gone. New:
- `useMicLevels` — read-only audio-reactive waveform levels off a **second** mic
  stream (never feeds STT); rAF writes bar heights straight to the DOM, only a
  coarse rms bucket goes through React state.
- `EarlierStrip` — collapsed conversation history row.
- `VoiceAnswerCard` — ink-header composite card; `rec` variant (addable dish
  rows) / `info` variant (text + footnote). **No macro row / no dish meta line**
  — that data doesn't exist and the pipeline is frozen.
- `VoiceDockPanel` — screen 06: a docked ink overlay over the still-visible menu,
  with the live waveform, transcript, `EarlierStrip`, quick-reply chips, and
  three dock states (recording / processing / error).
- `VoiceConversationScreen` — screens 07/08: a full screen (`"voice-conversation"`
  `ScreenType`) with the thread, the answer card, chips, and a slim ink speak-dock.
- `VoiceConversationPanel` → a thin **frozen-code host**: keeps the STT/TTS
  machine and `handleToggle` verbatim, lifts `handleToggle` to `Index.tsx`,
  renders `VoiceDockPanel` when phase is `dock`.
- `ListeningScreen` **deleted** (dead — nothing set `currentScreen "listening"`).
- ~470 lines of old `.tt-voice-*` panel/chat/frequency-meter/sheet/orb CSS removed.

Frozen boundary held: `lib/voice/*` and `handleVoiceDone` untouched; `handleToggle`,
the STT/TTS call sequence, refs and `bargeIn()` byte-identical (pinned by
`VoiceConversationPanel.frozen.test.tsx`). One accepted deviation: a
render-only `setTranscript(msg.text)` prepend for `interim`/`final` messages
(those types previously had no handler — provable pipeline no-op).

## Verified

106 kiosk tests pass, build clean. **Screen 07 browser-checked** at 800×1340
(throwaway seed, reverted) — matches the mockup. **Screens 06 and 08 were not
screenshot-verified** (local Supabase dropped mid-QA → "setup needed" guard);
their components pass unit tests and share 07's token CSS.

## Left for the device QA pass (Lenovo K9)

- 06 and 08 visual check; two-concurrent-`getUserMedia`-streams check (waveform
  analyser vs STT capture) — if the device serialises mic access, `useMicLevels`
  falls back to a static idle wave and capture wins.
- The hoisted `.tt-voicedock` `position: fixed` offset
  (`bottom: calc(var(--tt-tap-primary) + var(--tt-space-4))`) is a reasoned
  estimate — confirm it clears the order bar and doesn't overlap the 06 overlay.

## Post-merge follow-ups (ledgered)

- The dock "Voice unavailable" error state is unreachable — the host has no
  `backendStatus`; a backend-down mic tap is a silent no-op. Wire an error
  signal from the frozen `startSession` catch.
- 2 Low residuals from the final review, parked: (R1) the host's mount guard
  doesn't include `item-detail` so `voiceToggleRef` is briefly stale there
  (harmless — dock is hidden, nothing calls it); (R2) closing the dock during
  `processing` means that one answer needs a fresh capture to re-reach full-screen.
- ~200 lines of *older* dead `.tt-voice-*` CSS (`.tt-voice-button`,
  `.tt-voice-prompt*`, `.tt-voice-banner*`, `@keyframes pulse-ring`) — separate
  keep-list cleanup, same as the Sprint 6–7 dead-rule note above.
- Restore instant re-record from the answer screen's speak-dock (the C1 fix
  removed the stale-session hazard that made "navigate to the menu mic" the safe
  choice).
- Pin the kiosk TS toolchain to the committed lockfile (worktree installs pulled
  TS 5.9.3, which breaks the frozen `sttClient`/`ttsClient` typing; 5.8.3 is fine).
- graphify refresh (code + docs scope).
