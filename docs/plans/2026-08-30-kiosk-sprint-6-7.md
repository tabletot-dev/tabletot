# Kiosk v1.0 — Sprints 6–7 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> Execute one task at a time, in order. Every task ends with a passing test run
> and a commit. Do not start Task N+1 until Task N is committed and green.
> REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (fresh subagent
> per task) or `superpowers:executing-plans` (inline, batched with checkpoints).

**Goal:** Finish the kiosk v1.0 redesign — rebuild the last three unrebuilt
surfaces (Venue/About, Activities, Voice UI shell) on the `.tt-*` token system,
then delete the temporary CSS bridge so no "Warm Espresso" styling remains.

**Architecture:** Sprints 0–5 replaced the accreted stylesheet with a
token-driven sheet and bridged the old base layer onto the new tokens
(`tabletot.css:213`, "Bridge — TEMPORARY"). Games, Table Talk, and the voice UI
still render through that bridge. This plan rebuilds each on `.tt-*` classes,
deletes that surface's base-layer rules in the same commit, and finishes with
Task 7.0 removing the bridge and the base layer entirely. The Supabase schema,
the ledger RPCs, and the **voice pipeline** are not touched — Sprint 7 restyles
the voice *shell* only.

**Tech Stack:** React 18 + Vite + TypeScript, vanilla CSS
(`apps/kiosk/src/styles/tabletot.css`), Tailwind (only `components/ui/*` and
`CompletionNudge`), framer-motion, vitest + @testing-library/react, Supabase JS.
Package manager: **pnpm** (never npm). Local dev port: kiosk **8080**.

**Spec / source of truth:**
- `docs/plans/2026-08-08-kiosk-v1-redesign.md` — the parent plan. Sprint 6 tasks
  6.1/6.2 and Task 7.0 originate there; this plan supersedes and expands them
  with the design decisions taken on 2026-08-30.
- `docs/Tabletot Kiosk - Workflow Handoff.md` — the `.md` companion. Screens
  **16** (Venue/About), **17–19** (Activities), **06–08** (Voice). Where the
  HTML bundle and the `.md` disagree, the `.md` wins.
- `docs/design-system.md` — the "Warm Espresso" doc. Task 7.0 replaces it
  outright; do not patch it further.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Colour tokens — exact values, no substitutions** (from `src/styles/tokens.css`):

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

**Type:** Sora 800/56px display · Sora 700/40px headings · Sora 700/26px dish
names · Manrope 800/24px CTAs (**floor — never smaller**) · Manrope 500/20px
body · Manrope 700/18px labels and prices. Tokens: `--tt-font-display`,
`--tt-font-text`, `--tt-size-{display,heading,dish,cta,body,meta}`.

**Geometry:** Spacing `--tt-space-{1..7}` = 8/12/16/24/32/48/64. Radii 8 badges ·
12 chips and fields · 18 cards and primary buttons · 999 pills. Screen gutter 24
(`--tt-gutter`). Card padding 16 (`--tt-pad-card`).

**Elevation:** One model — a `2px solid` border. **Zero `box-shadow`. Zero
`backdrop-filter`.** Both vanish in restaurant glare.

**Every new colour value must be a `var(--tt-*)`** — no raw hex outside the two
`@font-face` blocks. Task 7.0's gate greps for this.

**Voice pipeline is FROZEN.** Sprint 7 restyles markup and CSS only. **Never
edit** these files or symbols:
- `src/lib/voice/sttClient.ts`
- `src/lib/voice/ttsClient.ts`
- `src/lib/voice/api.ts`
- `src/lib/voice/types.ts`
- `handleVoiceDone` in `src/pages/Index.tsx` (its three-sweep cart
  reconciliation is load-bearing; ADR references in-file)
- any hook logic inside `VoiceOrderButton.tsx` / `VoiceConversationPanel.tsx` —
  change JSX structure and `className`s, not the `useEffect`/`useCallback`
  bodies, refs, or the STT/TTS call sequence.

**Games logic is FROZEN.** `GamesView.tsx` is 737 lines of board state with no
test coverage. Task 6.2 changes chrome and `className`s only — no changes to
game state, turn handling, or move validation.

**Standing rule (inherited from the parent plan, Task 1.2):** the commit that
rebuilds a screen **also deletes that screen's rules from the base layer** of
`tabletot.css`. Rebuilds that leave the old rules behind are incomplete.

**Branch:** all work lands on `kiosk-v1-sprint-6-7` (cut from `main` at
`1de774c`). Rohan pushes and merges; do not push.

**Migrations:** repo is at `0070`. Append `0071` only; never edit an existing
migration. Apply to local Supabase (Docker) only — Rohan pushes remote himself.
After the migration + `supabase db reset`, regenerate types
(`supabase gen types typescript --local`) for the kiosk before writing TS that
reads the new shape. Silver's UUID is `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91`.

---

## File Structure

**Created:**
- `supabase/migrations/0071_about_venue_config.sql` — data-only: seed
  `restaurants.config` with `hours`, `chef_name`, `chef_note` for Silver.
- `apps/kiosk/src/components/screens/AboutView.tsx` — the Venue/About screen
  (screen 16). Presentational: takes venue facts as props, renders rows, one
  `onBack`. No data fetching, no session logic.
- `apps/kiosk/src/components/screens/__tests__/AboutView.test.tsx`

**Modified:**
- `apps/kiosk/src/lib/restaurantContext.tsx` — parse and expose `hours`,
  `chefName`, `chefNote` from `config` (mirrors the existing `promos` parse).
- `apps/kiosk/src/hooks/useDeviceNavigation.ts` — add `"about"` to `ScreenType`.
- `apps/kiosk/src/pages/Index.tsx` — `case "about"`; `aboutReturn` state; pass
  `onAbout` to `<AppShell>`; pass `onOpenAbout` to `<IdleScreen>`.
