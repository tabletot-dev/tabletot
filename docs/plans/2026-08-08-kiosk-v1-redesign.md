# Kiosk v1.0 Redesign Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> Execute one task at a time, in order. Every task ends with a passing test run
> and a commit. Do not start Sprint N+1 until Sprint N is committed and green.

**Goal:** Re-skin `apps/kiosk` to match `docs/Tabletot Kiosk - Workflow Handoff.md`
(single-column portrait, flat 2px-border design system, Sora + Manrope) without
changing the backend and without breaking AOV attribution.

**Architecture:** Replace the accreted 9,258-line stylesheet with one token-driven
sheet built from the handoff's token set. Convert the two-pane browse/cart layout
to single-column with docked bars. Add a client-side 2-minute hold before a round
is sent to the kitchen. The Supabase schema, the ledger RPCs, and the voice
pipeline are **not touched**.

**Tech Stack:** React 18 + Vite + TypeScript, vanilla CSS (`src/styles/tabletot.css`),
Tailwind (only for `components/ui/*` and `CompletionNudge`), framer-motion,
vitest + @testing-library/react, Supabase JS.

**Source of truth:** `docs/Tabletot Kiosk - Workflow Handoff.md` (the corrected
companion). The `.html` bundle is the visual reference; where the two disagree,
**the `.md` wins** — the HTML's spec tables carry off-by-one screen numbers.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Colour tokens — exact values, no substitutions:**

| Token | Value | Use |
|---|---|---|
| `--tt-ink` | `#111310` | All type and structural borders |
| `--tt-ink-60` | `#43483F` | Secondary type only |
| `--tt-action` | `#F36C31` | Fill only, white label. One per screen. Never text, border or glow |
| `--tt-action-press` | `#D95A22` | Hover / pressed |
| `--tt-paper` | `#FFFFFF` | Cards and bars. Fully opaque — no rgba, no blur |
| `--tt-field` | `#EDECE6` | Page behind cards. Flat |
| `--tt-line` | `#C9C7BF` | Default 2px border |
| `--tt-disabled` | `#8A8E87` | Disabled label and icon |
| `--tt-veg` | `#0E7A3C` | Vegetarian mark, always with a circle |
| `--tt-nonveg` | `#9B1C1C` | Non-vegetarian mark, always with a triangle |
| `--tt-info` | `#12457E` | Informational only, never an action |
| `--tt-on-dark` | `#E7E5DE` | Type on `--tt-ink` surfaces |
| `--tt-on-dark-70` | `#CFCCC4` | Secondary type on ink surfaces, 17px floor |
| `--tt-line-dark` | `#6A6E67` | 2px border on ink surfaces |
| `--tt-skeleton-2` | `#E9E7E0` | Secondary skeleton bar |

**Type:** Sora 800/56px display · Sora 700/40px headings · Sora 700/26px dish names ·
Manrope 800/24px CTAs (**floor — never smaller**) · Manrope 500/20px body ·
Manrope 700/18px labels and prices.

**Geometry:** Spacing 8/12/16/24/32/48/64. Radii 8 badges · 12 chips and fields ·
18 cards and primary buttons · 999 pills. Screen gutter 24. Card padding 16.

**Elevation:** One model — a `2px solid` border. **Zero `box-shadow`. Zero
`backdrop-filter`.** Both vanish in glare on a real tablet.

**Tap targets:** 64px minimum, 88px primary, 8px minimum gap between adjacent targets.

**Motion:** 120ms state, 240ms navigation, ease-out. Screens push horizontally.
The only looping animation is the voice waveform, because it is a status.

**Layout:** Fixed portrait, one column at every size. No content breakpoints.
Reference 800 × 1280. `--tt-scale` set once from the viewport at boot; all spacing
and type derive from it. Pattern is always: header → one scroll region → docked
bars, with bars `flex: none`.

**AOV — the hard constraint.** `get_aov_summary` (migration 0050) computes
`direct_revenue` from `item_added` events whose `payload->>'source'` is
`'pairing_chip'` or `'completion_nudge'`, filtered to items that survive into the
final `items_json`. Therefore:

- The post-add pairing panel **must** keep firing `item_added` with source `pairing_chip`.
- The completion nudge **must** keep existing and firing source `completion_nudge`.
  The handoff omits it; we keep it anyway and restyle it.
- Never change the `Source` union in `src/lib/eventBus.ts` without changing
  migration 0050 to match.

**Explicitly out of scope — do not do these even though the handoff mentions them:**

- Money as integer minor units. The codebase uses integer rupees end to end
  (`menu_items.price`, `orders.total`, `computeTotals`). Changing it would touch
  `submit_order`, the POS, and the AOV functions. Leave it alone.
- Any Supabase migration. This plan adds none.
- Any change to `src/lib/voice/*`, `VoiceOrderButton`, `ListeningScreen`, or
  `VoiceConversationPanel` before Sprint 7. **The voice pipeline is frozen.**
- Landscape support, rotate prompts, or content breakpoints. Portrait is fixed
  for the pilot.
- Modifier groups, allergens, calories, macros, stock limits. `menu_items` has no
  columns for them.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/styles/tokens.css` | The token set above, plus `--tt-scale` derivation. Nothing else. |
| `src/lib/pendingRound.ts` | sessionStorage persistence + expiry for the 2-minute hold. Pure, no React. |
| `src/hooks/useRoundHold.ts` | React wrapper: countdown state, expiry callback, cancel/extend. |
| `src/components/AppBar.tsx` | Top bar: venue lockup + table pill. Replaces `AppHeader`. |
| `src/components/OrderBar.tsx` | Docked bottom bar: count · total · "Review order". Replaces `MiniCartSidebar`. |
| `src/components/StatusStrip.tsx` | Docked strip: live round stage / hold countdown. |
| `src/components/screens/SentView.tsx` | Screen 11 — hold countdown, Edit / Cancel / Send now. |
| `src/components/screens/CancelConfirm.tsx` | Screen 10 — modal interrupt. |
| `src/lib/sentry.ts` | Sentry init, no-op when the DSN is absent. |
| `src/components/__tests__/aov-attribution.test.tsx` | The AOV regression guard. |
| `src/lib/__tests__/pendingRound.test.ts` | Hold persistence and expiry. |

**Rewritten in stages** (see Task 1.2 for why this is not a single cut):

| Path | Note |
|---|---|
| `src/styles/tabletot.css` | 9,258 lines. Task 1.2 deletes the three override layers (5050–9258) and bridges the base onto the new tokens; each later sprint deletes its screen's base rules; Task 7.0 deletes what remains. Filename unchanged so `main.tsx` needs no edit. |

**Modified:**

| Path | Change |
|---|---|
| `src/index.css` | Drop the Google Fonts `@import`; retune the Tailwind HSL `:root` to the new palette |
| `src/main.tsx` | Add `import "./styles/tokens.css";` before `tabletot.css`; call `initSentry()` |
| `src/components/AppShell.tsx` | Use `AppBar`; add the docked-bar slots |
| `src/components/screens/MenuView.tsx` | Grid → single-column list; skeleton + empty + error states |
| `src/components/DishCard.tsx` | New card geometry. **Pairing panel logic unchanged.** |
| `src/components/screens/DetailView.tsx` | Modal → full-screen push; real description; fix pairing source |
| `src/components/screens/CartView.tsx` | `split-layout` → one column; round grouping |
| `src/components/screens/WaitingView.tsx` | Split into Status home; `"Done"` → `"Served"` |
| `src/components/screens/BillView.tsx` | Restyle; import `TAX_RATE` from `pricing.ts` |
| `src/components/CompletionNudge.tsx` | Restyle to new tokens. **Event logic unchanged.** |
| `src/pages/Index.tsx` | Wire the hold; new screen cases |
| `src/hooks/useDeviceNavigation.ts` | Add `"sent"` to `ScreenType`; hold state |
| `src/lib/menuStore.tsx` | Select `description` from `menu_items` |

**Deleted:** `src/components/AppHeader.tsx`, `src/components/MiniCartSidebar.tsx`.

---

## Sprint 0 — Safety net

**Nothing in this sprint changes how the kiosk looks.** It exists so the next six
sprints can't silently break the AOV number or fail invisibly on the tablet.
Do not skip it.

### Task 0.1: AOV attribution regression test

**Files:**
- Create: `src/components/__tests__/aov-attribution.test.tsx`

**Interfaces:**
- Consumes: `DishCard` (default export), `MenuView` (default export),
  `useDeviceNavigation` (named export), `track` from `@/lib/eventBus`
- Produces: nothing — this is a guard, later tasks must keep it green

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/aov-attribution.test.tsx
//
// This file is the guard on the only two event sources that feed
// get_aov_summary's direct_revenue (migration 0050): 'pairing_chip' and
// 'completion_nudge'. The redesign moves every surface that emits them.
// If these tests go red, the owner-facing AOV number is about to go wrong
// and nothing else in the app will error to tell you.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";

// vi.hoisted, not plain consts: vi.mock factories are hoisted above the module
// body, so a factory referencing a normal const would read it before
// initialisation. The fixtures have to be hoisted alongside the mocks.
const fx = vi.hoisted(() => ({
  toast: {
    id: "i1", name: "Avocado Toast", price: 390,
    category: "Breakfast", tags: [] as string[], is_veg: true,
  },
  coldBrew: {
    id: "i2", name: "Silver Cold Brew", price: 290,
    category: "Coffee", tags: [] as string[], is_veg: true,
    context: null, priority: 10,
  },
}));

vi.mock("@/lib/eventBus", () => ({ track: vi.fn() }));

vi.mock("@/lib/menuStore", () => ({
  useMenu: () => ({
    items: [fx.toast],
    itemsByCategory: { Breakfast: [fx.toast] },
    categories: ["Breakfast"],
    pairingsByItemId: { i1: [fx.coldBrew] },
    anchors: [],
    completionRules: [],
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

import DishCard from "@/components/DishCard";
import MenuView from "@/components/screens/MenuView";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import { track } from "@/lib/eventBus";
import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";

const toast = fx.toast as MenuItem;
const coldBrew = fx.coldBrew as PairedItem;

function renderDishCard(qty: number, onAddPairing = vi.fn()) {
  render(
    <DishCard
      item={toast}
      qty={qty}
      pairings={[coldBrew]}
      cartTotal={qty * toast.price}
      onAddToCart={vi.fn()}
      onUpdateQuantity={vi.fn()}
      onSelect={vi.fn()}
      onAddPairing={onAddPairing}
      getQuantity={() => 0}
    />,
  );
  return onAddPairing;
}

describe("pairing panel (AOV surface: pairing_chip)", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("stays hidden until the dish is in the cart", () => {
    renderDishCard(0);
    expect(screen.queryByRole("button", { name: /Add Silver Cold Brew/i })).toBeNull();
    expect(track).not.toHaveBeenCalledWith("recommendation_shown", expect.anything());
  });

  it("fires recommendation_shown once the dish is in the cart", () => {
    renderDishCard(1);
    expect(track).toHaveBeenCalledWith("recommendation_shown", {
      itemId: "i2",
      surface: "inline_pairing",
    });
  });

  it("fires recommendation_tapped and hands the item up on Add", () => {
    const onAddPairing = renderDishCard(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Silver Cold Brew/i }));
    expect(track).toHaveBeenCalledWith("recommendation_tapped", {
      itemId: "i2",
      surface: "inline_pairing",
    });
    expect(onAddPairing).toHaveBeenCalledWith(coldBrew);
  });
});

describe("cart hook emits the AOV-critical sources verbatim", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("emits item_added with source pairing_chip", () => {
    const { result } = renderHook(() => useDeviceNavigation());
    act(() => result.current.addToOrder(coldBrew, "pairing_chip"));
    expect(track).toHaveBeenCalledWith("item_added", {
      itemId: "i2",
      source: "pairing_chip",
    });
  });

  it("emits item_added with source completion_nudge", () => {
    const { result } = renderHook(() => useDeviceNavigation());
    act(() => result.current.addToOrder(toast, "completion_nudge"));
    expect(track).toHaveBeenCalledWith("item_added", {
      itemId: "i1",
      source: "completion_nudge",
    });
  });
});

describe("MenuView wires the pairing Add to source pairing_chip", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("calls onAddToCart with the literal string pairing_chip", () => {
    const onAddToCart = vi.fn();
    render(
      <MenuView
        onSelect={vi.fn()}
        onAddToCart={onAddToCart}
        onUpdateQuantity={vi.fn()}
        order={[{ ...toast, quantity: 1 }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add Silver Cold Brew/i }));
    expect(onAddToCart).toHaveBeenCalledWith(coldBrew, "pairing_chip");
  });
});
```

