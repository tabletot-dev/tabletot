# Tabletot Kiosk — Current Visual Design (as-built)

> **Partially outdated (2026-08-08).** The three-layer CSS mess this
> document exists to document was cut down to one layer plus a temporary
> bridge in the v1.0 redesign (`docs/plans/2026-08-08-kiosk-v1-redesign.md`,
> Task 1.2) — `tabletot.css` is ~5900 lines now, not 9258, and only one
> `:root` block remains. Attract, Menu, Detail, Cart/Sent, Table Status,
> Bill, and Confirmation are on the new `src/styles/tokens.css` system.
> **Games, Table Talk, and voice screens are unchanged** and still match
> what's described below, running on the old palette via the bridge. This
> whole document should be re-audited and replaced once Task 7.0 removes
> the bridge (after Sprints 6–7), not patched piecemeal before then.

**Prepared:** 2026-07-29
**Covers:** `apps/kiosk` (customer-facing tablet PWA), as it actually renders today.
**Purpose:** handoff reference for a frontend designer doing refactoring/enhancement work.

This is **not** the same as `docs/design-system.md` (the "Warm Espresso" spec approved
2026-05-07). That spec has drifted from what's actually in the code — see
[Design system health](#design-system-health-read-this-first) below. This document
describes what a user on the kiosk hardware actually sees today.

---

## Design system health (read this first)

The CSS has three layers of full-page re-theming stacked on top of each other, plus a
separate, unrelated token system used by a handful of components. A designer opening
this codebase cold should know this before touching anything.

### 1. Three `:root` blocks in one file

`apps/kiosk/src/styles/tabletot.css` (9,258 lines, one file) defines the color/radius/shadow
tokens **three times**, each a full re-theme, none of them scoped to a class or media query:

| Block | Line | Name (per the CSS comment) | Theme |
|---|---|---|---|
| 1 | 310 | *(unlabeled — matches docs/design-system.md)* | Warm cream, coral brand ("Warm Espresso") |
| 2 | 5051 | "Industrial premium redesign layer" | Near-black, orange/red brand |
| 3 | 6274 | "Sun-readable bright hardware layer" | Warm cream, orange-red brand |

Because these are plain `:root { }` rules with identical specificity, CSS resolves each
custom property **independently**, in source order — the browser doesn't pick "one block,"
it merges them property-by-property, last-declared-wins. The result actually rendering
today is a hybrid of blocks 2 and 3 (see [Effective tokens](#effective-design-tokens-what-actually-renders)
below). Block 1 — the documented spec — is entirely overridden and dead.

### 2. A second, unrelated token system (`index.css`)

`apps/kiosk/src/index.css` is a separate shadcn/Tailwind scaffold (likely left over from
how this app was originally bootstrapped) with its own HSL custom properties
(`--background`, `--foreground`, `--primary`, `--border`, etc.), imported *before*
`tabletot.css` in `main.tsx`. Its `--background` is near-black (`#040707`) — a dark theme
completely disconnected from the cream kiosk look.

Most of the app ignores this system, but a few components use Tailwind utility classes
that read from it directly:

- **`CompletionNudge.tsx`** — the pre-submit completion nudge modal. This is one of the
  three core recommendation surfaces (per the product's whole value proposition) and it
  currently renders as a black modal (`bg-black/60` backdrop, `bg-background`/`text-foreground`),
  visually disconnected from the warm cream screens around it.
- `IdentityView.tsx`'s "Skip" button (Tailwind classes: `text-muted-foreground`, `hover:border-primary/40`).
- The generic shadcn primitives in `src/components/ui/` (`dialog.tsx`, `input.tsx`,
  `sheet.tsx`, `toggle.tsx`, `button.tsx`) — present but barely used by the actual screens,
  which mostly hand-roll their own markup with `tabletot.css` classes instead.

`index.css` also `@import`s Google Fonts **Outfit** and **Space Grotesk** — neither is
referenced by any `font-family` anywhere in the codebase. Dead weight, one network request
for nothing.

### 3. Font fallback gaps

Only two fonts are actually self-hosted (`apps/kiosk/public/fonts/`, loaded via
`@font-face`): **Manrope** and **Sora**. But the CSS also sets `font-family` to
**"Archivo"** (25 declarations), **"Inter"** (5 declarations), and **"JetBrains Mono"**
(26 declarations) in real component rules, with no `@font-face` and no web font link for
any of them. On the target hardware (Lenovo Tab K9 / Android — see project CLAUDE.md) none
of these are likely to be system-installed, so those rules silently fall back to whatever's
next in the stack (usually Manrope or plain sans-serif). This means text using those
classes may render inconsistently across devices depending on what fonts happen to be
installed locally — and it means "Archivo" headings a developer sees on their dev laptop
(where Archivo may be present) won't match what's on the tablet.

### 4. Heavy duplication

Selectors are declared multiple times across the three redesign layers with different
values: `.dish-card` (3×), `.tag-accent` (3×), `.tag-green` (3×), `.primary-btn` (2×),
`.ghost-pill` (2×), `h1` context rules (20+ separate declarations across screens/media
queries). None of this is fatal on its own, but it makes "what does this actually look
like" unanswerable by reading any single rule in isolation — you have to trace the cascade,
which is what this document has already done for you below.

**Bottom line for the designer:** treat `tabletot.css` blocks 2+3 (merged) as the real
system, ignore block 1 and `index.css`'s dark theme unless told otherwise, and flag
`CompletionNudge` as a known visual-inconsistency bug, not an intentional design choice.

---

## Effective design tokens (what actually renders)

Computed by merging the three `:root` blocks per-property, last-declared-wins — this is
the token set a browser actually resolves today.

| Token | Effective value | Source layer |
|---|---|---|
| `--bg` | `#f4f0e7` | Sun-readable (3) |
| `--panel` | `rgba(255,255,252,0.82)` | Sun-readable (3) |
| `--panel-strong` | `#fffefa` | Sun-readable (3) |
| `--panel-dark` | `#141615` | Sun-readable (3) |
| `--text` | `#151614` | Sun-readable (3) |
| `--muted` | `#5d625d` | Sun-readable (3) |
| `--soft` | `#8a8e87` | Sun-readable (3) |
| `--line` | `rgba(23,24,22,0.12)` | Sun-readable (3) |
| `--line-strong` | `rgba(23,24,22,0.22)` | Sun-readable (3) |
| `--brand` | `#f36c31` | Sun-readable (3), same as Industrial (2) |
| `--brand-deep` | `#ee3739` | Sun-readable (3), same as Industrial (2) |
| `--brand-gold` | `#b66a21` | Sun-readable (3) |
| `--green` | `#3fb56e` | **Industrial (2)** — not redefined in layer 3 |
| `--radius-xl` | `28px` | **Industrial (2)** — not redefined in layer 3 |
| `--radius-lg` | `22px` | **Industrial (2)** |
| `--radius-md` | `18px` | **Industrial (2)** |
| `--radius-sm` | `12px` | **Industrial (2)** |
| `--touch` | `64px` | consistent across all 3 layers |
| `--shadow-lg` | `0 34px 82px rgba(54,43,31,0.22), 0 2px 0 rgba(255,255,255,0.72) inset` | Sun-readable (3) |
| `--shadow-md` | `0 22px 54px rgba(54,43,31,0.16)` | Sun-readable (3) |
| `--shadow-sm` | `0 12px 30px rgba(54,43,31,0.1)` | Sun-readable (3) |

Page background (`body`) is not a flat color: a faint 46px dot-grid overlay, two soft
orange/red radial glows (top-right and bottom-left), over a warm cream diagonal gradient
(`#fffaf0 → #eee9de → #faf7ef`).

### Typography

| Role | Font (as declared) | Actually renders as | Notes |
|---|---|---|---|
| Body text, most UI | `"Inter", "Manrope", sans-serif` | **Manrope** (Inter has no source) | Set on `<body>` |
| Headlines (many screens) | `"Sora", sans-serif` | Sora ✅ | Self-hosted |
| Some headings (`.bill-flow-state h1` etc.) | `"Archivo", "Sora", sans-serif` | **Sora** (Archivo has no source) | |
| Code/status-strip text | `"JetBrains Mono", monospace` | generic **monospace** | e.g. `system-status-strip` |
| Buttons, labels (older rules) | `"Manrope"` | Manrope ✅ | |
| A few components | `"Inter", sans-serif` | generic **sans-serif** or Manrope | |

Both real fonts load as woff2 from `apps/kiosk/public/fonts/`.

### Shape & spacing

- Border radius: `34px` on hero/feature cards is what the doc claims, but effective is
  **`28px`** (xl), `22px` (lg), `18px` (md), `12px` (sm) per the table above.
- Minimum tap target: `64px` height, consistent everywhere.
- Pill buttons: `border-radius: 100px` / `999px` (both used, functionally identical).

---

## Component patterns (verified against live component code)

### Buttons

- **`.primary-btn`** — brand-color fill, white text, `64px` touch height, pill-shaped.
  Variants: `.wide` (full-width), used for every primary CTA (Start Ordering, Confirm
  Order, Add to Order, Request Bill at Table).
- **`.secondary-btn`** — outline/ghost style, same height. `.secondary-btn.light` variant
  for use on dark backgrounds.
- **`.ghost-pill`** — plain pill chip, no strong chrome (used for "View Dish" label on
  hero card, example voice prompts).
- **`.chip-action`** — small "Add" chip on dish cards before an item is in the cart.

### Tags

Applied via a shared `TAG_CLASS` lookup used identically in `HomeView`, `DetailView`, and
`DishCard`:

```
"Chef's Pick" → .tag-dark
"Best Seller" → .tag-accent
"Signature"   → .tag-light
"New"         → .tag-green
```
`DishCard` additionally maps `"Pairs Well"` and `"Quick Add"` → `.tag-light`.

### Cards & panels

- **`.panel`** — the base translucent surface for all content blocks (order lists, summary
  sidebars, utility cards).
- **`.dish-card`** — menu grid item: image top (`.dish-media`, category-gradient or photo
  fallback), tags overlaid top-left, name + diet mark + price + stepper/add button below.
  When quantity > 0 and pairings exist, expands in-place to show a `.card-pairing-panel`
  (up to 2 pairing chips with their own add/stepper controls) — this is the post-add
  pairing nudge, rendered inline rather than as a separate modal.
- **`.compact-card`** — smaller variant used for pairing suggestions in `DetailView` and
  waiting-screen suggestion rails (64–72px square thumb + name + price).
- **Stepper** (`.card-stepper` / `.stepper`) — `−` / qty / `+` control, reused across
  DishCard, DetailView, CartView, MiniCartSidebar.

### Image fallback

`itemImageBackground()` (`src/lib/menuImages.ts`) is called everywhere a dish photo would
go — dish cards, hero card, cart rows, pairing thumbs. Falls back to a category-based
CSS gradient when `image_url` is null. Never remove this fallback (per project CLAUDE.md —
`image_url` is nullable and often is null in dev/new items).

---

## Screen-by-screen (all screens in the app, not just the original 6)

The original design-system.md documented 6 screens. The kiosk now has **14** distinct
screens/states. New ones since May are marked **NEW**.

### IdleScreen (attract mode) — `IdleScreen.tsx`
Full-screen tappable button. Tabletot logo, restaurant name lockup ("SILVER / SPECIALTY
COFFEE"), "Touch anywhere to continue." No header chrome (`HEADERLESS_SCREENS`).

### IdentityView — `IdentityView.tsx` — **NEW**
Asks for the guest's name before ordering (optional, skippable). Reuses the HomeView split
layout (`home-command-grid` / `home-launch-panel` / `home-spotlight-stack`) with a plain
text input instead of the hero card content. Note: the input and "Skip" button use raw
inline `style` and Tailwind utility classes respectively, rather than the shared
`.primary-btn`/`.secondary-btn` classes — inconsistent with the rest of the app's "never
use inline style for color" rule.

### HomeView — `HomeView.tsx`
Split layout: copy panel (eyebrow → 3-line animated headline "Speak. / Order. / Served." →
subtext → "Start Ordering" CTA → status strip) left, rotating chef's-pick hero card right
(cycles every 4s, tags + name + price + "View Dish" pill + pagination dots). Below: two
quick-action utility cards (Dietary Info, Wi-Fi) plus a lower "About Us" panel and two
static info cards (Chef's Note, Hours).

### MenuView — `MenuView.tsx`
Horizontal scrollable category pill bar (not a sidebar, as the old spec claimed) at the
top, each pill with an SVG icon (`CategoryIcon`) + label. Below: canvas header (eyebrow +
category `h1`), inline toolbar (All/Veg/Non-Veg filter pills + item count), then a
`DishCard` grid. Loading and error states are hand-styled inline (spinner div, retry
button) rather than shared components.

### DetailView — `DetailView.tsx`
Split layout: photo panel left, detail panel right. Eyebrow (category) → name → tags →
auto-generated description → facts grid (category/diet/type) → up to 4 pairing
`.compact-card`s → sticky footer with price + Add-to-Order or stepper. If voice is
available, a floating mic dock with example prompt bubbles sits over the photo panel.

### CartView + MiniCartSidebar — `CartView.tsx`, `MiniCartSidebar.tsx`
CartView: split layout, scrollable order list left (thumb + name + price + stepper + line
total, with a read-only "already sent" rounds section below), fixed summary panel right
(subtotal/GST/total + Confirm/Continue buttons). MiniCartSidebar is a persistent rail shown
alongside MenuView/DetailView (not just at final checkout) — animated list (framer-motion)
of current cart items with live count/total, plus an "already ordered" section.

### ConfirmationView — `ConfirmationView.tsx`
Centered single panel, logo mark, "Order confirmed" eyebrow, "Order sent to the kitchen."
Auto-advances to WaitingView after 5s. No header.

### WaitingView — `WaitingView.tsx`
Two-part layout: an auto-rotating **ad/promo slideshow panel** (4.5s interval, currently
pulling stock Unsplash images for travel/audio/fashion/wellness — placeholder content, not
real sponsors) and an **order status panel** live-subscribed to Supabase (`orders` table
realtime channel) showing kitchen stage (Queued/Cooking/Plating/Done) as a progress bar.
Below: CTA row — Order More, Request Bill, Request Water, and two entertainment buttons
(Games, Conversation Starters).

### BillView — `BillView.tsx` — **NEW**
Split layout: itemized bill (all rounds) + subtotal/GST/total left, "Request Bill at Table"
/ "Continue Ordering" right. Requesting a bill opens a phone-number capture modal
(`.bill-phone-backdrop`), then shows a full-screen "Bill coming your way" confirmation
state with the Tabletot logo as a loading/success mark.

### GamesView — `GamesView.tsx` — **NEW**
A 4-game arcade for the waiting period: Tic-Tac-Toe, Connect 4, Word Duel (rapid-fire
prompt cards), and Ludo (full classic board implementation with 2–4 players/colors). Not
covered by any existing design documentation at all — worth a dedicated design pass since
it's a genuinely large, custom-built surface (27KB of component code).

### ConversationStartersView — `ConversationStartersView.tsx` — **NEW**
Table-side icebreaker prompts grouped into 6 categories (Best Friends, New Friends,
Business Meeting, Date Night, Family, Parent & Child), each with a themed signal line and
~10 rotating questions.

### ListeningScreen (voice, single-turn) — `ListeningScreen.tsx`
Full-screen dark overlay sheet sliding up from the bottom (`.voice-sheet`), animated mic
orb with pulse rings, phase copy (Connecting… / Listening / Processing… / error), sound
wave animation while recording, example prompt chips. 30s auto-timeout.

### VoiceConversationPanel (voice, multi-turn) — `VoiceConversationPanel.tsx` — **NEW**
A second, richer voice UI beyond ListeningScreen — a persistent conversation thread (turns
survive the panel closing) with press-to-talk toggle, used from `DetailView`'s mic dock.
Not documented anywhere previously; appears to be a newer, parallel voice surface to
ListeningScreen rather than a replacement — worth confirming with the team which one is
canonical before a designer invests time in either.

---

## What to tell the designer, in short

1. **Don't design against `docs/design-system.md`'s color values** — use the "Effective
   design tokens" table above instead; it's what's actually on screen.
2. **`CompletionNudge` is visually broken** relative to the rest of the app (wrong theme
   entirely) — flag as a bug to fix, not a style to match.
3. **Fonts**: only Manrope + Sora are real. Any redesign should either commit to those two
   or explicitly add real font loading for whatever else is wanted — don't reference
   "Archivo"/"Inter"/"JetBrains Mono" and assume they're loading.
4. **6 screens are entirely undocumented** (Identity, Bill, Games, Conversation Starters,
   plus the voice conversation panel) and will need fresh design attention, not just a
   coat of paint on the original 6.
5. The CSS itself (9,258 lines, 3 overlapping theme layers, duplicated selectors) is a
   real constraint on how easily any redesign can be implemented — a refactor that
   consolidates to one `:root` block would make future design work much faster to ship,
   independent of what the new visual direction ends up being.