- `apps/kiosk/src/components/screens/IdleScreen.tsx` — third
  `.tt-attract-secondary` ("About"); `onOpenAbout` prop.
- `apps/kiosk/src/components/screens/__tests__/IdleScreen.test.tsx` — cover the
  new button.
- `apps/kiosk/src/components/screens/GamesView.tsx` — chrome `className`s →
  `.tt-*`; add `StatusStrip`.
- `apps/kiosk/src/components/screens/ConversationStartersView.tsx` — same.
- `apps/kiosk/src/components/VoiceOrderButton.tsx` — dock markup/`className`s →
  `.tt-voicedock-*`.
- `apps/kiosk/src/components/VoiceConversationPanel.tsx` — answer-card shapes.
- `apps/kiosk/src/components/screens/ListeningScreen.tsx` — screen 06 chrome →
  `.tt-*`.
- `apps/kiosk/src/styles/tabletot.css` — add `.tt-about-*`, `.tt-activities-*`,
  `.tt-voicedock-*`, `.tt-voicepanel-*` rules; delete the matching base-layer
  rules per task; Task 7.0 deletes the bridge and the whole base layer.
- `docs/design-system.md` — replaced in Task 7.0.

---

# Sprint 6 — Secondary screens

Client sign-off on Sprints 0–5 is done (2026-08-30). Everything here is off the
ordering path.

---

## Task 6.1a: Venue/About screen + data + AppBar wiring

**Files:**
- Create: `supabase/migrations/0071_about_venue_config.sql`
- Modify: `apps/kiosk/src/lib/restaurantContext.tsx`
- Modify: `apps/kiosk/src/hooks/useDeviceNavigation.ts`
- Create: `apps/kiosk/src/components/screens/AboutView.tsx`
- Create: `apps/kiosk/src/components/screens/__tests__/AboutView.test.tsx`
- Modify: `apps/kiosk/src/pages/Index.tsx`
- Modify: `apps/kiosk/src/styles/tabletot.css`

**Interfaces:**
- Produces: `useRestaurant()` returns additionally
  `hours: string`, `chefName: string`, `chefNote: string` (empty string when the
  config key is absent).
- Produces: `ScreenType` includes `"about"`.
- Produces: `AboutView` component —
  ```ts
  interface AboutViewProps {
    venueName: string;
    hours: string;
    address: string;
    chefName: string;
    chefNote: string;
    onBack: () => void;
  }
  ```
  A row whose value is an empty string is not rendered.
- Consumes (6.1b): `Index.tsx` exposes `onOpenAbout` on the `idle` branch.

**Design decisions (locked 2026-08-30):**
- About is a full screen (screen 16), not a dialog. Reached from the AppBar
  venue button mid-session, and from the Attract screen (Task 6.1b).
- Back returns to the screen the guest came from — tracked in `aboutReturn`.
- Wi-Fi is **not** on this screen. It keeps its own Attract secondary + dialog
  with the hardcoded `SILVER-GUEST` SSID (`IdleScreen.tsx:13`). Unchanged.
- `address` is passed as a literal string constant in `Index.tsx` (not config)
  — it is not expected to change for the pilot and does not need a config key.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0071_about_venue_config.sql`:

```sql
-- 0071_about_venue_config.sql
--
-- Venue/About screen (kiosk screen 16) content. Data-only: adds three keys to
-- restaurants.config for Silver. No schema change — config is already jsonb
-- (migration 0012).
--
-- hours + address are from the venue's public listing (verified 2026-08-30).
-- chef_name / chef_note are PLACEHOLDER copy — replace with the venue's own
-- wording before this migration is pushed to remote.

UPDATE restaurants
SET config = config || jsonb_build_object(
  'hours',     '11 AM – 11 PM, every day',
  'chef_name', 'Rohit Nair',
  'chef_note', 'Our beans are roasted in small batches every week and pulled on a lever machine. The kitchen leans Mediterranean — citrus, olive oil, fresh herbs. Ask us what is good today.'
)
WHERE id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';
```

- [ ] **Step 2: Apply locally and regenerate types**

Run:
```bash
supabase db reset            # from repo root, applies 0001..0071
supabase gen types typescript --local > apps/kiosk/src/integrations/supabase/types.ts
```
Expected: reset completes without error; `git diff` on `types.ts` shows no
change (config is untyped `Json`), or a trivial regeneration diff.

- [ ] **Step 3: Write the failing test for `restaurantContext`**

Add to a new or existing test near `restaurantContext.tsx`. If no test file
exists, create `apps/kiosk/src/lib/__tests__/restaurantContext.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { RestaurantProvider, useRestaurant } from "@/lib/restaurantContext";

vi.mock("@/integrations/supabase/client", () => ({
  hasSupabaseConfig: true,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                name: "Silver Specialty Coffee",
                config: {
                  hours: "11 AM – 11 PM, every day",
                  chef_name: "Rohit Nair",
                  chef_note: "Small batches.",
                },
              },
              error: null,
            }),
        }),
        or: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
      }),
    }),
  },
}));

function Probe() {
  const r = useRestaurant();
  return <span data-testid="v">{r.hours}|{r.chefName}|{r.chefNote}</span>;
}

it("exposes hours, chefName, chefNote from config", async () => {
  render(<RestaurantProvider><Probe /></RestaurantProvider>);
  await waitFor(() =>
    expect(screen.getByTestId("v").textContent).toBe(
      "11 AM – 11 PM, every day|Rohit Nair|Small batches.",
    ),
  );
});
```

- [ ] **Step 4: Run it — expect FAIL**

Run: `pnpm --dir apps/kiosk test -- restaurantContext`
Expected: FAIL — `hours`/`chefName`/`chefNote` are `undefined`.

- [ ] **Step 5: Extend `restaurantContext.tsx`**

In `RestaurantCtx` add:
```ts
  hours: string;
  chefName: string;
  chefNote: string;
