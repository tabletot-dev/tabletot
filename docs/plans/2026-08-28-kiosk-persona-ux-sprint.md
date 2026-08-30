# Kiosk persona-UX sprint

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> Atomic commits, one per lettered item. Validate each on the way.
> This plan was revised by `/plan-eng-review` on 2026-08-28 — see the
> GSTACK REVIEW REPORT at the end. The pre-review version had a migration
> (0071), a build-time image pipeline (D0), and a from-scratch carousel;
> all three were cut or merged into existing code.

**Goal:** Close the six kiosk-persona frictions found in the 2026-08-28 local
walkthrough, plus two loose bugs (hardcoded GST label, voice-overlay backdrop).
Personas: see the "Six at the Table" reference. All work is customer-facing
kiosk (`apps/kiosk`). **No migration** — the data this sprint needs already
exists in `menuStore`.

**Branch:** stacks on `claude/project-status-review-7w70cm` (keeps audit fixes
0066–0070 underneath). New UX work commits on top of that branch.

**Source walkthrough:** attract → menu → detail → cart → sent/hold →
post-hold menu → voice overlay → About stub. Captured against local Supabase
(migration 0065, 49 Silver menu items, 13 anchors, 30 pairing sources) +
order-engine on :8000 + kiosk vite on :8080.

---

## BUILD PROGRESS — 2026-08-29 (session 1) + 2026-08-30 (session 2)

**14 of 14 tasks shipped**, one atomic commit each, on branch
`claude/project-status-review-7w70cm` (not merged, not pushed).

| Commit | Task |
|--------|------|
| `4e34533` | T1 — image_url floor |
| `4f671ee` | T2 — extract `<Stepper>` |
| `6b96c8d` | T3 — two-tap `×` clear |
| `0dd7d67` | T4 — dynamic GST label |
| `fef26bf` | T5 — cart-row name/price stack |
| `5c952d9` | T6 — Veg/Non-Veg word on cards |
| `fc3da33` | T7 — pairing-chip fly-in |
| `872946e` | T8 — voice-dock mic breathing room (var cut, done-by-architecture) |
| `b9bb605` | T9 — voice panel → Radix Dialog |
| `315a48f` | T10 — "Popular" screen |
| `bfa1376` | T11 — HomeView merged into IdleScreen, HomeView deleted |
| `d3aa061` | T12 — breathing pulse on the Attract primary CTA |
| `4b8a2f1` | T13 — Wi-Fi QR dialog on Attract |
| `576b7c8` | T14 — Attract layout: "See the menu" + subordinate secondaries |

(`388f0a2` is the plan doc + design-review pass; `8073978` / `7aacf74` mark
T12 / T13 shipped in this file.)

**Test suite:** 78 passing (was 42 at session start; 75 after session 1).
`tsc` clean, `eslint` 0 errors (one pre-existing `completionRules` dep warning
in `Index.tsx`), `pnpm build` clean.

**Deviations from the plan, all noted in the task entries below:**
- **T1** — resolution order was already `image_url → dict → fallback`; only the
  broken-URL floor needed fixing. Smaller than written.
- **T7** — DetailView keeps its 4-chip cap (plan said "cap at 2"); reducing what
  it recommends is an AOV call, flagged not changed.
- **T8** — the `--tt-bottom-chrome` var was **cut**. The AppShell flex-sibling
  layout already prevents the overlap. Shipped a 12px mic margin instead.
- **T11** — carousel auto-advance uses one `setInterval` (drives index + dots),
  not pure CSS keyframes. User approved. `prefers-reduced-motion` disables it.
- **T12** — CSS-only; `IdleScreen.tsx` was untouched (plan listed it as a maybe).
- **T13** — QR generated once with the `qrcode` npm CLI via `npx --yes` (not
  added as a dep); imported as a URL (no svgr in the project). Reuses the
  existing `.tt-modal` design-system classes rather than new dialog CSS.
- **T14** — "Popular" secondary calls `startSession()` before navigating (not
  just `setCurrentScreen`), matching the slide-tap path so cart adds on the
  Popular screen stay attributed.

**Attract redesign follow-up (`6504e69`, 2026-08-30):** on client feedback the
merged Attract screen (T11–T14) was rebuilt to the approved
`variant-B.png` mockup — centred column, coral "See the menu" pill (no mic
icon, hint line dropped), full-bleed 3-up chef's-picks filmstrip with
both-edge peek and a one-way forward loop (tripled render + silent rebase,
no rewind), bare icon+label+chevron footer, coral accent on the table badge
and footer icons. Layout/CSS only, existing tokens/fonts; session-start /
deep-link / Wi-Fi dialog / nudge tracking untouched. Verified in-browser at
800×1340 (no scroll, no console errors); `IdleScreen.test.tsx` 12 tests, suite 79.

**Still not verified (device / browser steps, not runnable here):** T12 K9
visual, T13 phone-scan. T14 portrait fit was checked in a headless browser at
800×1340 but not on the K9 itself. Also T5/T8's on-device K9 re-checks from
session 1.

**Known environment issue:** local `menu_items.image_url` values are absolute
URLs to the **remote** Supabase project's storage — they 400 from local dev, so
menu/cart/carousel thumbs render the T1 gradient floor locally (correct
behaviour, not a bug). Real photos serve in prod. Also: local table **T1** has
an open test session from this session's task testing — the kiosk on T1 lands
on WaitingView, not attract. Use table **T2** (edit `apps/kiosk/.env.local`,
`VITE_TABLE_ID=T2`, restart vite, revert after) to see the attract screen, or
clear the T1 session.

### REMAINING — none (all 14 tasks shipped)

Before merge:
1. On-device / browser pass for the unverified visual steps listed above
   (T12 pulse, T13 phone-scan, T14 portrait fit; T5/T8 K9 re-checks).
2. `/graphify` (code + docs scope only) to refresh the graph.
3. `/plan-design-review` — recommended before merge (per the GSTACK REVIEW
   REPORT verdict).
4. Merge `claude/project-status-review-7w70cm` → `main` and push (manual,
   per repo convention).

---

## Session 0 — bringup & preconditions

Do this before touching any task. No migration this sprint, so **no
`supabase db reset` and no type regen**.

