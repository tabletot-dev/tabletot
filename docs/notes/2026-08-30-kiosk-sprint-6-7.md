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