```
In the default context object add `hours: "", chefName: "", chefNote: ""`.
Add three `useState("")` hooks. In the `.then()` config block, after the
`promos` branch:
```ts
          if (typeof cfg.hours === "string") setHours(cfg.hours);
          if (typeof cfg.chef_name === "string") setChefName(cfg.chef_name);
          if (typeof cfg.chef_note === "string") setChefNote(cfg.chef_note);
```
Add `hours, chefName, chefNote` to the provider `value={{ ... }}`.

- [ ] **Step 6: Run it — expect PASS**

Run: `pnpm --dir apps/kiosk test -- restaurantContext`
Expected: PASS.

- [ ] **Step 7: Add `"about"` to `ScreenType`**

`src/hooks/useDeviceNavigation.ts` — add `| "about"` to the `ScreenType` union
(place it after `"bill-summary"`). No other change in this file.

- [ ] **Step 8: Write the failing `AboutView` test**

Create `src/components/screens/__tests__/AboutView.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import AboutView from "@/components/screens/AboutView";

const base = {
  venueName: "Silver Specialty Coffee",
  hours: "11 AM – 11 PM, every day",
  address: "Plot 910C, Banjara Hills, Road 46, Khairatabad, Hyderabad",
  chefName: "Rohit Nair",
  chefNote: "Small batches, pulled on a lever machine.",
  onBack: () => {},
};

it("renders venue name, hours, address and chef note", () => {
  render(<AboutView {...base} />);
  expect(screen.getByText("Silver Specialty Coffee")).toBeInTheDocument();
  expect(screen.getByText(/11 AM . 11 PM/)).toBeInTheDocument();
  expect(screen.getByText(/Banjara Hills/)).toBeInTheDocument();
  expect(screen.getByText(/lever machine/)).toBeInTheDocument();
  expect(screen.getByText(/Rohit Nair/)).toBeInTheDocument();
});

it("hides the chef row when chefNote is empty", () => {
  render(<AboutView {...base} chefNote="" chefName="" />);
  expect(screen.queryByText(/Rohit Nair/)).not.toBeInTheDocument();
});

it("hides the hours row when hours is empty", () => {
  render(<AboutView {...base} hours="" />);
  expect(screen.queryByText(/11 AM/)).not.toBeInTheDocument();
});