1. **Branch:** `git branch --show-current` → must be
   `claude/project-status-review-7w70cm` (carries audit fixes 0066–0070). Tree
   clean.
2. **Docker:** `open -a Docker`, wait until `docker info` succeeds (~10–30s).
3. **Supabase:** from repo root, `supabase start`. Starts from the existing
   backup (migration 0065, Silver data already seeded). Studio on `:54323`,
   API on `:54321`, db on `:54322`.
4. **Order-engine:** in `services/order-engine`,
   `.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000`. Startup
   log should read "Menu loaded: 49 items for silver-ssc-hyd". `.env` already
   points `DATABASE_URL` at `127.0.0.1:54322`.
5. **Kiosk:** in `apps/kiosk`, run the dev server on `:8080`. **Confirm
   package manager first** — the lockfile is `package-lock.json`; a prior
   session used `npm ci` / `npm run dev` despite the pnpm convention. Try
   `pnpm dev`; if it errors on the lockfile, `npm run dev`. Whatever works is
   also what the `Verify:` steps below should use (`pnpm test` vs
   `npm test`).
6. **Env:** `apps/kiosk/.env.local` is already set (`VITE_RESTAURANT_ID`,
   `VITE_TABLE_ID=T1`, local Supabase URL + publishable key).

**Read before the risky tasks (only the head was read during review):**
- **T1** — full `apps/kiosk/src/lib/menuImages.ts` (the `image_url` /
  name-dict / fallback resolution order and where `hydrateMenuItemImage` sets
  the field).
- **T9** — `apps/kiosk/src/components/VoiceConversationPanel.tsx` (current
  overlay markup before wrapping in Radix Dialog; frozen-voice rule — chrome
  only).
- **T11** — diff `apps/kiosk/src/components/screens/HomeView.tsx` against
  `IdleScreen.tsx` and the `case "home"` / `case "idle"` blocks in
  `pages/Index.tsx` (lines ~425–465) before merging.

**Teardown when done:** `supabase stop`; kill the uvicorn and vite processes.

---

## Perf budget (Lenovo Tab K9 — the hardware target)

Non-negotiable for every animated item below:

- Animate `transform` / `opacity` only. No `filter`, no `backdrop-filter`, no
  `box-shadow` transitions.
- One `requestAnimationFrame` loop at a time.
- Always-on motion (carousel auto-advance, breathing CTA) = CSS keyframes.
  `framer-motion` (already a dep, `^12`) only for one-shot enter animations
  (pairing chips).
- `prefers-reduced-motion` honored everywhere — reduced path is a plain fade or
  no motion, never a broken layout.
- No new runtime dependency for the QR (static SVG instead).

---

## What already exists (reuse, do not rebuild)

| Existing | Used by | Note |
|----------|---------|------|
| `components/screens/HomeView.tsx` | D1–D5 | Full carousel (`heroIndex` + `setInterval` + dots), tappable spotlight that deep-links to item-detail **and** fires the idempotent `session_started`, Wi-Fi card, About/Hours/Chef's-Note blocks. Wired as `case "home"` but nothing navigates there — **dead**. This sprint **merges** its logic into `IdleScreen`'s shell and deletes it. |
| `useDeviceNavigation.removeItem(itemId)` | A3 | The clear-to-zero function already exists; it just isn't threaded to `DishCard` / `CartView`. |
| `components/DietMark.tsx` | A4 | Already has `label` and `title` (tooltip) props. |
| `MenuView.tsx:100-102` | A4 | The diet legend already exists in the filter toggle (`<DietMark compact/>` next to "Veg"/"Non-Veg"). A4's real gap is the dish cards. |
| `CompletionNudge.tsx:60` | B1 | Working modal-scrim pattern (`absolute inset-0 z-50 bg-black/60`). Radix Dialog is also already a dep. |
| `useMenu().anchors` (`lib/menuStore.tsx`) | C1/C2, D1 | Hydrated `anchor_items`. Backs the "Popular" screen and the "Chef's picks" carousel — **no new fetch, no RPC**. |
| `lib/pricing.ts computeTotals(subtotal, gstRatePercent)` | A1 | Already dynamic; A1 is label text only. Both `CartView:33` and `BillView:35` already hold `gstRatePercent`. |
| `lib/eventBus.ts track()` | analytics | Reused for the new CTA events. |
| `lib/menuImages.ts itemImageBackground()` | A2, D1 | Reused — but its name-keyed `SILVER_MENU_IMAGES` dict is the root of the gray-thumbnail bugs (see A2 / image-resolution). |
| Radix Dialog | D3, B1 | Installed. Gives focus trap + scroll lock + escape for free. |

---

## 1. Menu / Cart polish (independent, low risk — do first)

### - [ ] A0 — extract `<Stepper>` (prerequisite for A3)

The `−/+` markup is copy-pasted three times: `DishCard` main action,
`DishCard` pairing row, `CartView` row. Extract
`components/Stepper.tsx` — `{ qty, onDec, onInc, onClear? }` — and swap all
three call sites with **no behaviour change**. "Make the change easy, then
make the easy change."
**Validate:** `Stepper.test.tsx` (renders, `−/+/×` fire the right callbacks);
existing `useDeviceNavigation.test.ts` + `aov-attribution.test.tsx` stay green
(they render DishCard/CartView and guard `item_added` / `item_removed` source).

### - [ ] A1 — dynamic GST label

`CartView.tsx` (~line 119) and `BillView.tsx` (~line 150):
`GST (5%)` → `GST (${gstRatePercent}%)`. Calc already dynamic. Persona 04.
**Validate:** label matches `restaurant_settings.gst_rate`; add a vitest
assertion in `CartView.test.tsx` / `BillView.test.tsx`.

### - [ ] A2 — cart row layout + thumbnail

`CartView.tsx`: fix the `name`/`₹390 each` collision at 800px. Concrete spec:
name on its own line, **clamp to 2 lines with ellipsis** (`-webkit-line-clamp`
or equivalent), unit price on the line below it — never side-by-side with a
long name. Verify with a 40+ char dish name (no row-height jump, stepper stays
aligned). Thumbnail: covered by the image-resolution change below — verify a
photographed item (Avocado Toast) shows its photo in the cart after that
lands.
**Validate:** `CartView.test.tsx` — photographed item renders a non-fallback
background; a 40+ char name clamps to 2 lines and does not collide with the
unit price or shift the stepper.