- [ ] **Step 2: Run it against the CURRENT code**

Run: `npm test -- aov-attribution`
Expected: **PASS**. This test describes behaviour that already exists. If any
case fails now, the test is wrong — fix the test, not the app. Do not proceed
until it is green against the unmodified codebase.

- [ ] **Step 3: Commit**

```bash
git add src/components/__tests__/aov-attribution.test.tsx
git commit -m "test: pin AOV attribution surfaces before kiosk redesign"
```

---

### Task 0.2: Sentry error monitoring

**Files:**
- Create: `src/lib/sentry.ts`
- Modify: `src/main.tsx`
- Modify: `apps/kiosk/.env.local` (manual — see Manual Steps)

**Interfaces:**
- Produces: `initSentry(): void` — safe to call unconditionally; no-ops without a DSN

- [ ] **Step 1: Install the dependency**

```bash
cd apps/kiosk && npm install @sentry/react
```

- [ ] **Step 2: Write the init module**

```ts
// src/lib/sentry.ts
import * as Sentry from "@sentry/react";

// The kiosk runs unattended on a tablet in a restaurant nobody is watching.
// A white screen is otherwise completely invisible to us.
//
// ponytail: no tracing, no replay, no profiling — errors only. Add sampling
// if we ever need performance data, which a single-tenant pilot does not.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // local dev and any build without the env var

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // One kiosk = one table. Tagging by table makes a device-specific fault
    // (bad wifi corner, cracked digitiser) obvious in the issue list.
    initialScope: {
      tags: {
        table: new URLSearchParams(window.location.search).get("table")
          ?? (import.meta.env.VITE_TABLE_ID as string)
          ?? "unknown",
      },
    },
  });
}
```

- [ ] **Step 3: Wire it into the entry point**

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initSentry } from "./lib/sentry";
import "./index.css";
import "./styles/tabletot.css";

initSentry();

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: Verify the build and the no-DSN path**

Run: `npm run build`
Expected: PASS, no TypeScript errors.

Run: `npm test`
Expected: PASS. `initSentry` is not called in tests, and it returns early
without a DSN, so nothing should change.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/sentry.ts src/main.tsx
git commit -m "feat: Sentry error monitoring for the unattended kiosk"
```

---

## Sprint 1 — Token foundation

After this sprint the app will look **broken** — old class names, new tokens,
no layout rules. That is expected and it is fixed in Sprint 2. Do not try to
keep the old design working while replacing it; the whole point is that the
four override layers go away in one cut.

### Task 1.1: The token sheet

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: every `--tt-*` custom property in Global Constraints, plus
  `--tt-scale`, `--tt-space-{1..7}`, `--tt-radius-{badge,chip,card,pill}`,
  `--tt-dur-{state,nav}`

- [ ] **Step 1: Write the sheet**

```css
/* src/styles/tokens.css
 *
 * The single token set for the kiosk. Nothing in this file selects an element
 * other than :root. If you are adding a rule with a class selector, it belongs
 * in tabletot.css.
 *
 * Contrast ratios are stated against the surface the token sits on and were
 * taken from the v1.0 handoff. Every new colour must arrive with one.
 */