it("calls onBack when the back control is pressed", () => {
  const onBack = vi.fn();
  render(<AboutView {...base} onBack={onBack} />);
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 9: Run it — expect FAIL**

Run: `pnpm --dir apps/kiosk test -- AboutView`
Expected: FAIL — module not found.

- [ ] **Step 10: Write `AboutView.tsx`**

Create `src/components/screens/AboutView.tsx`. Mirror the plain-screen shape of
`ConversationStartersView` (a scroll region + a back control; `AppShell`
provides the AppBar). Use `.tt-about-*` classes only.

```tsx
import { ChevronLeft } from "lucide-react";
import TabletotLogo from "@/components/TabletotLogo";

interface AboutViewProps {
  venueName: string;
  hours: string;
  address: string;
  chefName: string;
  chefNote: string;
  onBack: () => void;
}

const AboutView = ({ venueName, hours, address, chefName, chefNote, onBack }: AboutViewProps) => (
  <div className="tt-about">
    <button type="button" className="tt-about-back" onClick={onBack}>
      <ChevronLeft size={20} aria-hidden="true" />
      Back
    </button>

    <div className="tt-about-lockup">
      <TabletotLogo className="tt-about-mark" />
      <h1 className="tt-about-name">{venueName}</h1>
    </div>

    {hours && (
      <section className="tt-about-row">
        <p className="tt-about-label">Hours</p>
        <p className="tt-about-value">{hours}</p>
      </section>
    )}

    {address && (
      <section className="tt-about-row">
        <p className="tt-about-label">Find us</p>
        <p className="tt-about-value">{address}</p>
      </section>
    )}

    {chefNote && (
      <section className="tt-about-row">
        <p className="tt-about-label">From the kitchen{chefName ? ` — ${chefName}` : ""}</p>
        <p className="tt-about-value">{chefNote}</p>
      </section>
    )}
  </div>
);

export default AboutView;
```

- [ ] **Step 11: Run it — expect PASS**

Run: `pnpm --dir apps/kiosk test -- AboutView`
Expected: PASS (all four cases).

- [ ] **Step 12: Add the `.tt-about-*` styles**

Append to `src/styles/tabletot.css`, inside the `.tt-*` section (after
line 4325, with the other screen blocks). Tokens only, 2px borders, no shadow:

```css
/* ─── Venue / About (screen 16) ─────────────────────────────────── */
.tt-about {
  display: flex;
  flex-direction: column;
  gap: var(--tt-space-4);
  padding: var(--tt-gutter);
}

.tt-about-back {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: var(--tt-space-1);
  min-height: var(--tt-tap);
  padding: 0 var(--tt-space-3);
  border: 2px solid var(--tt-line);
  border-radius: var(--tt-radius-pill);
  background: var(--tt-paper);
  color: var(--tt-ink);
  font-family: var(--tt-font-text);
  font-weight: 700;
  font-size: var(--tt-size-meta);
}

.tt-about-lockup {
  display: flex;
  align-items: center;
  gap: var(--tt-space-3);
}

.tt-about-mark {
  width: calc(56px * var(--tt-scale));
  height: calc(56px * var(--tt-scale));
  color: var(--tt-ink);
}

.tt-about-name {
  margin: 0;
  font-family: var(--tt-font-display);
  font-weight: 700;
  font-size: var(--tt-size-heading);
  color: var(--tt-ink);
}

.tt-about-row {
  display: flex;
  flex-direction: column;
  gap: var(--tt-space-1);
  padding: var(--tt-pad-card);
  border: 2px solid var(--tt-line);
  border-radius: var(--tt-radius-card);
  background: var(--tt-paper);
}

.tt-about-label {
  margin: 0;
  font-family: var(--tt-font-text);
  font-weight: 700;
  font-size: var(--tt-size-meta);
  color: var(--tt-ink-60);
}

.tt-about-value {
  margin: 0;
  font-family: var(--tt-font-text);
  font-weight: 500;
  font-size: var(--tt-size-body);
  color: var(--tt-ink);
}
```

- [ ] **Step 13: Wire `Index.tsx`**

1. Add state near the other screen state:
   ```ts
   const [aboutReturn, setAboutReturn] = useState<ScreenType>("idle");
   ```
2. Add a helper:
   ```ts
   const openAbout = useCallback(() => {
     setAboutReturn(currentScreenRef.current);
     setCurrentScreen("about");
   }, [setCurrentScreen]);
   ```
3. In `renderScreen()`'s switch, before `default:`:
   ```tsx
   case "about":
     return (
       <AboutView
         venueName={venueName || "Silver Specialty Coffee"}
         hours={hours}
         address="Plot 910C, Banjara Hills, Road 46, Khairatabad, Hyderabad"
         chefName={chefName}
         chefNote={chefNote}
         onBack={() => setCurrentScreen(aboutReturn)}
       />
     );
   ```
4. Pull `hours, chefName, chefNote` from `useRestaurant()` where `venueName` is
   already destructured (line ~62).
5. On the `<AppShell>` element, add `onAbout={openAbout}`.
6. `import AboutView from "@/components/screens/AboutView";` at the top.

- [ ] **Step 14: Run the full kiosk suite + build**

Run:
```bash
pnpm --dir apps/kiosk test
pnpm --dir apps/kiosk build
```
Expected: all green. Sprint 0's `aov-attribution.test.tsx` must still pass.

- [ ] **Step 15: Browser check**

Run `pnpm --dir apps/kiosk dev` (port 8080). At 800×1340:
1. From the menu, tap the venue name in the app bar → About screen renders,
   rows present, no console errors.
2. Tap Back → returns to the menu.
3. Confirm no `box-shadow` on the About cards (DevTools).
**Kill the dev server before finishing.**

- [ ] **Step 16: Commit**

```bash
git add supabase/migrations/0071_about_venue_config.sql \
  apps/kiosk/src/lib/restaurantContext.tsx \
  apps/kiosk/src/hooks/useDeviceNavigation.ts \
  apps/kiosk/src/components/screens/AboutView.tsx \
  apps/kiosk/src/components/screens/__tests__/AboutView.test.tsx \
  apps/kiosk/src/lib/__tests__/restaurantContext.test.tsx \
  apps/kiosk/src/pages/Index.tsx \
  apps/kiosk/src/styles/tabletot.css \
  apps/kiosk/src/integrations/supabase/types.ts
git commit -m "feat(kiosk): Venue/About screen (16) from restaurant config"
```

---

## Task 6.1b: "About" secondary on the Attract screen

**Files:**
- Modify: `apps/kiosk/src/components/screens/IdleScreen.tsx`
- Modify: `apps/kiosk/src/components/screens/__tests__/IdleScreen.test.tsx`
- Modify: `apps/kiosk/src/pages/Index.tsx`
- Modify: `apps/kiosk/src/styles/tabletot.css` (only if the 3-up row needs a tweak)

**Interfaces:**
- Consumes: `Index.tsx` `openAbout` helper from Task 6.1a — but the Attract
  entry point must NOT open a session. It uses its own handler:
  `() => { setAboutReturn("idle"); setCurrentScreen("about"); }`.
- Produces: `IdleScreen` gains `onOpenAbout: () => void` (required prop).

**Design decisions (locked 2026-08-30):**
- Third `.tt-attract-secondary` after Wi-Fi, in `.tt-attract-secondaries`.
- `.tt-attract-secondaries` is `display: flex` with `flex: 1` children and an
  auto `border-left` divider between siblings (`tabletot.css:5876`). A third
  button drops in as an equal column. Expect no CSS change; the only risk is
  the `ChevronRight` arrow getting tight at 3-up on 800px — fix with a
  media/flex tweak only if the browser check shows it.
- Unlike `onOpenPopular`, the Attract "About" does **not** call `startSession()`
  — About is read-only and a guest browsing venue info pre-order should not
  open a ledger span.

- [ ] **Step 1: Write the failing test**

Add to `src/components/screens/__tests__/IdleScreen.test.tsx`. The
`renderIdle` helper already spreads props; add `onOpenAbout` to its defaults
(`onOpenAbout: () => {}`), then:

```tsx
it("the About secondary fires onOpenAbout", () => {
  const onOpenAbout = vi.fn();
  renderIdle({ onOpenAbout });
  fireEvent.click(screen.getByRole("button", { name: "About" }));
  expect(onOpenAbout).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --dir apps/kiosk test -- IdleScreen`
Expected: FAIL — no button named "About".

- [ ] **Step 3: Add the button to `IdleScreen.tsx`**

1. Add `onOpenAbout: () => void;` to `IdleScreenProps`, and to the destructured
   params.
2. Import `Info` from `lucide-react` (add to the existing import).
3. In `.tt-attract-secondaries`, after the Wi-Fi `<button>`:
   ```tsx
   <button type="button" className="tt-attract-secondary" onClick={onOpenAbout}>
     <span className="tt-attract-secondary-icon">
       <Info size={18} aria-hidden="true" />
     </span>
     About
     <ChevronRight size={18} className="tt-attract-secondary-arrow" aria-hidden="true" />
   </button>
   ```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm --dir apps/kiosk test -- IdleScreen`
Expected: PASS.

- [ ] **Step 5: Wire `Index.tsx`**

On the `<IdleScreen>` element in the `idle` case, add:
```tsx
onOpenAbout={() => {
  // read-only screen — no startSession(), unlike onOpenPopular
  setAboutReturn("idle");
  setCurrentScreen("about");
}}
```

- [ ] **Step 6: Full suite + build**

Run:
```bash
pnpm --dir apps/kiosk test
pnpm --dir apps/kiosk build
```
Expected: all green.

- [ ] **Step 7: Browser check**

`pnpm --dir apps/kiosk dev`, 800×1340, Attract screen:
1. Bottom panel shows three secondaries: Popular · Wi-Fi · About, evenly split
   with dividers, each ≥ 64px tall, labels and icons not clipped.
2. Tap About → About screen; tap Back → returns to Attract (not menu).
3. Confirm no session started: the app bar still shows no active-order state,
   and re-entering the menu still shows "Round 1".
If the arrow is clipped at 3-up, add to `tabletot.css`:
```css
@media (max-width: 820px) {
  .tt-attract-secondary-arrow { display: none; }
}
```
**Kill the dev server before finishing.**

- [ ] **Step 8: Commit**

```bash
git add apps/kiosk/src/components/screens/IdleScreen.tsx \
  apps/kiosk/src/components/screens/__tests__/IdleScreen.test.tsx \
  apps/kiosk/src/pages/Index.tsx \
  apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): add About to the Attract secondary panel"
```

---

> **Revised 2026-08-30 (as built, commit `8a8c7bf`).** The base-layer game CSS
> turned out to be layered with dead rules (`.ludo-*` alongside live
> `.classic-ludo-*`) and scattered across 1300–4075 interleaved with keyframes,
> making an in-place cut-move-rewrite fragile. Executed instead as a **pure
> mechanical rename**: `.classic-ludo-*` → `.tt-ludo-*`, `.game-*` →
> `.tt-game-*`, `.conversation-*` → `.tt-talk-*`, etc., across both TSX files
> and `tabletot.css`, rule bodies untouched. The screens render identically
> (still on bridge vars). **Two pieces moved to Task 7.0:** (a) the
> bridge-var → `--tt-*` sweep and physical relocation of these `.tt-*` rules
> into the `.tt-*` section — do it there as one operation; (b) the in-screen
> `StatusStrip` was dropped — it needs cooking-round data `GamesView` doesn't
> take, so it belongs with a real Sprint 6 design pass, not the rename.
> Steps below are kept for historical context.

## Task 6.2: Activities — Games & Table Talk on the token set

**Files:**
- Modify: `apps/kiosk/src/components/screens/GamesView.tsx`
- Modify: `apps/kiosk/src/components/screens/ConversationStartersView.tsx`
- Modify: `apps/kiosk/src/styles/tabletot.css`

**Interfaces:**
- Consumes: `StatusStrip` (existing component, already used in `Index.tsx` —
  `label: string`, `detail?: string`, `onTap?: () => void`).
- Produces: nothing new; the `onBack` props on both screens are unchanged.

**Scope — chrome only.** Replace `className`s and wrapper markup. Do **not**
touch: board state, turn handling, move validation, the Ludo engine, the
conversation-deck data, or any `useState`/`useEffect`/`useReducer` body.

**Non-`.tt-` classes to migrate** (found by grep on the two files):

GamesView: `view`, `panel`, `eyebrow`, `hero-sub`, `primary-btn`,
`secondary-btn`, `utility-back-btn`, `utility-feature-hero`,
`utility-feature-view`, `game-feature-hero`, `game-feature-view`,
`game-mode-strip`, `game-panel`, `game-panel-header`, `game-status-block`,
`connect-board`, `tic-board`, `duel-stage`, `duel-controls`, `duel-point-btn`,
`duel-prompt-card`, `duel-scoreboard`, `word-duel-panel`,
`classic-ludo-{board,center,header,home-inner,home-slot,layout,no-move,panel,player-select,reset,setup,side,start,status-list,win-modal}`.

ConversationStartersView: `view`, `panel`, `eyebrow`, `hero-sub`,
`primary-btn`, `secondary-btn`, `utility-back-btn`, `utility-feature-hero`,
`utility-feature-view`, `conversation-{category-card,category-grid,category-index,change-btn,controls,counter,hero,layer-view,question-card,session-head,session-panel}`.

**Mapping approach:** introduce a `.tt-activities-*` family. Shared wrappers map
to existing primitives where one fits (`view`→`.tt-screen`, `panel`→a 2px-border
card, `primary-btn`/`secondary-btn`→`.tt-btn`/`.tt-btn--secondary`,
`eyebrow`→`.tt-eyebrow`). Game-specific boards keep dedicated
`.tt-activities-*` classes because their grid geometry is bespoke. Every rule
uses `var(--tt-*)` values and a 2px border for elevation — no `box-shadow`.

- [ ] **Step 1: Restyle `GamesView.tsx`**

Replace each `className` per the mapping above. Keep the DOM tree shape; you may
add a wrapping `<div className="tt-activities">` if it helps scoping. Add a
`StatusStrip` at the base of the returned tree so a waiting guest still sees the
kitchen stage:
```tsx
<StatusStrip label="Your order is with the kitchen" />
```
(Import from its existing path — check `Index.tsx` for the specifier.)

- [ ] **Step 2: Restyle `ConversationStartersView.tsx`**

Same treatment. Add the same `StatusStrip` at the base.

- [ ] **Step 3: Add `.tt-activities-*` rules; delete the old rules**

In `tabletot.css`:
1. Add the `.tt-activities-*` block in the `.tt-*` section.
2. **Delete** every base-layer rule for the classes listed above — including the
   four families the parent plan's Task 1.2 preserved *only* for this task:
   `.classic-ludo-*` and `.classic-dice-face`. Search and remove each
   selector's rule. `.game-*`, `.duel-*`, `.word-duel-*`, `.conversation-*`,
   `.tic-board`, `.connect-board`, `.utility-feature-*`, `.game-feature-*` all
   come out here too.
3. Leave shared primitives (`.eyebrow`, `.panel`, `.primary-btn`,
   `.secondary-btn`, `.hero-sub`, `.view`) **in place for now** — other bridged
   screens (voice) still use them until Sprint 7. Task 7.0 removes them.

- [ ] **Step 4: Verify the cut**

Run:
```bash
grep -c "classic-ludo" apps/kiosk/src/styles/tabletot.css   # expect 0
grep -c "classic-dice-face" apps/kiosk/src/styles/tabletot.css   # expect 0
grep -c "conversation-question-card" apps/kiosk/src/styles/tabletot.css   # expect 0
grep -c "duel-stage" apps/kiosk/src/styles/tabletot.css   # expect 0
```

- [ ] **Step 5: Tests + build**

Run:
```bash
pnpm --dir apps/kiosk test
pnpm --dir apps/kiosk build
```
Expected: all green (the game screens have no unit tests; the suite must still
pass and the build must not error on a missing class — CSS classes are not
type-checked, so a genuine break shows only in the browser).

- [ ] **Step 6: Browser check**

`pnpm --dir apps/kiosk dev`, 800×1340. From the session-idle screen:
1. Open Games → play one full game of Connect Four. Board renders on the token
   palette, turns work, win detection fires.
2. Open Ludo → run a setup, roll, move a token. Board and dice styled, no
   unstyled block-flow anywhere.
3. Open Table Talk → step through one deck. Cards styled, counter works.
4. `StatusStrip` visible at the base of each.
**Kill the dev server before finishing.**

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/src/components/screens/GamesView.tsx \
  apps/kiosk/src/components/screens/ConversationStartersView.tsx \
  apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): Activities screens on the v1.0 token set"
```

---

# Sprint 7 — Voice UI shell

Touch and logic are validated on the physical tablet (2026-08-30). The voice
**pipeline** stays frozen — see Global Constraints. These tasks change JSX
structure and CSS only.

---

## Task 7.1: Voice dock + Listening screen on the token set

**Files:**
- Modify: `apps/kiosk/src/components/VoiceOrderButton.tsx`
- Modify: `apps/kiosk/src/components/screens/ListeningScreen.tsx`
- Modify: `apps/kiosk/src/styles/tabletot.css`

**Interfaces:**
- Consumes: nothing new. `VoiceOrderButtonProps` is unchanged.
- Produces: nothing new. Class names only.

**The six dock states** (derived from `backendStatus × pressStatus × micBlocked`
in `VoiceOrderButton.tsx`, plus conversation mode):
1. **starting** — `backendStatus === "starting"` → class `ptt-starting`, label
   "Tap to speak" (disabled).
2. **ready / idle** — `backendStatus === "ready"`, `pressStatus === "idle"` →
   base, label "Tap to speak".
3. **recording** — `pressStatus === "recording"` → class `ptt-recording`, label
   "Tap to stop".
4. **processing** — `pressStatus === "processing"` → class `ptt-processing`,
   spinner SVG, label "Processing…" (disabled).
5. **error** — `backendStatus === "error"` → class `ptt-error`, label "Voice
   unavailable" (disabled).
6. **mic-blocked** — `micBlocked` true → class `ptt-error` + the
   `ptt-blocked-msg` helper line rendered above the button.

Conversation-mode variant (`onOpenConversation` provided): the button is an
"Open voice conversation" affordance that opens the panel instead of capturing.

- [ ] **Step 1: Rename the dock classes in `VoiceOrderButton.tsx`**

Map, keeping the state logic that sets them untouched:
- `ptt-wrap` → `tt-voicedock`
- `ptt-bubbles` / its `<span>`s → `tt-voicedock-hints` / `tt-voicedock-hint`
- `ptt-blocked-msg` → `tt-voicedock-blocked`
- `ptt-btn` → `tt-voicedock-btn`
- `ptt-recording` → `tt-voicedock-btn--recording`
- `ptt-processing` → `tt-voicedock-btn--processing`
- `ptt-error` → `tt-voicedock-btn--error`
- `ptt-starting` → `tt-voicedock-btn--starting`
- `ptt-spinner` → `tt-voicedock-spinner`
- `ptt-mic-icon` → `tt-voicedock-mic`

Only the string literals in the `btnClass` array and the JSX `className`
attributes change. Do not touch `handleToggle`, the effects, or the refs.

- [ ] **Step 2: Restyle `ListeningScreen.tsx` (screen 06)**

Replace its non-`.tt-` `className`s with a `.tt-voicelisten-*` family. It is a
full-screen overlay — a heading, a live transcript area, a mic affordance. Keep
its props and any effect bodies unchanged.

- [ ] **Step 3: Add `.tt-voicedock-*` and `.tt-voicelisten-*` rules; delete `.ptt-*`**

In `tabletot.css`:
1. Add the two `.tt-*` blocks in the `.tt-*` section, tokens only, 2px border,
   no shadow. The recording state may pulse via `@keyframes` on `transform` /
   `opacity` only (never a layout property).
2. Delete every `.ptt-*` rule from the base layer (grep says ~13 occurrences).
3. Delete the `ListeningScreen` base rules you replaced.

- [ ] **Step 4: Verify the cut**

Run:
```bash
grep -c "\.ptt-" apps/kiosk/src/styles/tabletot.css   # expect 0
```

- [ ] **Step 5: Tests + build**

Run:
```bash
pnpm --dir apps/kiosk test
pnpm --dir apps/kiosk build
```
Expected: green. Voice components have thin/no unit tests; the guard is the
browser check.

- [ ] **Step 6: Browser check**

`pnpm --dir apps/kiosk dev`, 800×1340, with the order-engine running so voice
initialises. On the menu:
1. Dock renders on the token palette. Observe **starting → ready** on load.
2. Tap → **recording** (state 3); tap again → **processing** (4) →
   back to ready.
3. Stop the order-engine, reload → **error** (5), label "Voice unavailable".
4. If testable: deny mic permission → **mic-blocked** (6) with the helper line.
5. `ListeningScreen`: trigger it (if reachable in this build) — styled, no
   unstyled text.
**Kill the dev server and the order-engine before finishing.**

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/src/components/VoiceOrderButton.tsx \
  apps/kiosk/src/components/screens/ListeningScreen.tsx \
  apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): voice dock + Listening screen on the v1.0 token set"