### - [ ] A3 — one-tap clear (depends on A0)

Add `onClear` to `<Stepper>`, wired to `removeItem`. **The `×` renders only
when `qty >= 2`** — at `qty 1` the single `−` already clears in one tap, so
this halves the destructive-tap surface with no undo needed. Applies in the
Cart row and the expanded menu card. Persona 02.

**Design-review outcome (2026-08-29) — toddler mis-tap guard:**
- `×` sits at the **opposite end of the row** from the `−/qty/+` cluster, with
  **≥24px dead-space** between them. Never adjacent to `−`.
- `×` is a **two-tap confirm**: first tap swaps the control to "Tap again to
  remove" for ~2s, second tap within the window calls `removeItem`; timeout
  reverts. No undo infra, no modal. Persona 02 can't wipe a line in one poke;
  every other persona pays one extra tap only when clearing 2+ of an item.

Analytics: clear routes through `removeItem` → `item_removed` already fires. No
new event.
**Validate:** `Stepper.test.tsx` — `×` hidden at qty 1, visible at qty 2+;
first tap shows the confirm label and does NOT clear; second tap within 2s
clears; tap outside the window reverts; `×` renders at the row's opposite end;
`aov-attribution.test.tsx` still green.

### - [ ] A4 — diet label on dish cards

Pass `label` to `DishCard`'s `<DietMark>` (`DishCard.tsx:89`) so cards show
"Veg" / "Non-veg" text, not just the glyph. Keep the existing `title`
tooltip. The filter-row legend already exists — no new legend row. Persona 03, 04.
**Validate:** `DishCard.test.tsx` — card renders the diet word.

### - [ ] A5 — pairing chips delayed fly-in

The inline "GOES WELL WITH" block (`DishCard` expanded + `DetailView`):
`framer-motion` `staggerChildren` + `delayChildren` ~300–500ms, `transform` +
`opacity` only. No viewport auto-scroll, no interaction block. Cap at the
existing 2 chips. `prefers-reduced-motion` → immediate, no transform.
Personas 01, 06.
**Validate:** `DishCard.test.tsx` — chips present after add; reduced-motion
path asserts no transform style.

### - [x] A6 — bottom-bar clearance (done-by-architecture + breathing room)

**Resolved 2026-08-29 without the `--tt-bottom-chrome` var.** The overlap the
Aug-28 walkthrough saw no longer reproduces: `AppShell` now renders
`.tt-scroll` (flex:1) then `statusStrip` then `orderBar` as **flex-column
siblings**, all `flex: none`, so the docked bars stack below the scroll region
and cannot overlap it. Measured while a round is held + scrolled to menu end:
voicedock bottom 1094 = scroll bottom 1094, statusstrip 1094→1158, orderbar
1158→1280 (viewport). No element uses `position: fixed`/`absolute`, so a
`--tt-bottom-chrome` variable would have nothing to feed — cut as speculative.
Also: `.ptt-bubbles` ("Suggest a meal?" chips) are `display: none` in the
current CSS; only the mic button renders in `.tt-voicedock`.

**What shipped:** `margin-bottom: var(--tt-space-2)` (12px) on `.tt-voicedock`
so the mic clears the docked status strip / cart bar comfortably instead of
butting against it (margin-bottom on the last flex child is honoured at scroll
end; container padding-bottom is not).

**Still to check on-device:** the K9's `100dvh` vs browser chrome could differ
from headless Chromium — re-verify the mic clearance during Rohan's on-device
pass.

---

## 2. Image resolution (fixes A2 + Detail pairing thumbs as a class)

### - [ ] IMG — prefer `menu_items.image_url` in `lib/menuImages.ts`

`itemImageBackground()` / `hydrateMenuItemImage` currently resolve images
through the hardcoded name-keyed `SILVER_MENU_IMAGES` dict; an item whose name
doesn't exactly match a key falls to the gray `NO_PHOTO_FALLBACK` even when its
DB row has an `image_url`. Change the order to: **`image_url` → name dict →
`NO_PHOTO_FALLBACK`**.
**CRITICAL:** keep the gradient/fallback as the visual floor. A set-but-broken
`image_url` must not render a blank box — layer the image over the gradient
background, or swap to the fallback on load error. (Failure-mode gap flagged in
review.)
**Validate:** `menuImages.test.ts` — item with `image_url` + no dict entry →
resolves to the URL; item with a broken URL → still shows a non-blank
background; item with neither → fallback.

---

## 3. Voice

### - [ ] B1 — voice overlay is a real modal

Wrap the "Ask Tabletot" voice panel in a **Radix Dialog** (already a dep) so
it gets an opaque backdrop, focus trap, scroll lock, and escape-to-close — not
just a `z-index` bump. The `TAP TO SPEAK` pill must sit on a solid sheet with
the menu rows inert behind it. **UI chrome only — no voice-pipeline code**
(frozen-voice rule). Persona 03.

**Design-review note (2026-08-29):** the voice UI is still governed by
`docs/design-system.md` ("Warm Espresso"), not the v1.0 `tokens.css` set —
Sprints 6–7 haven't rebuilt it. Keep the panel on the existing Warm Espresso
bridge tokens; do **not** restyle it to `tokens.css` as part of this change.
**Validate:** open at 800px — menu rows behind an opaque layer and
non-interactive; escape closes; focus returns to the trigger.

---

## 4. "Popular" screen (was "Frequently Ordered" / "Recommended")

No ranking, no migration this sprint — the pilot has no trustworthy order
history and staff/test orders would poison an all-time ranking. This is a
curated view backed by `anchor_items`, which staff already edit in the
dashboard. A popularity-ranked version is a follow-up once real orders exist.

### - [ ] C1 — anchors selector