:root {
  /* ── Colour ─────────────────────────────────────────────────── */
  --tt-ink:           #111310; /* 18.4:1 on paper */
  --tt-ink-60:        #43483F; /*  9.1:1 on paper */
  --tt-action:        #F36C31; /* fill only, white label */
  --tt-action-press:  #D95A22;
  --tt-paper:         #FFFFFF;
  --tt-field:         #EDECE6;
  --tt-line:          #C9C7BF;
  --tt-disabled:      #8A8E87;
  --tt-veg:           #0E7A3C; /*  5.5:1 on paper — always with a circle   */
  --tt-nonveg:        #9B1C1C; /*  8.6:1 on paper — always with a triangle */
  --tt-info:          #12457E; /* 10.3:1 on paper — never an action        */
  --tt-on-dark:       #E7E5DE; /* 15.4:1 on ink */
  --tt-on-dark-70:    #CFCCC4; /* 10.2:1 on ink, 17px floor */
  --tt-line-dark:     #6A6E67;
  --tt-skeleton-2:    #E9E7E0;

  /* ── Scale ──────────────────────────────────────────────────────
   * Set once at boot by setScaleFromViewport() in main.tsx. 1 = the
   * 800 x 1280 reference canvas, where every value below is literal px.
   */
  --tt-scale: 1;

  /* ── Spacing · 8-point ──────────────────────────────────────── */
  --tt-space-1: calc( 8px * var(--tt-scale));
  --tt-space-2: calc(12px * var(--tt-scale));
  --tt-space-3: calc(16px * var(--tt-scale));
  --tt-space-4: calc(24px * var(--tt-scale));
  --tt-space-5: calc(32px * var(--tt-scale));
  --tt-space-6: calc(48px * var(--tt-scale));
  --tt-space-7: calc(64px * var(--tt-scale));

  --tt-gutter:  var(--tt-space-4); /* 24 — screen gutter, the minimum */
  --tt-pad-card: var(--tt-space-3); /* 16 */

  /* ── Radii ──────────────────────────────────────────────────── */
  --tt-radius-badge:  8px;
  --tt-radius-chip:  12px;
  --tt-radius-card:  18px;
  --tt-radius-pill: 999px;

  /* ── Type ───────────────────────────────────────────────────────
   * Sora for display and titles, Manrope for everything read as prose
   * or pressed as a control. 24px is the CTA floor and is not negotiable.
   */
  --tt-font-display: "Sora", sans-serif;
  --tt-font-text:    "Manrope", sans-serif;

  --tt-size-display:  calc(56px * var(--tt-scale));
  --tt-size-heading:  calc(40px * var(--tt-scale));
  --tt-size-dish:     calc(26px * var(--tt-scale));
  --tt-size-cta:      calc(24px * var(--tt-scale));
  --tt-size-body:     calc(20px * var(--tt-scale));
  --tt-size-meta:     calc(18px * var(--tt-scale));

  /* ── Tap targets ────────────────────────────────────────────── */
  --tt-tap:         calc(64px * var(--tt-scale));
  --tt-tap-primary: calc(88px * var(--tt-scale));

  /* ── Motion ─────────────────────────────────────────────────── */
  --tt-dur-state: 120ms;
  --tt-dur-nav:   240ms;
  --tt-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

/* One elevation model: a 2px solid border. There is deliberately no
 * --tt-shadow-* token. If you find yourself wanting one, the answer is a
 * border. Shadows vanish under restaurant glare on a real tablet. */
```

- [ ] **Step 2: Derive the scale at boot and import the sheet**

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initSentry } from "./lib/sentry";
import "./index.css";
import "./styles/tokens.css";
import "./styles/tabletot.css";

// The design canvas is 800 x 1280 portrait and every token above is a literal
// pixel at that size. Real panels differ, so derive one multiplier from the
// narrower axis and let every spacing and type token scale off it. Read once
// at boot, not on resize: this is a fixed-orientation kiosk, and a live
// listener would only ever fire for the on-screen keyboard.
function setScaleFromViewport(): void {
  const scale = Math.min(window.innerWidth / 800, window.innerHeight / 1280);
  // Clamped so a phone-sized dev window stays legible and a large kiosk does
  // not blow the 800px column apart — the handoff's 0.80 and 1.5 targets sit
  // inside this range.
  const clamped = Math.min(Math.max(scale, 0.75), 1.6);
  document.documentElement.style.setProperty("--tt-scale", String(clamped));
}

setScaleFromViewport();
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS — Sprint 0's guard must still be green.

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/main.tsx
git commit -m "feat: v1.0 design tokens and --tt-scale derivation"
```

---

### Task 1.2: Cut the override layers and bridge the base

**Files:**
- Modify: `src/styles/tabletot.css`
- Modify: `src/index.css`

**Interfaces:**
- Produces: the eight layout primitives and the component classes named in
  Task 1.3's checklist, coexisting with a bridged base layer

**Why this is not a clean replacement.** Deleting all 9,258 lines at once would
strip the rules behind 94 class names still used by screens this plan rebuilds
later — Games (40), Table Talk (22), VoiceConversationPanel (22), ListeningScreen
(16), VoiceOrderButton (7). Those screens would render as unstyled divs, and
voice is live in production today. So: delete the three override layers now,
bridge the base layer onto the new tokens, and delete base rules per screen as
each sprint rebuilds it. Sprint 7 finishes when the base layer is gone.

- [ ] **Step 1: Confirm the file state before cutting**

Run:
```bash
grep -c "box-shadow\|backdrop-filter" src/styles/tabletot.css
grep -n "^:root" src/styles/tabletot.css
wc -l src/styles/tabletot.css
```
Expected: `142`, three `:root` matches at lines **310, 5051, 6274**, and `9258`
lines. If these do not match exactly, someone has edited the file since this plan
was written — stop and re-derive the layer boundaries before deleting anything.

- [ ] **Step 2: Delete the override layers, keeping four rule families**

Delete **lines 5050 to 8405** — from `/* Industrial premium redesign layer */`
down to just before `/* Classic Ludo: bright board game mode … */`. That is two
of the three stacked redesigns, and it takes the second and third `:root` blocks
with it, which is what makes the remaining one authoritative.

The tail block (**8406–9258**) is not safe to delete wholesale. Four rule
families have their **only** definition there and are still on screen until a
later sprint rebuilds them:

| Keep | Only definition | Deleted by |
|---|---|---|
| `.classic-ludo-*` (15 rules) | tail block | Task 6.2 |
| `.classic-dice-face` | tail block | Task 6.2 |
| `.bill-phone-*` (4 rules) | tail block | Task 5.2 |
| `.bill-flow-*` (3 rules) | tail block | Task 5.2 |

Keep those four families; delete everything else in 8406–9258. The rest of that
block re-styles `.bill-view`, `.game-mode-*`, `.primary-btn`, `.secondary-btn`,
`.hero-sub` and `.eyebrow`, all of which have base-layer definitions that take
over. `.header-status-return` also lives only in the tail — delete it, since
Task 2.1 removes the component that used it.

```bash
# Verify the cut landed where you think it did.
grep -c "^:root" src/styles/tabletot.css        # expect 1
grep -c "classic-ludo" src/styles/tabletot.css  # expect > 0 — Ludo must survive
grep -c "bill-phone" src/styles/tabletot.css    # expect > 0
grep -c "header-status-return" src/styles/tabletot.css  # expect 0
```

Do **not** try to verify this by diffing every `className` in `src/` against the
stylesheet — Tailwind utilities and multi-line `className` strings make that
output ~119 lines of noise, most of it false. The four greps above are the real
gate, because they check the exact families that were proven override-only.

Then confirm by eye. Run `npm run dev` at 800 × 1280 and open, in order:
Attract → Menu → a dish → Cart → Status → Bill → **Bill phone entry** →
Games → **Ludo** → Table Talk → the voice dock. Nothing may render as
unstyled block-flow text. Plain and a bit wrong is expected; unstyled is a
cut that went too far — restore from `git diff` and re-cut.
**Kill the dev server before finishing.**

- [ ] **Step 3: Bridge the base layer onto the new tokens**

Replace the body of the single remaining `:root` block (line 310) so the old
variable names resolve to the new token set. Every untouched screen then lands
on the v1.0 palette without editing 713 selectors.

```css
/* Bridge — TEMPORARY.
 *
 * The base layer below still styles the screens this plan has not rebuilt yet
 * (games, table talk, voice). Rather than restyle 713 selectors we cannot see
 * the value of yet, remap the names they already use onto the v1.0 tokens.
 *
 * Every sprint that rebuilds a screen deletes that screen's rules from the base
 * layer in the same commit. When the last one goes, this block goes with it.
 * Tracked by the grep in Task 7.0.
 */
:root {
  --bg:           var(--tt-field);
  --panel:        var(--tt-paper);
  --panel-strong: var(--tt-paper);
  --panel-dark:   var(--tt-ink);
  --line:         var(--tt-line);
  --line-strong:  var(--tt-line);
  --text:         var(--tt-ink);
  --muted:        var(--tt-ink-60);
  --soft:         var(--tt-disabled);
  --brand:        var(--tt-action);
  --brand-deep:   var(--tt-action-press);
  --brand-gold:   var(--tt-action);
  --green:        var(--tt-veg);

  /* One elevation model. The old sheet's three shadow tokens all resolve to
   * nothing so the ~140 rules that reference them stop painting, without
   * having to find and edit each one. */
  --shadow-lg: none;
  --shadow-md: none;
  --shadow-sm: none;

  --radius-xl: var(--tt-radius-card);
  --radius-lg: var(--tt-radius-card);
  --radius-md: var(--tt-radius-chip);
  --radius-sm: var(--tt-radius-chip);
  --touch:     var(--tt-tap);
}

/* The base layer paints a dot grid and two radial glows on the body, and uses
 * translucent panels. The handoff bans all three: flat field, opaque paper. */
body {
  background: var(--tt-field) !important;
  background-image: none !important;
}
```

- [ ] **Step 4: Append the new primitives and component classes**

At the **end** of the file (after the bridged base layer), add the v1.0 system.
The `.tt-` prefix means it cannot collide with anything above it.

1. A reset: `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }`
2. `html, body` — `color: var(--tt-ink)`, `font-family: var(--tt-font-text)`,
   `font-size: var(--tt-size-body)`, `-webkit-tap-highlight-color: transparent`,
   `overscroll-behavior: none`.
3. The eight layout primitives: `.tt-shell`, `.tt-appbar`, `.tt-navbar`,
   `.tt-scroll`, `.tt-orderbar`, `.tt-voicedock`, `.tt-statusstrip`,
   `.tt-modal` / `.tt-toast`.
4. Component classes per Task 1.3.

Rules while writing it:

- **No `box-shadow`. No `backdrop-filter`. No `rgba()` on a panel background.**
  Depth is `border: 2px solid var(--tt-line)`.
- No `grid-template-columns` with more than one column anywhere.
- Every interactive element gets `min-height: var(--tt-tap)`; primary CTAs get
  `min-height: var(--tt-tap-primary)`.
- Every colour is a `var(--tt-*)`. No literal hex in anything you write.
- The shell is `display: flex; flex-direction: column; height: 100dvh`. The
  scroll region is `flex: 1; overflow-y: auto`. Every bar is `flex: none`.

- [ ] **Step 5: Strip the Google Fonts import and retune the Tailwind palette**

In `src/index.css`, delete line 1 entirely:

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
```

It is a network round-trip on every boot for two fonts the design does not use,
and it fails on restaurant wifi with no internet.

Then replace the HSL values in the `@layer base { :root { ... } }` block so the
shadcn components in `components/ui/*` and `CompletionNudge` inherit the new
palette instead of the old dark theme:

```css
    --background: 60 9% 92%;    /* #EDECE6 --tt-field  */
    --foreground: 90 6% 7%;     /* #111310 --tt-ink    */
    --card: 0 0% 100%;          /* #FFFFFF --tt-paper  */
    --card-foreground: 90 6% 7%;
    --popover: 0 0% 100%;
    --popover-foreground: 90 6% 7%;
    --primary: 20 89% 57%;      /* #F36C31 --tt-action */
    --primary-foreground: 0 0% 100%;
    --secondary: 60 9% 92%;
    --secondary-foreground: 90 6% 7%;
    --muted: 60 9% 92%;
    --muted-foreground: 90 6% 27%;   /* #43483F --tt-ink-60 */
    --accent: 20 89% 57%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 69% 36%;        /* #9B1C1C --tt-nonveg */
    --destructive-foreground: 0 0% 100%;
    --border: 47 10% 77%;            /* #C9C7BF --tt-line */
    --input: 47 10% 77%;
    --ring: 20 89% 57%;
    --radius: 18px;                  /* was 0px */
```

- [ ] **Step 6: Verify**

Run:
```bash
grep -c "backdrop-filter" src/styles/tabletot.css
```
Expected: `0`. Blur has no bridge — delete every occurrence by hand; there are
few and they are all in the layers you just cut or in panel rules.

Run:
```bash
grep -n "box-shadow" src/styles/tabletot.css | grep -v "var(--shadow"
```
Expected: no output. Literal `box-shadow: 0 …` declarations must be deleted;
ones that read `var(--shadow-md)` are already neutralised by the bridge.

Run: `npm run build && npm test`
Expected: both PASS.

Run: `npm run dev`, open at 800 × 1280, and click through **every** screen
including Games and Table Talk. Nothing should be unstyled and nothing should
cast a shadow. Screens not yet rebuilt will look plain and slightly wrong —
that is the bridge doing its job. **Kill the dev server before finishing.**

- [ ] **Step 7: Commit**

```bash
git add src/styles/tabletot.css src/index.css
git commit -m "refactor: cut three CSS override layers, bridge base onto v1.0 tokens"
```

**Standing rule for every later sprint.** When a task rebuilds a screen, delete
that screen's old rules from the base layer **in the same commit**. The bridge is
scaffolding, not a destination — the difference between this and the accretion
that produced the four-layer mess is that here the deletions are part of the
work, not deferred to a cleanup that never happens.

---

### Task 1.3: Component class checklist

**Files:**
- Modify: `src/styles/tabletot.css`

This task has no test — it is CSS. Its gate is the visual check in Step 2.

- [ ] **Step 1: Confirm every class below exists with all its states**

Every interactive class ships **all six states** — default, hover, pressed,
focus, loading, disabled — before it ships at all.

| Class | States | Geometry |
|---|---|---|
| `.tt-btn--primary` | 6 | h88, radius 18, `--tt-action` fill, white label, Manrope 800/24 |
| `.tt-btn--secondary` | default / pressed / disabled | h88, radius 18, paper fill, 2px line border |
| `.tt-btn--tertiary` | default / pressed | h64, no chrome, `--tt-ink-60` label |
| `.tt-btn--accent` | default / pressed | h64, radius 999, `--tt-action` fill |
| `.tt-iconbtn` | filled / outline / disabled / on-dark | 76 and 64 square, radius 999 |
| `.tt-stepper` | default / at-min / at-limit / disabled | h64, radius 999 |
| `.tt-field` | default / focus / filled / error / disabled | h72, radius 12, **2px border in every state** |
| `.tt-chip` | default / selected / pressed / disabled | h60, radius 12 |
| `.tt-segmented` | 3 segments, one selected | h60 |
| `.tt-dishcard` | with-photo / no-photo / in-cart / sold-out | radius 18, 2px border |
| `.tt-stages` | one of four active | h96 |
| `.tt-toast` | info / success / error / neutral-on-dark | auto-dismiss 4s, undo 8s |
| `.tt-badge` | — | radius 8, Manrope 700/18 uppercase 0.06em |
| `.tt-skeleton` | — | `--tt-line` and `--tt-skeleton-2` bars |

Error-state rule that catches people out: a field in error keeps its **2px**
border weight so the layout does not shift. Do not thicken it to 3px.

- [ ] **Step 2: Visual check**

Run: `npm run dev`

Open `http://localhost:8080/?table=T1` in a browser sized to **800 × 1280**
(Chrome DevTools → Device Toolbar → Responsive → 800 × 1280).

Confirm: no horizontal scrollbar, no visible shadow anywhere, text renders in
Sora and Manrope (not a system fallback — check DevTools → Computed →
`font-family`). Screens will still be laid out wrongly; that is Sprint 2's job.

**Kill the dev server before finishing this task.**

- [ ] **Step 3: Commit**

```bash
git add src/styles/tabletot.css
git commit -m "feat: component library classes with all six interactive states"
```

---

## Sprint 2 — Shell and docked bars

### Task 2.1: AppBar, OrderBar, StatusStrip

**Files:**
- Create: `src/components/AppBar.tsx`
- Create: `src/components/OrderBar.tsx`
- Create: `src/components/StatusStrip.tsx`
- Delete: `src/components/AppHeader.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `ScreenType` from `@/hooks/useDeviceNavigation`
- Produces:
  - `AppBar({ venueName, tableId, onAbout }: { venueName: string; tableId: string; onAbout?: () => void })`
  - `OrderBar({ itemCount, total, roundNumber, disabled, onReview }: { itemCount: number; total: number; roundNumber: number; disabled?: boolean; onReview: () => void })`
  - `StatusStrip({ label, detail, onTap }: { label: string; detail: string; onTap?: () => void })`

- [ ] **Step 1: Write OrderBar**

```tsx
// src/components/OrderBar.tsx
interface OrderBarProps {
  itemCount: number;
  total: number;
  roundNumber: number;
  disabled?: boolean;
  onReview: () => void;
}

// Replaces MiniCartSidebar. The design is a single 800px column, so a right
// rail has nowhere to live — the cart becomes a docked bar above the voice
// dock. flex: none is set in CSS; this component must never grow.
export default function OrderBar({
  itemCount, total, roundNumber, disabled = false, onReview,
}: OrderBarProps) {
  if (itemCount === 0) return null;

  return (
    <div className="tt-orderbar">
      <div className="tt-orderbar-copy">
        <strong>
          {itemCount} item{itemCount === 1 ? "" : "s"} · Round {roundNumber}
        </strong>
        <span>₹{total} · incl. GST at review</span>
      </div>
      <button
        type="button"
        className="tt-btn--primary"
        onClick={onReview}
        disabled={disabled}
      >
        Review order
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write AppBar and StatusStrip**

```tsx
// src/components/AppBar.tsx
import TabletotLogo from "@/components/TabletotLogo";

interface AppBarProps {
  venueName: string;
  tableId: string;
  onAbout?: () => void;
}

export default function AppBar({ venueName, tableId, onAbout }: AppBarProps) {
  return (
    <header className="tt-appbar">
      <div className="tt-appbar-brand">
        <TabletotLogo />
        <span>Tabletot</span>
      </div>
      <button
        type="button"
        className="tt-appbar-venue"
        onClick={onAbout}
        disabled={!onAbout}
      >
        {venueName}
      </button>
      <span className="tt-badge">Table {tableId || "—"}</span>
    </header>
  );
}
```

```tsx
// src/components/StatusStrip.tsx
interface StatusStripProps {
  label: string;
  detail: string;
  onTap?: () => void;
}

// The docked strip that keeps a live round (or a counting-down held round)
// visible from every screen — including the games. A guest who wanders off
// the status screen must never lose sight of what the kitchen is doing.
export default function StatusStrip({ label, detail, onTap }: StatusStripProps) {
  const Tag = onTap ? "button" : "div";
  return (
    <Tag
      className="tt-statusstrip"
      {...(onTap ? { type: "button" as const, onClick: onTap } : {})}
    >
      <span className="tt-statusstrip-label">{label}</span>
      <span className="tt-statusstrip-detail">{detail}</span>
    </Tag>
  );
}
```

- [ ] **Step 3: Rewrite AppShell around them**

```tsx
// src/components/AppShell.tsx
import type { ScreenType } from "@/hooks/useDeviceNavigation";
import AppBar from "./AppBar";

interface AppShellProps {
  children: React.ReactNode;
  currentScreen: ScreenType;
  venueName?: string;
  tableId: string;
  onAbout?: () => void;
  orderBar?: React.ReactNode;
  statusStrip?: React.ReactNode;
  voiceDock?: React.ReactNode;
}

// Screens that own their full canvas and draw no chrome.
const BARE_SCREENS: ScreenType[] = ["idle", "order-confirmation"];

// The invariant for every screen in the product: AppBar (optional) → exactly
// one scroll region → docked bars, bars always flex: none. If a new screen
// needs chrome that is not in this file, it is the wrong shape.
export default function AppShell({
  children,
  currentScreen,
  venueName = "Tabletot",
  tableId,
  onAbout,
  orderBar,
  statusStrip,
  voiceDock,
}: AppShellProps) {
  const bare = BARE_SCREENS.includes(currentScreen);

  return (
    <div className="tt-shell">
      {!bare && <AppBar venueName={venueName} tableId={tableId} onAbout={onAbout} />}
      <main className="tt-scroll">{children}</main>
      {statusStrip}
      {orderBar}
      {voiceDock}
    </div>
  );
}
```

- [ ] **Step 4: Delete the old header and update Index.tsx**

```bash
git rm src/components/AppHeader.tsx
```

In `src/pages/Index.tsx`, replace the `<AppShell>` props at line 601 to pass
`orderBar`, and drop `onNavigate` / `showStatusReturn`. Remove the
`import AppHeader` if TypeScript flags it.

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: PASS. If TypeScript reports unused `onNavigate` on AppShell, you
missed a call site — fix it rather than re-adding the prop.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/components src/pages/Index.tsx
git commit -m "feat: single-column shell with docked AppBar, OrderBar, StatusStrip"
```

---

### Task 2.2: Retire MiniCartSidebar

**Files:**
- Delete: `src/components/MiniCartSidebar.tsx`
- Modify: `src/pages/Index.tsx:508-515`

- [ ] **Step 1: Remove the right rail**

Delete the `<MiniCartSidebar ... />` block at `src/pages/Index.tsx:508-515` and
its import at line 18. Delete the `browse-layout` / `browse-main` wrapper divs
around `MenuView` (lines 430–432 and their closing tags) — the shell now owns
the layout.

```bash
git rm src/components/MiniCartSidebar.tsx
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm test`
Expected: both PASS.

Run: `grep -rn "MiniCartSidebar\|browse-layout\|browse-main" src/`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: drop the two-pane browse rail for the docked OrderBar"
```

---

### Task 2.3: Attract and Confirmation

**Files:**
- Modify: `src/components/screens/IdleScreen.tsx`
- Modify: `src/components/screens/ConfirmationView.tsx`
- Modify: `src/styles/tabletot.css`

Both files are tiny — 531 and 871 bytes, 14 classes between them — and Attract is
the first thing anyone sees when they walk up to the tablet. Deferring them buys
nothing.

- [ ] **Step 1: Restyle Attract**

Screen 01 is the venue lockup, one line of orientation, and two ways in. **No
promotional content of any kind** — the handoff is explicit that a guest who has
not ordered is never shown a promotion.

Replace the hardcoded `SILVER` / `SPECIALTY COFFEE` lockup with `venueName` from
`useRestaurant()`; the pilot venue's name does not belong compiled into shared
kiosk code. Keep the whole surface a single full-bleed button — the design is
"touch anywhere to start", so there is no target to miss.

- [ ] **Step 2: Restyle Confirmation**

Keep the 5-second `setTimeout(onReset, 5000)` and the `onReset` prop exactly as
they are. Restyle to the token set only.

- [ ] **Step 3: Delete the old rules from the base layer**

Per the standing rule in Task 1.2, remove the `.idle-attract-screen`,
`.idle-attract-lockup`, `.idle-tabletot-logo`, `.confirmation-*` and
`.order-boot-*` rules from the base layer in this commit.

- [ ] **Step 4: Verify**

Run: `npm run build && npm test`
Expected: both PASS.

Run: `grep -c "idle-attract\|confirmation-panel" src/styles/tabletot.css`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add src/components/screens/IdleScreen.tsx src/components/screens/ConfirmationView.tsx src/styles/tabletot.css
git commit -m "feat: Attract and Confirmation on the v1.0 token set"
```

---

## Sprint 3 — Browse and Detail (AOV-critical)

**Read this before starting.** `DishCard`'s pairing panel is the single highest-value
AOV surface in the product. Its event logic — the `shownPairingIds` ref, the
`recommendation_shown` effect, `handleAddPairing` — is correct and subtle. **Change
its markup and classes. Do not change its logic.** Task 0.1's test is the gate.

### Task 3.1: DishCard geometry

**Files:**
- Modify: `src/components/DishCard.tsx`

**Interfaces:**
- Consumes: unchanged `DishCardProps`
- Produces: unchanged behaviour, new markup

- [ ] **Step 1: Restyle the card**

Change only the JSX class names and structure. Specifically:

- `.dish-card` → `.tt-dishcard`, `.dish-media` → `.tt-dishcard-media`,
  `.dish-body` → `.tt-dishcard-body`, `.dish-meta` → `.tt-dishcard-meta`
- `.chip-action` → `.tt-btn--accent`
- `.card-stepper` → `.tt-stepper`
- `.card-pairing-panel` → `.tt-pairing-panel`, `.pairing-chip` → `.tt-pairing-row`,
  `.pairing-add` → `.tt-btn--accent`
- The eyebrow becomes `GOES WELL WITH` (uppercase, `.tt-badge`), replacing the
  current "Pairs well with" / "Complete your order" pair. One line, not two.
- Keep `aria-label={`Add ${paired.name} — ₹${paired.price}`}` **exactly as is** —
  Task 0.1 queries the pairing button by that accessible name.

Do not touch lines 45–72 (the ref, the effect, `handleAddPairing`).

- [ ] **Step 2: Run the AOV guard**

Run: `npm test -- aov-attribution`
Expected: PASS, all six cases. If the "fires recommendation_tapped" case fails,
you changed the `aria-label` or moved the `handleAddPairing` call — revert that.

- [ ] **Step 3: Commit**

```bash
git add src/components/DishCard.tsx
git commit -m "feat: DishCard on the v1.0 card geometry, pairing logic untouched"
```

---

### Task 3.2: MenuView single column with real states

**Files:**
- Modify: `src/components/screens/MenuView.tsx`
- Modify: `src/lib/menuStore.tsx:61`

**Interfaces:**
- Consumes: `useMenu()` — now also returns `description` on each `MenuItem`
- Produces: unchanged `MenuViewProps`

- [ ] **Step 1: Select the description that already exists in the database**

`menu_items.description` is a real column that the kiosk has never read, which
is why `DetailView` fabricates prose. Add it to the select at
`src/lib/menuStore.tsx:61`:

```ts
        supabase
          .from('menu_items')
          .select('id, name, category, price, tags, is_veg, image_url, description')
```

and to the mapping at line 95:

```ts
      const mapped: MenuItem[] = (menuRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? '',
        price: row.price ?? 0,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        is_veg: (row as any).is_veg ?? false,
        description: row.description ?? undefined,
        image: row.image_url ?? undefined,
      })).map(hydrateMenuItemImage);
```

Add the field to the interface in `src/data/menu.ts`:

```ts
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  tags: string[];
  is_veg: boolean;
  description?: string;
  image?: string;
}
```

- [ ] **Step 2: Rebuild the three non-happy states**

Replace the `loading` block (lines 46–55) with a skeleton, not a spinner — the
handoff is explicit that a bare spinner is never used:

```tsx
  if (loading) {
    return (
      <section className="tt-menu">
        <p className="tt-badge">Loading today's menu…</p>
        <div className="tt-skeleton-list" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tt-skeleton tt-skeleton--card" />
          ))}
        </div>
      </section>
    );
  }