```

---

## Task 7.2: Voice conversation panel — answer-card shapes (07 / 08)

**Files:**
- Modify: `apps/kiosk/src/components/VoiceConversationPanel.tsx`
- Modify: `apps/kiosk/src/styles/tabletot.css`

**Interfaces:**
- Consumes: nothing new. The panel's props and the `Turn[]` transcript model
  are unchanged.
- Produces: class names only.

**Two answer shapes (handoff screens 07 / 08):**
- **07 Recommendation** — the answer contains dish suggestions, so dish cards
  render inside the answer card and can be added directly. Reuse the existing
  dish-card component the menu uses (check the import in the current panel).
- **08 Informational** — the answer is a fact (calories, allergens, hours), so
  it renders as **text only, no cards**.
The panel already distinguishes these from the message payload; this task only
restyles the two containers. Closing the panel must still retain the thread
(no change to that logic).

- [ ] **Step 1: Identify the 07 vs 08 branch**

Read `VoiceConversationPanel.tsx`. Locate where it decides to render dish cards
vs plain text for an assistant turn. Note the class names on each container.

- [ ] **Step 2: Rename to `.tt-voicepanel-*`**

- panel shell → `tt-voicepanel`
- transcript scroll region → `tt-voicepanel-thread`
- a guest turn → `tt-voicepanel-turn--guest`
- an assistant turn → `tt-voicepanel-turn--agent`
- the 07 answer card (with dish cards) → `tt-voicepanel-answer--rec`
- the 08 answer card (text only) → `tt-voicepanel-answer--info`
- close control → `tt-voicepanel-close`
Change `className` strings and wrapper markup only. Do not touch the
`useEffect` bodies, the transcript state, or the barge-in / TTS calls.

- [ ] **Step 3: Add `.tt-voicepanel-*` rules; delete the old panel rules**

`tabletot.css`: add the block in the `.tt-*` section (tokens, 2px border, no
shadow). The panel is a Radix Dialog content that self-positions — follow the
`.voice-conversation-panel` / `.tt-wifi-dialog` pattern already in the file
(fixed, `translate(-50%,-50%)`, `width: min(100% - gutters, …)`). Delete the
`.voice-conversation-panel` and related base-layer rules you replaced.

- [ ] **Step 4: Tests + build**

Run:
```bash
pnpm --dir apps/kiosk test
pnpm --dir apps/kiosk build
```
Expected: green.

- [ ] **Step 5: Browser check**

`pnpm --dir apps/kiosk dev` + order-engine, 800×1340:
1. Open the voice conversation. Ask for a recommendation → **07**: answer card
   with dish cards, each addable; adding one updates the cart.
2. Ask a factual question ("how many calories in the latte?") → **08**: text
   only, no cards.
3. Close the panel and reopen → the thread is still there.
4. Panel is centred in the viewport, no clipping, no `box-shadow`.
**Kill the dev server and order-engine before finishing.**

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/components/VoiceConversationPanel.tsx \
  apps/kiosk/src/styles/tabletot.css
git commit -m "feat(kiosk): voice conversation panel on the answer-card shapes"
```