Small helper (in `MenuView`/`menuStore` sibling or inline in C2) that returns
`useMenu().anchors` sorted by `priority` desc, mapped to the shape `DishCard`
already consumes (they're already `MenuItem`-shaped via `menuStore`). **No new
Supabase call.**

### - [ ] C2 — `FrequentlyOrderedView` screen

New screen: reuses `DishCard`, renders the C1 list. New `ScreenType`
(`"popular"`) in `useDeviceNavigation`, one `case` in `Index.tsx`, routed from
the Attract secondary CTA (D5). Empty state when zero anchors are configured
("Ask the team for today's picks"). Personas 01, 04, 05.

**Design-review outcome (2026-08-29) — label vocabulary (resolves the
collision):** user-facing string is **"Popular"** everywhere — the screen
title and the Attract secondary CTA. The Attract carousel keeps **"Chef's
picks"**. **Retire "Recommended", "Frequently Ordered", and "Today's picks"
from all user-facing copy.** The component file stays named
`FrequentlyOrderedView.tsx` for now with a header comment noting the label is
"Popular" and the list is curated anchors, not order-frequency (rename is a
follow-up when the popularity-ranked version lands).
Analytics: `track()` on the CTA tap (discovery entry point — feeds AOV
attribution).
**Validate:** `FrequentlyOrderedView.test.tsx` — renders ranked anchors; zero
anchors → empty state. E2E: Attract → CTA → list → tap item → DetailView.

---

## 5. Attract — merge HomeView into IdleScreen

Decision: **port `HomeView`'s carousel + deep-link/session-start wiring into
`IdleScreen`'s v1.0 `tt-attract-*` shell, then delete `HomeView`** and its
`case "home"` / `"home"` `ScreenType` / import in `Index.tsx`. Keep whichever
of HomeView's static blocks are worth carrying (Hours, Chef's Note) — decide
during the merge; Dietary/Wi-Fi blocks are replaced by D3.

### - [ ] D1 — hero carousel in the merged Attract

**Design-review outcomes (2026-08-29):** carousel ships this sprint (mockup
confirms the CSS-cropped squares hold up at filmstrip size); label is
**"Chef's picks"** (it is literally the `chef_pick` set); slide treatment is
**variant B** — see the approved mockup.

- **Reading order / layout (portrait 800×1280, no scroll):** brand lockup +
  Table pill → venue name "Silver" / "Specialty Coffee" → rule → one tagline
  line → **primary CTA** ("See the menu", coral pill, the only filled/accent
  element, breathing pulse per D2) → **"Chef's picks" carousel band** →
  two quiet secondaries ("Popular" → C2, "Wi-Fi" → D3). The carousel sits
  **below** the CTA and carries no accent fill and smaller type — it must not
  read as the primary action.
- Source: `useMenu().anchors` filtered to `chef_pick` (same as HomeView today).
  Fixed small set, **cap 5**. States:
  - **loading:** keep HomeView's skeleton band (`--tt-skeleton-2`), no layout
    shift when it resolves.
  - **0 chef-picks:** no carousel band, just the CTA (no broken layout).
  - **1 pick:** show the single slide, no dots, no auto-advance.
  - **2–4 picks:** carousel with dots, auto-advance on.
- Each slide (**variant B treatment**): a 3:2 thumb (`background-size: cover`
  over `itemImageBackground(item)` — no asset pipeline, crops the existing
  square images on-device), with the dish **name + price on the cream card
  below the thumb**, price in `--brand`. Adjacent slides peek at the edges.
  Pagination dots under the band. (Real 3:2 hero shots are a follow-up; see
  NOT-in-scope.)
- Auto-advance: CSS keyframes on a `translateX` track. Fixed slide count keeps
  the keyframe stops static. `prefers-reduced-motion` → first slide only, no
  advance.
- **Slide tap:** calls the factored-out session-start (below) **and**
  deep-links to that item's `DetailView` — this is exactly what HomeView's
  `onSelectItem` already does; `session_started` is idempotent (documented in
  `Index.tsx`), so a later "touch anywhere" is a no-op. Accepted that a slide
  tap counts as session start.
- Analytics: `track()` on slide tap (discovery entry point).

### - [ ] D1a — factor out session-start

Pull the `startSession()` side effect out of the `IdleScreen` "touch anywhere"
handler so both "touch anywhere" and a carousel slide tap call one function.
Keep the existing "touch anywhere → menu" path working.
**Validate:** vitest/RTL — "touch anywhere" starts the session once;
slide tap starts it once and lands on DetailView; two paths in sequence don't
double-fire (idempotent).

### - [ ] D2 — breathing pulse on primary CTA

Pseudo-element ring, `transform: scale` + `opacity`, ~2s `ease-in-out
infinite`. No `box-shadow` animation. `prefers-reduced-motion` → no pulse.
Persona 01.
**Validate:** visible/smooth on the K9; reduced-motion disables it.

### - [ ] D3 — Wi-Fi CTA → QR modal

Secondary CTA opens a **Radix Dialog** with a **static pre-generated SVG QR**
checked into the repo. Network is open: payload `WIFI:S:SILVER-GUEST;T:nopass;;`.
SSID is a hardcoded constant with `// TODO: restaurant_settings key for
multi-restaurant`. No runtime QR lib.

**Design-review outcome (2026-08-29) — copy spec (persona 03, wary senior):**
the dialog is not a bare QR. It has:
- a heading — "Join the café Wi-Fi"
- one instruction line — "Point your phone camera at the code — the network is
  open, no password needed."
- a visible **Close** button (in addition to Radix escape / overlay click).

**Validate:** dialog opens/closes/escape; heading + instruction + visible Close
all present; QR scans on a phone and joins SILVER-GUEST.

### - [ ] D4 — remove "About Silver"

Delete the `IdleScreen` footer "About Silver" toast + the plain
`Wi-Fi: SILVER-GUEST` text (D3 replaces the latter). The HomeView merge
already removes its About/Dietary blocks and `case "home"`. Grep for
`onInfoToast` / `"home"` / `HomeView` and clean up dead handlers, the
`ScreenType` union member, and the import.
**Validate:** attract renders no About link; `tsc` clean; no unreachable
`case "home"`.

### - [ ] D5 — Attract layout

One large primary CTA (→ Menu, "See the menu") + two visually subordinate
secondaries ("Popular" → C2, "Wi-Fi" → D3). The "Chef's picks" carousel band
(D1) sits between the primary CTA and the secondaries and is not counted as a
CTA. Under the Hick's-law limit for Personas 01/03. Reading order is spelled
out in D1.
**Validate:** at **800×1280 portrait** (the K9's real orientation — pin
portrait, do not build/verify in landscape) the primary CTA + carousel band +
two secondaries all fit **without scrolling**; the primary is the only filled
accent element and is unambiguous.