```

Replace the `error` block (lines 57–67) with the Connection Error content
(screen 15):

```tsx
  if (error) {
    return (
      <section className="tt-menu tt-menu--centred">
        <h1>We've lost the kitchen for a moment</h1>
        <p>
          Your table's order is safe and the counter can see it. Live status will
          come back on its own — or ask a member of staff.
        </p>
        <button type="button" className="tt-btn--primary" onClick={retry}>
          Try again
        </button>
      </section>
    );
  }
```

Replace the inline empty state (lines 116–119) with screen 04's copy. It must
never render an empty list:

```tsx
            {filteredItems.length === 0 ? (
              <div className="tt-empty">
                <h2>Nothing matches that filter</h2>
                <p>Turn the filter off to see everything in {resolvedCategory}.</p>
                <button
                  type="button"
                  className="tt-btn--secondary"
                  onClick={() => setDiet("all")}
                >
                  Show all {resolvedCategory}
                </button>
              </div>
            ) : (
```

- [ ] **Step 3: One column**

Change `.menu-product-grid` to `.tt-dish-list` in the JSX, and confirm the CSS
rule for `.tt-dish-list` is `display: flex; flex-direction: column; gap: var(--tt-space-3);`
with **no** `grid-template-columns`.

Rename `.menu-cat-pill` → `.tt-chip`, `.diet-pill` → `.tt-segmented-option`.

- [ ] **Step 4: Verify**

Run: `npm test -- aov-attribution`
Expected: PASS. The MenuView wiring case proves the pairing Add still passes
`"pairing_chip"` through the new markup.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/screens/MenuView.tsx src/lib/menuStore.tsx src/data/menu.ts
git commit -m "feat: single-column MenuView with skeleton, empty and error states"
```

---

### Task 3.3: DetailView as a full-screen push

**Files:**
- Modify: `src/components/screens/DetailView.tsx`
- Modify: `src/pages/Index.tsx:468-503`

- [ ] **Step 1: Fix the pairing attribution bug while you are in here**

`DetailView`'s pairing stepper calls `onUpdateQuantity?.(p.id, 1)` with two
arguments (lines 164 and 192). `Index.tsx`'s `handleUpdateQuantity` defaults the
third parameter to `"main_menu"`, so **incrementing an already-added pairing from
the detail view is currently attributed to the main menu and is invisible to
`direct_revenue`.** `DishCard` gets this right; `DetailView` does not.

Widen the prop type and pass the source:

```tsx
  onUpdateQuantity?: (itemId: string, delta: number, source?: Source) => void;
```

```tsx
                          <button type="button" onClick={() => onUpdateQuantity?.(p.id, -1, "pairing_chip")} aria-label={`Decrease ${p.name}`}>
```
```tsx
                          <button type="button" onClick={() => onUpdateQuantity?.(p.id, 1, "pairing_chip")} aria-label={`Increase ${p.name}`}>
```

Add `import type { Source } from "@/lib/eventBus";` at the top. Leave the stepper
for the **main** item (lines 191–199) on the default source — that one really is
a main-menu add.

- [ ] **Step 2: Use the real description**

Delete `dishType()` and `productDescription()` (lines 28–44). They generate
filler prose like *"Avocado Toast is prepared as a vegetarian beverage with a
focused cafe profile"* and show it to paying customers. Replace the usage at
line 110:

```tsx
            {item.description && (
              <p className="tt-detail-copy">{item.description}</p>
            )}
```

Remove the "Type" fact tile (lines 124–127) — it was the only other caller of
`dishType`.

- [ ] **Step 3: Convert from modal to push**

In `src/pages/Index.tsx`, replace the `AnimatePresence` modal wrapper at lines
468–503 with a plain screen case. Add to the switch, before `case "menu"`:

```tsx
      case "item-detail":
        return selectedItem ? (
          <DetailView
            item={selectedItem}
            pairings={getDetailPairings(selectedItem)}
            onAdd={handleAddFromDetail}
            onAddItem={(i) => handleAddToOrder(i, "pairing_chip")}
            onUpdateQuantity={handleUpdateQuantity}
            getQuantity={getOrderQuantity}
            onBack={() => setCurrentScreen("menu")}
            onSelectPairing={handleSelectItem}
          />
        ) : null;
```

and remove `"item-detail"` from the combined `case "menu": case "item-detail":`
at line 427. Drop `onOpenVoice` for now — voice is Sprint 7.

In `DetailView`, change `.detail-layout` (a two-column split) to `.tt-detail`,
a single column: hero image 800 × 360, then title, then chips, then pairings,
then a docked footer with the price and CTA.

- [ ] **Step 4: Verify**

Run: `npm test -- aov-attribution && npm run build`
Expected: both PASS.

Run: `grep -n "productDescription\|dishType" src/`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/screens/DetailView.tsx src/pages/Index.tsx
git commit -m "feat: DetailView as full-screen push; real descriptions; fix pairing attribution"
```

---

## Sprint 4 — Review, the 2-minute hold, and Sent

**The rule, in one sentence:** pressing "Send to kitchen" does **not** call
`submitOrder`. It starts a 2-minute countdown. `submitOrder` runs when the
countdown expires or when the guest presses "Send now".

Nothing is written to the ledger during the hold. A cancelled round therefore
never existed, which is exactly why `direct_revenue` stays correct without any
migration.

### Task 4.1: The pendingRound module

**Files:**
- Create: `src/lib/pendingRound.ts`
- Create: `src/lib/__tests__/pendingRound.test.ts`

**Interfaces:**
- Produces:
  - `HOLD_DURATION_MS: number` (120_000)
  - `type PendingRound = { items: OrderItem[]; deadline: number }`
  - `savePendingRound(round: PendingRound): void`
  - `loadPendingRound(): PendingRound | null`
  - `clearPendingRound(): void`
  - `isExpired(round: PendingRound, now?: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/pendingRound.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  HOLD_DURATION_MS,
  savePendingRound,
  loadPendingRound,
  clearPendingRound,
  isExpired,
} from "@/lib/pendingRound";
import type { OrderItem } from "@/data/menu";

const items: OrderItem[] = [
  { id: "i1", name: "Avocado Toast", price: 390, quantity: 1, category: "Breakfast", tags: [], is_veg: true },
];

describe("pendingRound", () => {
  beforeEach(() => sessionStorage.clear());

  it("holds for two minutes", () => {
    expect(HOLD_DURATION_MS).toBe(120_000);
  });

  it("returns null when nothing is held", () => {
    expect(loadPendingRound()).toBeNull();
  });

  it("round-trips a held round through sessionStorage", () => {
    const deadline = Date.now() + HOLD_DURATION_MS;
    savePendingRound({ items, deadline });
    expect(loadPendingRound()).toEqual({ items, deadline });
  });

  it("clears", () => {
    savePendingRound({ items, deadline: Date.now() + HOLD_DURATION_MS });
    clearPendingRound();
    expect(loadPendingRound()).toBeNull();
  });

  it("reports a passed deadline as expired", () => {
    const now = 1_000_000;
    expect(isExpired({ items, deadline: now - 1 }, now)).toBe(true);
    expect(isExpired({ items, deadline: now + 1 }, now)).toBe(false);
  });

  // A kiosk that reboots mid-hold must not resurrect a corrupt round and
  // submit garbage to the kitchen. Bad JSON is treated as no round at all.
  it("survives corrupt storage without throwing", () => {
    sessionStorage.setItem("tt_pending_round", "{not json");
    expect(loadPendingRound()).toBeNull();
  });

  it("rejects a stored value that is missing its items array", () => {
    sessionStorage.setItem("tt_pending_round", JSON.stringify({ deadline: 1 }));
    expect(loadPendingRound()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- pendingRound`
Expected: FAIL — `Failed to resolve import "@/lib/pendingRound"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/pendingRound.ts
import type { OrderItem } from "@/data/menu";

// A submitted round is held on the device for two minutes before it reaches
// the kitchen, so the guest can still change their mind. Nothing is written to
// the ledger during the hold: a cancelled round never existed, which keeps
// get_aov_summary's direct_revenue correct with no server-side work.
//
// ponytail: sessionStorage, not the ledger. The exposure is two minutes with
// the guest sitting in front of a visible countdown — a reboot in that window
// is recoverable and obvious. If the hold ever grows past ~5 minutes, move it
// server-side behind a held-KOT flag instead.
export const HOLD_DURATION_MS = 120_000;

const KEY = "tt_pending_round";

export type PendingRound = { items: OrderItem[]; deadline: number };

export function savePendingRound(round: PendingRound): void {
  sessionStorage.setItem(KEY, JSON.stringify(round));
}

export function loadPendingRound(): PendingRound | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" || parsed === null ||
      !Array.isArray((parsed as PendingRound).items) ||
      typeof (parsed as PendingRound).deadline !== "number"
    ) {
      return null;
    }
    return parsed as PendingRound;
  } catch {
    return null;
  }
}

export function clearPendingRound(): void {
  sessionStorage.removeItem(KEY);
}

export function isExpired(round: PendingRound, now: number = Date.now()): boolean {
  return round.deadline <= now;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- pendingRound`
Expected: PASS, seven cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pendingRound.ts src/lib/__tests__/pendingRound.test.ts
git commit -m "feat: pendingRound persistence for the 2-minute kitchen hold"
```

---

### Task 4.2: The useRoundHold hook

**Files:**
- Create: `src/hooks/useRoundHold.ts`

**Interfaces:**
- Consumes: `pendingRound` module from Task 4.1
- Produces: `useRoundHold(onExpire: (items: OrderItem[]) => void)` returning
  `{ heldItems, secondsLeft, isHolding, startHold, extendHold, cancelHold, sendNow }`

- [ ] **Step 1: Implement**

```ts
// src/hooks/useRoundHold.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderItem } from "@/data/menu";
import {
  HOLD_DURATION_MS,
  savePendingRound,
  loadPendingRound,
  clearPendingRound,
  isExpired,
  type PendingRound,
} from "@/lib/pendingRound";

export function useRoundHold(onExpire: (items: OrderItem[]) => void) {
  const [held, setHeld] = useState<PendingRound | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Held in a ref so the one-second tick below never needs to re-subscribe
  // when the caller passes a fresh closure.
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  // Restore across a reload. If the deadline already passed while the device
  // was off, send immediately rather than discarding: the guest pressed Send
  // and is expecting food, so the safe failure is a late round, not a lost one.
  useEffect(() => {
    const stored = loadPendingRound();
    if (!stored) return;
    if (isExpired(stored)) {
      clearPendingRound();
      onExpireRef.current(stored.items);
      return;
    }
    setHeld(stored);
  }, []);

  useEffect(() => {
    if (!held) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = held.deadline - Date.now();
      if (remaining <= 0) {
        clearPendingRound();
        setHeld(null);
        onExpireRef.current(held.items);
        return;
      }
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [held]);

  const startHold = useCallback((items: OrderItem[]) => {
    const round = { items, deadline: Date.now() + HOLD_DURATION_MS };
    savePendingRound(round);
    setHeld(round);
  }, []);

  // Adding an item during the hold restarts the clock — otherwise an item
  // added at 1:58 would reach the kitchen two seconds later, on its own.
  const extendHold = useCallback((items: OrderItem[]) => {
    setHeld((prev) => {
      if (!prev) return prev;
      const round = { items, deadline: Date.now() + HOLD_DURATION_MS };
      savePendingRound(round);
      return round;
    });
  }, []);

  const cancelHold = useCallback(() => {
    clearPendingRound();
    setHeld(null);
  }, []);

  const sendNow = useCallback(() => {
    if (!held) return;
    clearPendingRound();
    setHeld(null);
    onExpireRef.current(held.items);
  }, [held]);

  return {
    heldItems: held?.items ?? null,
    secondsLeft,
    isHolding: held !== null,
    startHold,
    extendHold,
    cancelHold,
    sendNow,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm test`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRoundHold.ts
git commit -m "feat: useRoundHold — countdown, reload recovery, extend on add"
```

---

### Task 4.3: SentView, CancelConfirm, and the CartView rebuild

**Files:**
- Create: `src/components/screens/SentView.tsx`
- Create: `src/components/screens/CancelConfirm.tsx`
- Modify: `src/components/screens/CartView.tsx`
- Modify: `src/hooks/useDeviceNavigation.ts:7-19`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Add the screen type**

In `src/hooks/useDeviceNavigation.ts`, add `"sent"` to the `ScreenType` union
after `"order-summary"`.

- [ ] **Step 2: Write SentView**

Copy is load-bearing here. Frame the countdown as reassurance, not a deadline —
*"Going to the kitchen in 1:47"*, never *"1:47 left to cancel"*.

```tsx
// src/components/screens/SentView.tsx
import type { OrderItem } from "@/data/menu";
import { computeTotals } from "@/lib/pricing";

interface SentViewProps {
  items: OrderItem[];
  roundNumber: number;
  secondsLeft: number;
  onEdit: () => void;
  onCancel: () => void;
  onSendNow: () => void;
  onOrderMore: () => void;
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SentView({
  items, roundNumber, secondsLeft, onEdit, onCancel, onSendNow, onOrderMore,
}: SentViewProps) {
  const subtotalRaw = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const { total } = computeTotals(subtotalRaw);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <section className="tt-sent">
      <p className="tt-badge">Round {roundNumber}</p>
      <h1>Going to the kitchen in {mmss(secondsLeft)}</h1>
      <p className="tt-sent-sub">
        {count} item{count === 1 ? "" : "s"} · ₹{total.toFixed(0)} · added to your table bill
      </p>
      <p className="tt-sent-note">
        You can still change this round. After that it's on the pass.
      </p>

      <div className="tt-sent-actions">
        <button type="button" className="tt-btn--primary" onClick={onSendNow}>
          Send now
        </button>
        <button type="button" className="tt-btn--secondary" onClick={onEdit}>
          Edit round
        </button>
        <button type="button" className="tt-btn--tertiary" onClick={onCancel}>
          Cancel round
        </button>
      </div>

      <button type="button" className="tt-btn--tertiary" onClick={onOrderMore}>
        Order more
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Write CancelConfirm**

The second paragraph is the most important sentence in the flow. A guest who
thinks Cancel might kill food already cooking will never press it.

```tsx
// src/components/screens/CancelConfirm.tsx
interface CancelConfirmProps {
  itemCount: number;
  hasCookingRounds: boolean;
  onKeep: () => void;
  onCancel: () => void;
}

export default function CancelConfirm({
  itemCount, hasCookingRounds, onKeep, onCancel,
}: CancelConfirmProps) {
  return (
    <div className="tt-modal-scrim" role="dialog" aria-modal="true" onClick={onKeep}>
      <div className="tt-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cancel this round?</h2>
        <p>
          Your {itemCount} item{itemCount === 1 ? "" : "s"} will be removed.
          {hasCookingRounds && " Your earlier round is already cooking and is not affected."}
        </p>
        <div className="tt-modal-actions">
          <button type="button" className="tt-btn--primary" onClick={onKeep}>
            Keep it
          </button>
          <button type="button" className="tt-btn--secondary" onClick={onCancel}>
            Cancel round
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rebuild CartView as one column**

Delete the `split-layout` wrapper and the `summary-panel` aside (lines 36 and
99–131). The new order is: heading → this round's lines → already-sent rounds →
name field → totals → docked actions. Class renames: `.order-row` → `.tt-cart-row`,
`.stepper` → `.tt-stepper`, `.primary-btn` → `.tt-btn--primary`,
`.secondary-btn` → `.tt-btn--secondary`.

Change the "Already sent" block (lines 82–95) to group by round with its status,
and change the CTA label from `"Confirm Order"` to `"Send to kitchen"`.

Delete the hardcoded marketing sentence at lines 116–119 — *"Breakfast plates,
coffees, and desserts can all be added together for a smooth cafe order flow."*
It is filler on the highest-intent screen in the product.

- [ ] **Step 5: Wire the hold into Index.tsx**

In `src/pages/Index.tsx`:

```tsx
import { useRoundHold } from "@/hooks/useRoundHold";
import SentView from "@/components/screens/SentView";
import CancelConfirm from "@/components/screens/CancelConfirm";
```

Add near the other hooks:

```tsx
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // The hold's expiry is the ONLY path that reaches submitOrder. Pressing
  // "Send to kitchen" starts the countdown; it does not submit.
  const hold = useRoundHold(
    useCallback(async () => {
      try {
        await confirmOrder();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast(`Order could not be sent: ${msg}`);
        setCurrentScreen("order-summary");
      }
    }, [confirmOrder, setCurrentScreen]),
  );
```

Replace the body of `handleConfirmOrder` (lines 342–366) so that after the
completion-nudge check it starts the hold instead of awaiting `confirmOrder`:

```tsx
      await wait(1150);
      hold.startHold(order);
      setCurrentScreen("sent");
```

Keep the `promptForIdentity` guard and the `findMatchingRule` block above it
**exactly as they are** — the completion nudge must still fire before the round
is committed, or you lose the `completion_nudge` half of `direct_revenue`.

In `handleCompletionSkip` (lines 323–335), make the same substitution: replace
`await confirmOrder()` with `hold.startHold(order); setCurrentScreen("sent");`.

Add the screen cases:

```tsx
      case "sent":
        return (
          <SentView
            items={hold.heldItems ?? order}
            roundNumber={previousOrders.length + 1}
            secondsLeft={hold.secondsLeft}
            onEdit={() => { hold.cancelHold(); setCurrentScreen("order-summary"); }}
            onCancel={() => setCancelConfirmOpen(true)}
            onSendNow={hold.sendNow}
            onOrderMore={() => setCurrentScreen("menu")}
          />
        );
```

Render `CancelConfirm` alongside the toast at the bottom of the shell:

```tsx
        {cancelConfirmOpen && (
          <CancelConfirm
            itemCount={order.reduce((s, o) => s + o.quantity, 0)}
            hasCookingRounds={previousOrders.length > 0}
            onKeep={() => setCancelConfirmOpen(false)}
            onCancel={() => {
              hold.cancelHold();
              setOrder([]);
              setCancelConfirmOpen(false);
              setCurrentScreen(previousOrders.length > 0 ? "session-idle" : "menu");
            }}
          />
        )}
```

Add `setOrder` to the `useDeviceNavigation()` destructure at line 57 — the hook
already returns it.

Pass a StatusStrip whenever a hold is running so the countdown follows the guest
off this screen:

```tsx
      statusStrip={
        hold.isHolding && currentScreen !== "sent" ? (
          <StatusStrip
            label={`Round ${previousOrders.length + 1} → kitchen`}
            detail={`${hold.secondsLeft}s · tap to change`}
            onTap={() => setCurrentScreen("sent")}
          />
        ) : null
      }
```

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: PASS, including both guards.

Run: `npm run build`
Expected: PASS.

Run: `npm run dev`, then at 800 × 1280: add an item, Review, Send to kitchen.
Confirm the countdown starts at 2:00, that navigating to the menu keeps the
StatusStrip visible, and that after 2 minutes the round submits and the app
lands on the status screen. Then repeat and press Cancel round — confirm nothing
appears in the POS.

**Kill the dev server before finishing this task.**

- [ ] **Step 7: Commit**

```bash
git add -A src/components src/hooks src/pages
git commit -m "feat: 2-minute kitchen hold with Sent screen and cancel confirm"
```

---

## Sprint 5 — Status and Bill

### Task 5.1: Table Status

**Files:**
- Modify: `src/components/screens/WaitingView.tsx`

- [ ] **Step 1: Rename the final stage and render four discrete stages**

At line 24, change the `served` label from `"Done"` to `"Served"` to match the
handoff. Replace the percentage progress bar (lines 195–203) with the four-stage
strip — Queued · Cooking · Plating · Served — using `.tt-stages` with the active
one filled. Delete the `pct` field from `STATUS_STAGE`; it has no remaining
caller once the bar is gone.

- [ ] **Step 2: Move the promos into restaurant config**

Replace the hardcoded `PROMOS` array (lines 36–55) with a read from
`useRestaurant()`. Add to `src/lib/restaurantContext.tsx` alongside the existing
`voice_enabled` / `prompt_for_identity` reads:

```tsx
          if (Array.isArray(cfg.promos)) {
            setPromos(cfg.promos as Promo[]);
          }
```

with `type Promo = { id: string; title: string; copy: string }` exported from
the same file, and `promos: Promo[]` (default `[]`) on `RestaurantCtx`.

When `promos` is empty the slot renders nothing — the handoff is explicit that
with no active promo the kiosk stays on the status screen. Keep the
`categoryGradient` fallback for the media area; there are still no real creative
assets.

- [ ] **Step 3: Restyle the action rows**

`.idle-cta-row` → `.tt-status-actions`, one column, 64px rows: Order another
round · Games · Table talk · Water · Bill. Keep every existing handler wired
exactly as it is — `onRequestWater` in particular already has correct error
handling that must not be simplified away.

- [ ] **Step 4: Verify**

Run: `npm run build && npm test`
Expected: both PASS.

Run: `grep -n "pct" src/components/screens/WaitingView.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/screens/WaitingView.tsx src/lib/restaurantContext.tsx
git commit -m "feat: four-stage Table Status, promos from restaurant config"
```

---

### Task 5.2: Bill

**Files:**
- Modify: `src/components/screens/BillView.tsx`

- [ ] **Step 1: Remove the duplicated tax rate**

`BillView.tsx:8` declares its own `const TAX_RATE = 0.05` while
`src/lib/pricing.ts` already exports one. Two sources for the same number is how
a bill and a cart end up disagreeing. Delete the local constant and use the
shared helper:

```tsx
import { computeTotals } from "@/lib/pricing";
```
```tsx
  const { subtotal, tax, total } = computeTotals(sessionTotal);
```

- [ ] **Step 2: Group the bill by round**

Render `previousOrders` as `ROUND n · <STATUS>` sections with their lines
beneath, then subtotal / GST / total. Restyle to `.tt-bill-*` classes.

Leave the phone validation logic untouched — the `/^[6-9]\d{9}$/` check with the
`+91` strip at lines 42–47 is correct for the Indian numbering plan and was
fixed deliberately. Only restyle the field to `.tt-field` with the error message
below it at 17px/700 in `--tt-action`.

- [ ] **Step 3: Delete the bill rules from the stylesheet**

Per the standing rule in Task 1.2, remove `.bill-view`, `.bill-flow-*` and
`.bill-phone-*`. The `.bill-flow-*` and `.bill-phone-*` families were explicitly
preserved through the Task 1.2 cut for this moment.

- [ ] **Step 4: Verify**

Run: `npm run build && npm test`
Expected: both PASS.

Run: `grep -n "TAX_RATE" src/components/screens/BillView.tsx`
Expected: no output.

Run: `grep -c "bill-phone\|bill-flow" src/styles/tabletot.css`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add src/components/screens/BillView.tsx src/styles/tabletot.css
git commit -m "feat: round-grouped Bill on the shared tax helper"
```

---

## Sprint 6 — Full scope: secondary screens

**Simple scope ends at Sprint 5.** Ship that, put it on the tablet, get client
sign-off, then come back here. Everything in Sprints 6 and 7 is off the ordering
path — the client forms their opinion on Browse, Detail, Review and Status.

Until these land, the screens below run on the Task 1.2 bridge: on-palette and
laid out, but not redesigned.

### Task 6.1: Venue / About

**Files:**
- Create: `src/components/screens/AboutView.tsx`
- Modify: `src/pages/Index.tsx`, `src/hooks/useDeviceNavigation.ts`

- [ ] **Step 1: Build it from restaurant config**

Add `"about"` to `ScreenType`. Read `hours`, `chef_note`, `chef_name`,
`wifi_ssid` from `restaurants.config` via `useRestaurant()` — same pattern as
`promos` in Task 5.1. No migration; `config` is already `Json`. Reach it from
the AppBar's venue button (`onAbout`), which Task 2.1 already wired.

- [ ] **Step 2: Verify and commit**

Run: `npm run build && npm test` → both PASS.

```bash
git add -A src
git commit -m "feat: Venue/About screen from restaurant config"
```

### Task 6.2: Activities Hub, Games and Table Talk

**Files:**
- Modify: `src/components/screens/GamesView.tsx`,
  `src/components/screens/ConversationStartersView.tsx`
- Modify: `src/styles/tabletot.css`

This is the largest remaining chunk of the bridge — 62 of the 94 bridged
classes live in these two files.

- [ ] **Step 1: Restyle only**

Both files are self-contained and behind a button. Apply the token set to their
chrome and add a `StatusStrip` at the base so a waiting guest can still see the
kitchen stage. **Do not restructure the game logic** — `GamesView` is 737 lines
of working board state with no test coverage, so a refactor here is a bet you
cannot verify.

- [ ] **Step 2: Delete their rules from the base layer**

Per the standing rule in Task 1.2, the old `.game-*`, `.starter-*` and related
rules come out in this commit — including `.classic-ludo-*` and
`.classic-dice-face`, the two families explicitly preserved through the Task 1.2
cut because the tail block held their only definition.

- [ ] **Step 3: Verify and commit**

Run: `npm run build && npm test` → both PASS.

Run: `npm run dev` and play one full game of Connect Four and one Table Talk
deck. Board state and turn handling must be untouched.
**Kill the dev server before finishing.**

```bash
git add src/components/screens/GamesView.tsx src/components/screens/ConversationStartersView.tsx src/styles/tabletot.css
git commit -m "feat: activities screens on the v1.0 token set"
```

---

## Sprint 7 — Voice (deferred)

**Do not start this until touch is validated on the physical tablet and signed
off.** The voice pipeline is frozen per `CLAUDE.md`. This sprint restyles the
UI shell only.

**Never touch:** `src/lib/voice/sttClient.ts`, `src/lib/voice/ttsClient.ts`,
`src/lib/voice/api.ts`, `src/lib/voice/types.ts`, or `handleVoiceDone` in
`Index.tsx:225-307` (its three-sweep cart reconciliation is load-bearing and
was hard-won).

**In scope:** `VoiceOrderButton` dock geometry and the six dock states;
`VoiceConversationPanel` restyled to the answer-card shapes for screens 07
(recommendation, with dish cards) and 08 (informational, **text only, no cards**).

Write this sprint's detailed tasks after Sprint 5 ships, when the touch surfaces
are settled. Task 7.0 below is the exception — it is the end of the whole plan
and its criteria are known now.

### Task 7.0: Tear down the bridge

Runs **last**, after the voice screens are rebuilt. This is what stops the
Task 1.2 bridge from becoming the fifth stacked layer.

- [ ] **Step 1: Confirm nothing outside the new system is still defined**

Read the stylesheet, not the components — the CSS side is unambiguous, whereas
scanning `className` strings drowns in Tailwind utilities.

```bash
grep -oE '^\.[a-z][a-z0-9-]*' src/styles/tabletot.css | sort -u | grep -v '^\.tt-'
```
Expected: no output. Every top-level class rule left in the file is a `.tt-`
class. If a legacy name is still defined, find the sprint that was supposed to
delete it and finish that task first.

- [ ] **Step 2: Delete the base layer and the bridge**

Remove everything above the `.tt-` section — the bridged `:root`, the `body`
override, and all remaining base rules. Keep the two `@font-face` blocks; move
them to the top of what remains.

- [ ] **Step 3: Verify the end state**

Run:
```bash
grep -c "box-shadow\|backdrop-filter" src/styles/tabletot.css   # expect 0
grep -nE "#[0-9A-Fa-f]{3,6}" src/styles/tabletot.css | grep -v "@font-face"
```
Expected: `0`, then no output. Every colour now comes from `tokens.css`.

Run: `npm run build && npm test` → both PASS.

Run: `npm run dev` and walk all 19 screens at 800 × 1280.
**Kill the dev server before finishing.**

- [ ] **Step 4: Commit**

```bash
git add src/styles/tabletot.css
git commit -m "refactor: delete the bridge — kiosk is fully on the v1.0 token system"
```

---

## Self-Review

**Scope split.** Simple = Sprints 0–5 (Tasks 0.1 → 5.2). Full = plus Sprints 6
and 7. Screens not yet rebuilt run on the Task 1.2 bridge, so no intermediate
state is ever visibly broken.

**Spec coverage.** Screens 01–19 of the handoff map to: 01 Task 2.3 · 02 Tasks
3.1–3.2 · 03/04 Task 3.2 · 05 Task 3.3 · 06–08 Sprint 7 · 09 Task 4.3 · 10 Task
4.3 · 11 Task 4.3 · 12 folded into 13 per Task 5.1 (the handoff permits this when
no promo is active) · 13 Task 5.1 · 14 Task 5.2 · 15 Task 3.2 · 16 Task 6.1 ·
17–19 Task 6.2. Confirmation (not numbered in the handoff) Task 2.3. Tokens,
type, geometry, motion: Tasks 1.1–1.3. Responsive: Task 1.1. Form validation:
Tasks 4.3 and 5.2. CSS end state: Task 7.0.

**Deliberately unimplemented, with reasons stated in Global Constraints:**
minor-unit money, modifier groups, allergens/calories/macros, stock limits,
landscape, split bill.

**Known deviations from the handoff:** the completion nudge is retained
(handoff omits it; `direct_revenue` needs it) and screen 12 is folded into 13.

---

## Manual Steps — for Rohan

Everything below is outside what the agent should do. In rough order.

**Before Sprint 0**

1. **Create the Sentry project.** sentry.io → new project → React. Copy the DSN.
2. **Add the DSN locally:** append `VITE_SENTRY_DSN=https://…` to
   `apps/kiosk/.env.local`.
3. **Add it on Railway:** kiosk service → Variables → `VITE_SENTRY_DSN`. It is a
   build-time `VITE_` var, so the service needs a redeploy to pick it up.

**Before Sprint 1**

4. **Check the font weights.** `apps/kiosk/public/fonts/` already has
   `Sora.woff2` (variable 500–800) and `Manrope.woff2` (variable 400–800), which
   covers everything the design asks for. Nothing to download unless
   `npm run dev` shows a fallback face in DevTools → Computed → `font-family`.

**During Sprint 5**

5. **Write the promo and venue config.** Task 5.1 and Task 6.1 read from
   `restaurants.config`. In Supabase Studio, update the row for
   `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91`:

```json
{
  "voice_enabled": true,
  "prompt_for_identity": false,
  "promos": [
    { "id": "beans", "title": "Beans to take home", "copy": "Ethiopia Guji · 250g · ₹850" }
  ],
  "hours": ["Mon–Thu 8:00 — 22:00", "Fri–Sat 8:00 — 23:30", "Sunday 9:00 — 21:00"],
  "chef_note": "We roast on Tuesdays and bake every morning at six.",
  "chef_name": "Anu Rao",
  "wifi_ssid": "SILVER-GUEST"
}
```

Keep the existing keys — replacing the whole object would turn voice off.

6. **Seed the menu descriptions.** Task 3.2 makes the kiosk read
   `menu_items.description`, which is currently unused and likely null for most
   rows. Until you fill it in, dish detail will show no description at all —
   which is better than the fabricated prose it replaces, but not by much.

**After Sprint 5**

7. **Deploy to Railway and test on the Lenovo Tab K9.** Per `CLAUDE.md` I don't
   run deploys — the command is `git push` to the branch Railway watches.
8. **Confirm the portrait lock at the OS level.** The design has no landscape
   path at all. If Android lets the tablet rotate, the layout will not reflow —
   it will just be wrong.
9. **Watch Sentry for the first service.** A real service is the first time the
   redesign meets fast, careless, greasy-fingered taps.
10. **Show the client.** Sprints 0–5 are the whole visual story; decide on
    Sprint 6 after they have seen it.

**Docs to update once it ships**

11. `docs/design-system.md` describes the old "Warm Espresso" palette and the
    two-pane layouts. It will be actively misleading. Supersede it.
12. `docs/kiosk-visual-design-current.md` — same.
13. Write an ADR for the 2-minute client-side hold. It is a real architectural
    decision (kitchen latency traded for cancellability, deliberately kept off
    the ledger to protect `direct_revenue`) and the reasoning should outlive
    this conversation.

**Not needed, on purpose**

- No Supabase migration.
- No POS or dashboard change.
- No `order-engine` change.
- No Mixpanel. `kiosk_events` already accepts arbitrary `event_type` +
  `payload` with no CHECK constraint, so UX funnels cost nothing today.
  Revisit after the pilot, once the screens have stopped moving.