---

## Task 7.0: Tear down the bridge

Runs **last**, after 6.2, 7.1, and 7.2 are all committed. This is the end of the
whole redesign — it removes the Task 1.2 bridge so it cannot become a permanent
fifth layer.

**Absorbed from Task 6.2 (revised 2026-08-30):** the `.tt-ludo-*` / `.tt-game-*`
/ `.tt-talk-*` / `.tt-duel-*` / `.tt-tic-*` / `.tt-connect-*` / `.tt-dice-*` /
`.tt-activities-*` rules were renamed in place and still sit in the base-layer
region referencing bridge vars (`var(--brand)`, `var(--panel)`,
`var(--shadow-md)`, `var(--radius-lg)`, …). Before deleting the base layer:
1. **Relocate** those `.tt-*` rule blocks (and the `@keyframes` they use —
   `ludoTokenPulse`, `classicDiceRoll`, `classicLudoValid`, `classicLudoMove`,
   `classicLudoCapture`) into the `.tt-*` section.
2. **Sweep the vars** in those relocated blocks to real tokens, per the bridge
   map at `tabletot.css:213`: `--brand`→`--tt-action`,
   `--brand-deep`→`--tt-action-press`, `--brand-gold`→`--tt-action`,
   `--panel`/`--panel-strong`→`--tt-paper`, `--panel-dark`→`--tt-ink`,
   `--bg`→`--tt-field`, `--text`→`--tt-ink`, `--muted`→`--tt-ink-60`,
   `--soft`→`--tt-disabled`, `--line`/`--line-strong`→`--tt-line`,
   `--green`→`--tt-veg`, `--radius-xl`/`--radius-lg`→`--tt-radius-card`,
   `--radius-md`/`--radius-sm`→`--tt-radius-chip`, `--touch`→`--tt-tap`,
   `--shadow-*` → delete the declaration. Raw hex → nearest `--tt-*`.