---

## Test coverage map

```
[+] components/Stepper.tsx (new)          — Stepper.test.tsx
    ├── −/+/onClear callbacks
    └── × hidden at qty 1, shown at qty ≥ 2
[~] components/DishCard.tsx               — DishCard.test.tsx
    ├── Stepper swap (no behaviour change)
    ├── DietMark label text on card
    └── pairing chips: present after add; reduced-motion → no transform
[~] components/screens/CartView.tsx      — CartView.test.tsx
    ├── GST label = dynamic rate
    ├── name / unit-price separation
    └── photographed item → non-fallback thumb
[~] components/screens/BillView.tsx      — BillView.test.tsx
    └── GST label = dynamic rate
[~] lib/menuImages.ts                    — menuImages.test.ts
    ├── image_url present, no dict entry → URL
    ├── image_url broken → non-blank background (NOT a blank box)  ← CRITICAL
    └── neither → NO_PHOTO_FALLBACK
[+] components/screens/FrequentlyOrderedView.tsx (new) — FrequentlyOrderedView.test.tsx
    ├── renders anchors sorted by priority
    └── zero anchors → empty state
[~] pages/Index.tsx + IdleScreen.tsx     — Index/attract RTL tests
    ├── session-start fires once for "touch anywhere"
    ├── session-start fires once for slide tap; sequence not double-fired
    ├── carousel: reduced-motion → single slide
    ├── zero chef-picks → CTA only, no broken band
    └── no reachable case "home" (tsc)
[~] VoiceConversationPanel (B1)          — voice panel RTL test
    └── open → menu rows inert; escape closes; focus restore
[→E2E] Attract → "Popular" CTA → list → DetailView
[→E2E] Attract → carousel slide tap → session_started once → DetailView

Regression guard (IRON RULE): A0 Stepper extraction touches DishCard + CartView,
both under existing tests. useDeviceNavigation.test.ts and aov-attribution.test.tsx
MUST stay green — they guard item_added / item_removed source attribution, which
must not change.
```

## Failure modes

| New path | Failure | Test | Error handling | User sees |
|----------|---------|------|----------------|-----------|
| IMG: `image_url` first | URL set but 404 | added above | **must keep gradient floor** | blank box if unhandled → **CRITICAL, handled in IMG task** |
| D1 carousel | zero `chef_pick` anchors | added | CTA-only guard | CTA only (fine) |
| D1a slide-tap session start | `startSession()` network reject | gap | HomeView's existing path swallows it | silent, unattributed events — pre-existing, accepted |
| C2 FrequentlyOrderedView | zero anchors configured | added | empty state | "Ask the team for today's picks" |
| B1 / D3 Radix Dialog | — | — | Radix handles trap/lock/escape | correct |

**1 critical gap** — the IMG change must not turn a broken `image_url` into a
blank box. Mitigation is written into the IMG task (gradient stays the floor).

## NOT in scope (deferred, with rationale)

- **Migration `0071` / SQL popularity ranking** — pilot has no trustworthy
  order history; all-time ranking would be dominated by staff/test orders. The
  "Popular" screen is anchor-backed curation until real data exists.
- **D0 build-time image crop pipeline** — CSS `background-size: cover` crops the
  existing square images on-device. A parallel `public/carousel/` asset dir +
  bypass resolver isn't worth it now.
- **Real 3:2 hero photography + a curated, restaurant-editable Attract carousel
  list** — the carousel *does* ship this sprint (design review confirmed the
  CSS-cropped squares hold up at filmstrip size, variant B treatment). What's
  deferred is dedicated 3:2 photography and a staff-editable slide list; the
  CSS-cover seam swaps cleanly to real assets later.
- **Wi-Fi `restaurant_settings` key** — hardcoded `SILVER-GUEST` for the pilot
  (open network). Add the key when multi-restaurant lands (TODO in D3).
- **Clear-to-zero undo** — the `qty >= 2` gate removes the need for now.
- **Wi-Fi QR analytics** — not order-related; skip.
- **Games rebuild** — Sprint 6–7, gated on client feedback. Parked solo-game
  ideas: tap-to-colour grid (cheap, toddler-safe), whack-a-mole (needs a perf
  budget). Persona 02.
- **Spice indicator** — no `menu_items` field; skipped for the pilot.
- **"Your usual"** — no per-customer identity in the pilot.
- **Persona 06 (all-day) full re-engagement pattern** — only A5 touches it
  partially; a distinct soft re-order nudge for long post-order dwell is later.

## Follow-up (not blocking; candidates for TODOS.md)

- Popularity-ranked "Frequently Ordered" over **settled** orders (join
  `payments` / terminal status, exclude staff/test) once the pilot has history.
- Real 3:2 hero shots + curated Attract carousel list (restaurant-editable).
- Wi-Fi `restaurant_settings` key for multi-restaurant.
- Promote `--tt-bottom-chrome` to a proper design-system token if more bottom
  bars appear.
- Run `/graphify` after the sprint (code + docs scope only).

## Parallelization

| Lane | Steps | Modules | Depends on |
|------|-------|---------|------------|
| 1 | IMG → A0 → A1 → A2 → A3 → A4 → A5 → A6 | `lib/menuImages.ts`, `components/` (Stepper, DishCard, CartView, BillView, MenuView) | IMG before A2; A0 before A3 |
| 2 | B1 | `VoiceConversationPanel.tsx` | — |
| 3 | C1 → C2 → D1a → D1 → D2 → D3 → D4 → D5 | `pages/Index.tsx`, `IdleScreen.tsx`, `useDeviceNavigation.ts`, new `FrequentlyOrderedView.tsx`, delete `HomeView.tsx` | C2 + D-series share `Index.tsx` → sequential within lane |

Launch **Lane 1**, **Lane 2**, **Lane 3** in parallel worktrees. Lane 3 is
internally sequential (everything touches `Index.tsx`). No cross-lane module
overlap.

## Implementation Tasks
Synthesized from this review's findings. Each derives from a specific finding.