3. Then delete the rest of the base layer + bridge as below.

- [ ] **Step 1: Confirm nothing outside the new system is still defined**

Run:
```bash
grep -oE '^\.[a-z][a-z0-9-]*' apps/kiosk/src/styles/tabletot.css | sort -u | grep -v '^\.tt-'
```
Expected: **no output**. Every top-level class rule is a `.tt-` class. If a
legacy name is still defined, find the task that was supposed to delete it
(6.2 / 7.1 / 7.2) and finish that first — do not proceed.

- [ ] **Step 2: Delete the base layer and the bridge**

In `tabletot.css`, remove everything **above** the `.tt-` section marker
(`/* ==== v1.0 SYSTEM ... ==== */`, ~line 4325 pre-cut): the bridged `:root`
block (`tabletot.css:213`), the `body` override, and all remaining base rules.
**Keep** the two `@font-face` blocks — move them to the very top of what
remains.

- [ ] **Step 3: Verify the end state**

Run:
```bash
grep -c "box-shadow\|backdrop-filter" apps/kiosk/src/styles/tabletot.css   # expect 0
grep -nE "#[0-9A-Fa-f]{3,6}" apps/kiosk/src/styles/tabletot.css | grep -v "@font-face"   # expect no output
grep -c "^:root" apps/kiosk/src/styles/tabletot.css   # expect 0 (tokens live in tokens.css)
```