- [x] **T1** — `lib/menuImages.ts` — prefer `image_url`, keep gradient as the floor for broken URLs
  - Shipped `4e34533`. Resolution order was ALREADY `image_url → dict → fallback` in menuStore hydration; the only defect was a broken `image_url` rendering as a faint dark box. `itemImageBackground()` now appends `NO_PHOTO_FALLBACK` as the bottom CSS layer. 8-assertion `menuImages.test.ts`.
  - Surfaced by: Architecture finding 2 + failure-mode critical gap
  - Files: `apps/kiosk/src/lib/menuImages.ts`, `apps/kiosk/src/lib/__tests__/menuImages.test.ts`
  - Verify: `pnpm test menuImages`
- [x] **T2** — `components/Stepper.tsx` — extract shared stepper, swap 3 call sites, no behaviour change
  - Shipped `4f671ee`. `{ qty, label, onDec, onInc }`; swapped DishCard main + DishCard pairing + CartView row. `onClear?` deliberately NOT added here (T3 owns it). Standardised on `type="button"` + `<div>` wrapper. `Stepper.test.tsx` (4). Test lives in `components/__tests__/`, not `components/`.
  - Surfaced by: Code-quality finding 4 (DRY, triplicated markup)
  - Files: new `apps/kiosk/src/components/Stepper.tsx` + `.test.tsx`; `DishCard.tsx`, `CartView.tsx`
  - Verify: `pnpm test` — `useDeviceNavigation.test.ts` + `aov-attribution.test.tsx` green
- [x] **T3** — `Stepper` — `×` clear at `qty >= 2`, two-tap confirm, wired to `removeItem`
  - Shipped `6b96c8d`. `×` sits OUTSIDE `.tt-stepper` in a `.tt-stepper-group` wrapper, 24px (`--tt-space-4`) after `+`. "opposite end of the row" → opposite end of the *stepper control* (the cart/dishcard rows have no free end). Two-tap: first tap → "Tap again to remove" (coral) for 2s, second tap clears, timeout reverts, qty change cancels. Threaded `onClearItem`: Index→MenuView→DishCard and Index→CartView. `Stepper.test.tsx` +5. Verified in-browser.
  - Surfaced by: A3 + outside-voice destructive-tap risk + design-review toddler mis-tap guard
  - Files: `Stepper.tsx`, `DishCard.tsx`, `CartView.tsx`, `Stepper.test.tsx`
  - Verify: `pnpm test Stepper` — first tap shows confirm + does not clear; second tap within 2s clears; timeout reverts; `×` at row opposite end
- [x] **T4** — `CartView.tsx` + `BillView.tsx` — dynamic GST label
  - Shipped `0dd7d67`. `GST (5%)` → `GST ({gstRatePercent}%)`, value already in scope. DB rate is 5 so the pilot still reads "5%", now data-driven. New `CartView.test.tsx` (2) + `BillView.test.tsx` (+1) with a non-5 mocked rate.
  - Surfaced by: A1
  - Files: both screens + their tests
  - Verify: `pnpm test CartView BillView`
- [x] **T5** — `CartView.tsx` — cart-row name / unit-price collision
  - Shipped `fef26bf`. CSS-only: `.order-copy` was `flex: 1` (inert in the grid) so name+price ran inline. Now `flex-direction: column` + `min-width: 0`, name clamps to 2 lines + ellipsis. `.order-copy`/`.order-thumb` are CartView-only. No jsdom test (layout not observable there); verified DOM geometry in-browser (no overlap). NOTE: `menu_items.image_url` holds absolute URLs to the REMOTE Supabase project — 400s from local dev, so local thumbs show the T1 gradient floor (working as intended). Real photos serve in prod.
  - Surfaced by: A2 + design-review long-name gap
  - Files: `CartView.tsx`, `tabletot.css`, `CartView.test.tsx`
  - Verify: visual at 800px with a 40+ char name (no stepper shift) + `pnpm test CartView`
- [x] **T6** — `DishCard.tsx` — `<DietMark label>` on cards
  - Shipped `5c952d9`. One prop (`label`) on the dish-card's DietMark (line ~93). Pairing-row mark stays glyph-only. No new legend row. New `DishCard.test.tsx` (2). Verified in-browser.
  - Surfaced by: A4
  - Files: `DishCard.tsx`, `DishCard.test.tsx`
  - Verify: `pnpm test DishCard`
- [x] **T7** — pairing chips delayed fly-in, reduced-motion safe
  - Shipped `fc3da33`. `.tt-pairing-list` + rows → `motion.div` in DishCard AND DetailView. `delayChildren: 0.35`, `staggerChildren: 0.09`, fade + 8px rise. `useReducedMotion()` drops the `y` (no transform). `DishCard.test.tsx` +3 (render, cap 2, reduced-motion no-transform via hoisted framer-motion mock). NOTE: DetailView keeps its existing 4-chip cap (not 2) — reducing what's recommended there is an AOV call, flagged for review, not changed.
  - Surfaced by: A5
  - Files: `DishCard.tsx`, `DetailView.tsx`, `DishCard.test.tsx`
  - Verify: `pnpm test DishCard` + manual reduced-motion
- [x] **T8 (P2)** — bottom-bar clearance — DONE-BY-ARCHITECTURE + 12px mic breathing room
  - Surfaced by: A6 + outside-voice whack-a-mole warning
  - Outcome: the AppShell flex-sibling layout already prevents the overlap
    (measured, no reproduction). `--tt-bottom-chrome` var cut as speculative —
    nothing uses fixed/absolute positioning. Shipped
    `margin-bottom: var(--tt-space-2)` on `.tt-voicedock`. See the A6 section.
  - Files: `apps/kiosk/src/styles/tabletot.css` (1 line)
  - Verify: `.tt-voicedock` computed `margin-bottom` = 12px; on-device K9
    re-check pending
- [x] **T9** — `VoiceConversationPanel` — wrap in Radix Dialog, keep Warm Espresso tokens
  - Shipped `b9bb605`. `@radix-ui/react-dialog` (already a dep): Root/Portal/Overlay/Content(asChild on motion.section)/Title/Close. New `.voice-conversation-backdrop` `rgba(23,17,15,0.82)` (WE ink, not tokens.css). `.voice-conversation-panel` `absolute`→`fixed`. Frozen-voice rule honoured — STT/PTT block byte-identical (verified). New `VoiceConversationPanel.test.tsx` (4). Verified in-browser: body scroll-lock, menu `aria-hidden`, Escape + X close.
  - Surfaced by: B1 + outside-voice "not a modal" + design-review design-system finding
  - Files: `VoiceConversationPanel.tsx` (chrome only), voice panel test
  - Verify: menu inert behind, escape closes, panel still on Warm Espresso palette, `pnpm test`
- [x] **T10** — `FrequentlyOrderedView` ("Popular" screen) + `ScreenType "popular"` + Index case
  - Shipped `315a48f`. Reuses DishCard, renders `useMenu().anchors` sorted by priority desc, empty state "Ask the team for today's picks", heading "Popular". File keeps name + rename-later comment. `Surface += "popular"`; `recommendation_shown` per anchor + `recommendation_tapped` on tap (existing event types, no migration). **Nothing routes here yet — the Attract "Popular" CTA is T14.** New `FrequentlyOrderedView.test.tsx` (4). Not visually verified (no UI entry until T14).
  - Surfaced by: C1/C2 (revised — no RPC) + design-review label-collision fix
  - Files: new `FrequentlyOrderedView.tsx` + test, `useDeviceNavigation.ts`, `Index.tsx`
  - Verify: `pnpm test FrequentlyOrderedView` + E2E Attract→"Popular" CTA→list→detail; no "Recommended"/"Frequently Ordered"/"Today's picks" in user-facing strings
- [x] **T11** — merge `HomeView` carousel + deep-link/session-start into `IdleScreen`; delete `HomeView`
  - **Shipped `bfa1376`.** Done: chef's-picks carousel (variant B, cap 5, loading/0/1/multi states); slide-tap → idempotent `startSession()` → item-detail (verified: one `session_started` + one `recommendation_tapped`); `role=button` nesting fixed via a transparent background `.tt-attract-touch` `<button>` + `.tt-attract-content` layer (flat siblings, verified `ctaInsideTouch: false`); `Surface += "attract_carousel"`; deleted `HomeView.tsx`, `case "home"`, import, `ScreenType "home"`, `NUDGE_ELIGIBLE_SCREENS` entry, `tt-home-*` CSS (~155 lines); refreshed 2 stale comments in `orderSubmission.ts`. New `IdleScreen.test.tsx` (8). Verified 800×1280 portrait: fits, no scroll.
  - **Carousel-drive deviation (user-approved):** one ~3.5s `setInterval` drives index + dots (not pure CSS keyframes per the perf budget) — CSS-only can't sync dots; `prefers-reduced-motion` disables it.
  - **Left for T14:** relabel CTA "Touch anywhere to start" → "See the menu"; add Popular + Wi-Fi subordinate secondaries; remove the About link + plain `Wi-Fi: SILVER-GUEST` text; tighten the `.tt-attract-title` `flex: 1` gap (loose vertical space between tagline and CTA right now).
  - Original design-review additions to scope (all done):
    - **Restructure the "touch anywhere" surface** — `IdleScreen` is currently a
      `role="button"` div; it cannot stay a button once it contains tappable
      carousel slides (interactive-nested-in-interactive). Make the outer
      surface a plain container with a full-bleed click/key handler that is not
      itself a focusable button, or a background `<button>` sibling behind the
      content — slides and CTAs are the real focus stops.
    - **Delete the `tt-home-*` CSS block** in `tabletot.css`, not just
      `HomeView.tsx` (carousel is re-expressed with `tt-attract-*` classes).
    - Slide treatment = **variant B** (name + price on cream below a 3:2 thumb,
      price in `--brand`, peek adjacent slides); label **"Chef's picks"**.
    - Carousel loading = keep skeleton band; 0 picks = CTA only; 1 pick = no
      dots / no auto-advance (see D1 states).
  - Files: `IdleScreen.tsx`, `Index.tsx`, `useDeviceNavigation.ts`, delete `HomeView.tsx`, `tabletot.css`
  - Verify: session-start once per path; carousel reduced-motion; keyboard — Tab
    reaches the CTA and each slide, no nested-button warning; `tsc` clean; E2E
    slide-tap; fits **800×1280 portrait** without scroll