- [ ] **Step 4: Full verification**

Run:
```bash
pnpm --dir apps/kiosk test
pnpm --dir apps/kiosk build
```
Both PASS. Then `pnpm --dir apps/kiosk dev` and walk **every** screen at
800×1340: Attract → About → Menu → Detail → Cart → Sent → Confirmation →
Status → Bill → Games → Ludo → Table Talk → voice dock → voice panel →
Listening. Nothing renders as unstyled block-flow.
**Kill the dev server before finishing.**

- [ ] **Step 5: Replace the design-system doc**

`docs/design-system.md` is the "Warm Espresso" spec. Replace its body with a
short pointer: the kiosk design system is now `apps/kiosk/src/styles/tokens.css`
(tokens) + the `.tt-*` rules in `tabletot.css`; the handoff
(`docs/Tabletot Kiosk - Workflow Handoff.md`) is the screen spec. Keep the file
so inbound links don't break; drop the palette/shadow tables entirely.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/styles/tabletot.css docs/design-system.md
git commit -m "refactor(kiosk): delete the bridge — fully on the v1.0 token system"
```

- [ ] **Step 7: Update project docs**

- `apps/kiosk/CLAUDE.md` and root `CLAUDE.md` "Current status" — note Sprints
  6–7 shipped and the bridge is gone.
- Add a note to `docs/notes/` dated 2026-08-30 summarising what changed
  (screens rebuilt, bridge removed, `design-system.md` retired).
- Commit:
  ```bash
  git add apps/kiosk/CLAUDE.md CLAUDE.md docs/notes/
  git commit -m "docs: Sprints 6–7 complete, Warm Espresso bridge removed"
  ```

---

## Self-Review

**Spec coverage:**
- Handoff screen 16 (Venue/About) → Task 6.1a + 6.1b. ✔
- Handoff screens 17–19 (Activities / Games / Table Talk) → Task 6.2. ✔
- Handoff screens 06–08 (Listening / Recommendation / Informational) → Task 7.1
  (06 + dock) and 7.2 (07/08). ✔
- Parent plan Task 6.1 ("Venue/About from restaurant config", `onAbout` from the
  app bar) → Task 6.1a. ✔
- Parent plan Task 6.2 ("Activities on the token set", delete `.game-*` /
  `.starter-*` / `.classic-ludo-*` / `.classic-dice-face`, add `StatusStrip`) →
  Task 6.2. ✔
- Parent plan Task 7.0 (tear down the bridge; the two grep gates; keep
  `@font-face`; replace `design-system.md`) → Task 7.0. ✔
- New requirement (About on the Attract panel, no session start) → Task 6.1b. ✔

**Placeholder scan:** chef copy in migration 0071 is intentionally placeholder
and labelled as such in the SQL comment — Rohan swaps it before pushing remote.
No "TBD"/"TODO" steps. All code steps carry real code.

**Type consistency:** `hours` / `chefName` / `chefNote` are `string` in
`RestaurantCtx`, in `AboutViewProps`, and in the `Index.tsx` wiring. `"about"`
is added to `ScreenType` once (Task 6.1a Step 7) and consumed in Task 6.1a
Step 13 and Task 6.1b Step 5. `onOpenAbout` is defined in `IdleScreenProps`
(6.1b Step 3) and passed in `Index.tsx` (6.1b Step 5). `aboutReturn` /
`openAbout` are defined once in 6.1a Step 13 and reused in 6.1b.

**Known soft spots (flagged, not blocking):**
- Task 6.2's game-class mapping is directional, not line-by-line — the executor
  reads each file and applies the `.tt-activities-*` family. The freeze on game
  logic and the "no unstyled block-flow" browser check are the guardrails.
- Tasks 7.1/7.2 depend on reading the current voice components at execution
  time; the class renames are mechanical but the exact JSX tree is confirmed in
  the first step of each.