- [x] **T12 (P2, human: ~30min / CC: ~10min)** — breathing pulse on primary CTA
  - Shipped `d3aa061`. CSS-only — `.tt-attract-cta::after` ring, `inset: 0` + `border-radius: inherit` + `2px solid var(--tt-action)`, `pointer-events: none`. `@keyframes tt-attract-cta-breathe` runs `transform: scale(1 → 1.05)` + `opacity: 0.6 → 0`, `2s ease-in-out infinite` (one-directional; scale snap-back happens at opacity 0 so it's invisible). No `box-shadow`. Added `position: relative` to `.tt-attract-cta`. `prefers-reduced-motion` block sets `animation: none; opacity: 0`. IdleScreen.tsx needed no change. No new test (trivial CSS, no logic). tsc + 75 tests green.
  - Surfaced by: D2
  - Files: `tabletot.css`, `IdleScreen.tsx`
  - Verify: K9 visual + reduced-motion off
- [x] **T13 (P2, human: ~1h / CC: ~20min)** — Wi-Fi CTA → Radix Dialog with static SVG QR + copy (heading "Join the café Wi-Fi", instruction line, visible Close)
  - Shipped `4b8a2f1`. QR pre-generated once with the `qrcode` npm CLI (`npx --yes`, not added as a dep) → `apps/kiosk/src/assets/wifi-qr.svg`, payload `WIFI:S:SILVER-GUEST;T:nopass;;`, standard 4-module quiet zone, imported as a URL (no svgr in this project). The plain `Wi-Fi: SILVER-GUEST` `<p>` is now a `<button>` opening a `@radix-ui/react-dialog` (T9 pattern): `Dialog.Title` "Join the café Wi-Fi", instruction line "Point your phone camera at the code — the network is open, no password needed.", `Dialog.Close` "Close". Reuses `.tt-modal` / `.tt-modal-scrim` / `.tt-modal-actions` / `.tt-btn--secondary`; new CSS is only `.tt-wifi-qr` sizing + `.tt-wifi-dialog` centring + a button-reset on `.tt-attract-wifi`. SSID is `const WIFI_SSID = "SILVER-GUEST"` with a `restaurant_settings` TODO. `IdleScreen.test.tsx` +1 (open → heading + instruction + Close → closes). 76 tests green, `pnpm build` bundles the SVG, eslint clean.
  - NOT done here: final Attract layout — the Wi-Fi trigger is still the footer text position; T14 moves it to a subordinate secondary and removes the About link. Phone-scan verify is a device step (can't run here).
  - Surfaced by: D3 + design-review persona-03 copy gap
  - Files: `IdleScreen.tsx`, new `public/` or inline SVG, SSID constant
  - Verify: heading + instruction + visible Close present; scan on a phone, joins SILVER-GUEST
- [x] **T14 (P3, human: ~20min / CC: ~5min)** — Attract layout: reading order per D1, primary "See the menu" + carousel band + two subordinate secondaries ("Popular", "Wi-Fi")
  - Shipped `576b7c8`. CTA `<strong>` relabelled "Touch anywhere to start" → "See the menu" (voice hint line kept; the invisible full-bleed `.tt-attract-touch` target keeps its "Touch anywhere to start" aria-label). Footer `.tt-attract-footer` (About link + plain `Wi-Fi: SILVER-GUEST` text) replaced by `.tt-attract-secondaries` — two quiet outline `.tt-attract-secondary` buttons below the carousel: **Popular** → new `onOpenPopular` prop = `startSession()` then `setCurrentScreen("popular")` (same span_id/AOV reasoning as the slide-tap path — Popular can add to cart), **Wi-Fi** → the T13 dialog. `onInfoToast` prop dropped (only the About link used it; no other caller). `.tt-attract-title` loses `flex: 1` + `justify-content: center` and gets `margin: space-4 0` so content packs from the top; `.tt-attract-secondaries` uses `margin-top: auto` to pin utilities to the bottom → closes the tagline↔CTA gap. Removed `.tt-attract-footer` / `.tt-attract-about*` CSS; `.tt-attract-wifi` → `.tt-attract-secondary` + `.tt-wifi-network`. `IdleScreen.test.tsx` +2 (CTA label, Popular secondary). 78 tests green, `pnpm build` clean, eslint clean (the 1 `Index.tsx` exhaustive-deps warning is the pre-existing `completionRules` one).
  - NOT done here: the 800×1280 portrait no-scroll check + "primary is the only filled accent element" — both are on-device/browser visual steps. Layout math packs from the top with `margin-top: auto` utilities so it should hold, but it wasn't rendered here.
  - Surfaced by: D5 + design-review IA finding
  - Files: `IdleScreen.tsx`, `tabletot.css`
  - Verify: **800×1280 portrait** fits without scroll; primary is the only filled accent element

## Persona → item map (revised)

| Persona | Items |
|---------|-------|
| 01 Rekha (90-sec sprint) | A5, C2, D2, D5 |
| 02 Kavya (toddler) | A3, A6 |
| 03 Krishnamurthy (wary senior) | A4, B1, D3, D5 |
| 04 Priya & Marcus (first-timer) | A1, A4, C2 |
| 05 Zoya & Rohit (aesthetic) | A2, IMG, D1 |
| 06 Arvind (all-day) | A5 (partial); full re-engagement deferred |

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Merged Attract (carousel + CTA hierarchy) | `~/.gstack/projects/tabletot-pilot/designs/merged-attract-20260829/variant-B.png` | Brand → venue name → tagline → single coral "See the menu" pill (only accent element, breathing per D2) → "Chef's picks" carousel band below it → quiet "Popular" / "Wi-Fi" secondaries. Carousel slides: 3:2 thumb + name + price on the cream card **below** the thumb, price in `--brand`, adjacent slides peek. | Generator rendered landscape + `$`; real target is **portrait 800×1280** with ₹. Board: `merged-attract-20260829/design-board.html`. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 17 raised, 11 substantive, folded or deferred |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 7 findings, all folded; 1 critical failure-mode gap handled in T1 |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score 6/10 → 8/10; 4 decisions made, 2 deferred; 1 Attract mockup approved (variant B) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

- **CODEX:** flagged D0 + DB-fallback (already cut in review), plus popular-items data quality, RPC/remote sequencing, "not a modal", analytics blind spot, destructive-tap risk. Data-quality point drove dropping the migration entirely; analytics + modal + tap-guard folded into T9/T10/T3/T11.
- **CROSS-MODEL:** Review and Codex agreed on every substantive point. One tension (all-time ranking) resolved by the user in Codex's direction — stronger than either model alone.
- **DESIGN:** 7 passes; scores before → after fix: IA 5→8, States 7→8, Journey 6→8, AI-Slop 8→8, Design-System 6→8, Responsive/A11y 6→8. 4 decisions folded into the plan: (1) carousel ships this sprint, variant B slide treatment; (2) label vocabulary — carousel "Chef's picks", screen + CTA "Popular", retire "Recommended"/"Frequently Ordered"/"Today's picks" from UI; (3) `×` clear moves to the row's opposite end with a two-tap confirm (toddler guard); (4) Wi-Fi QR dialog gets a heading + instruction line + visible Close. 5 non-fork corrections written straight in: pin portrait 800×1280 (D5/T14), fix `role="button"` nesting in T11, B1 stays on Warm Espresso bridge tokens, carousel loading/1–4-pick states (D1), delete `tt-home-*` CSS in T11. Cart long-name clamp added to A2/T5.
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement. Scope reduced earlier (migration cut, D0 cut, carousel merged into existing code); design review refined 7 tasks (T3, T5, T9, T10, T11, T13, T14), added no new ones.

**UNRESOLVED DECISIONS:**
- Portrait vertical-budget check — the approved mockup is landscape; whether the primary CTA + carousel band + two secondaries actually fit 800×1280 portrait without scrolling is verified during T11/T14, not now.
- `FrequentlyOrderedView.tsx` → `PopularView.tsx` file rename — deferred to the follow-up popularity-ranked version; a header comment covers the label/name mismatch in the meantime.
