# Kiosk UX-audit fixes

**Date:** 2026-09-28
**Status:** Executed on `feat/kiosk-ux-audit-fixes` (2026-09-29), uncommitted follow-up pass pending. See "Outcome" at the end.
**Branch:** new branch off `fix/pos-add-items-modal-ux` *after* the screensaver work is committed (see Step 0)
**Mockup:** https://claude.ai/artifact/XBgV5tC6u6dxu6S2FicLCo (11 screens, numbered notes per screen)

## Why

A screen-by-screen audit of the kiosk against Hick, Fitts, Jakob, Miller and
Tesler turned up three kinds of problem: trust bugs (egg dishes marked Veg,
contradictory item counts, a phone prompt that contradicts itself), layout bugs
(cart thumbnail overlap, Games board cut off, screensaver only dismissable from
one small button), and friction (labels that look like inputs, seven names for
one action, the ad sitting above order status).

## Decisions already made (2026-09-28)

- Diet marks switch to the FSSAI square outline (dot / triangle inside a
  square). This overrides the `tokens.css` note "always with a circle".
- No separate Egg mark. Egg dishes are fixed to Non-Veg in the data.
- The word "Round" never reaches a customer. Use "1st order", "2nd order"; drop
  it entirely where it adds nothing (the cart bar).
- ETA comes from per-dish prep time. Rohan fills `menu_items.facts.prep_minutes`
  (the key already exists, migration 0072). ETA = the largest `prep_minutes`
  among the dishes still cooking.
- Status is shown per order (per KOT), not per item.

## What the code check found

- **Per-order status is possible with no migration.** Each "Order more" is a
  new KOT on the same live order (`useDeviceNavigation.ts:138`). `kot_tickets`
  already has anon read (0022 `anon_read`, untouched by 0068) and is in the
  realtime publication (0003). WaitingView today watches only the rolled-up
  `orders.status`; it can watch `kot_tickets` filtered by `order_id` instead.
- **"Plating" is really `ready`** (`WaitingView.tsx:25`). Relabel it Ready.
  Relabel `new` as "Received".
- **The "Name for this order" field is a per-restaurant flag**
  (`restaurants.promptForIdentity`), not a hard-coded field. Fixing it means a
  config change, not a code removal.
- **"Round" appears in 4 places:** `OrderBar.tsx:21`, `SentView.tsx:32/46/49`,
  `CancelConfirm.tsx:24`, `CartView.tsx:84`, `BillView.tsx:132`.
- **The label-box look comes from `.tt-badge` and similar pill label classes**
  in `tabletot.css`. One CSS change covers most screens.

## Steps

Each step is one commit. Steps are ordered so the riskiest-to-trust fixes land
first and the ones that need new data or decisions land last.

### Step 0 — housekeeping (before the new branch)

- Commit the screensaver work on the current branch:
  `ScreensaverOverlay.tsx`, `Index.tsx`, `tabletot.css`.
- `apps/pos/package-lock.json` and `apps/kiosk/bun.lock` are also modified.
  POS and kiosk have always shipped npm and bun lockfiles, so this isn't a new
  package manager, but confirm the lockfile churn was intentional before
  committing it. If it wasn't, `git checkout` both files.
- Leave this plan file out of that commit. It goes on the new branch.

### Step 1 — data: diet marks for egg dishes (no code)

- SQL check: list every `menu_items` row for Silver whose name or description
  mentions egg/omelette and is `is_veg = true`. Known: French Omelette, Turkish
  Eggs, likely French Toast.
- New migration that sets `is_veg = false` on the confirmed rows. Rohan
  confirms the list before it's written. Apply locally, then Rohan pushes.

### Step 2 — trust and layout bugs

| Fix | File(s) |
|---|---|
| Screensaver: tap anywhere dismisses (move `onClick` to the outer div) | `ScreensaverOverlay.tsx` |
| Screensaver: fall back to the normal screen if the ad image fails to load | `ScreensaverOverlay.tsx` |
| Screensaver: close when kitchen status changes to Ready | `Index.tsx` |
| Cart thumbnail overlaps the dish name, and the photo is missing though the menu has it | `CartView.tsx` + CSS (investigate first) |
| Games board cut off at the bottom: size the board to the space left | `GamesView.tsx` + CSS |
| Attract carousel repeats a dish when there are fewer dishes than slots | `IdleScreen.tsx` (`MAX_SLIDES` slice) |
| Phone prompt: heading says "is bringing", button says "request". Make the wording match | `BillView.tsx` |
| "Order more" greyed out after bill request with no reason: keep it enabled with "(added to your bill)" — **pending Silver's OK**, else show the reason | `WaitingView.tsx` |

### Step 3 — shared visual fixes (CSS-first)

- Section labels: restyle `.tt-badge` and the full-width label boxes as plain
  small uppercase text (no border, no fill).
- Diet marks: square outline for both Veg and Non-Veg (`.tt-dietmark-*`), and
  drop the "Veg" / "Non-Veg" word next to dish names (keep it in the filter).
- Prices: one formatter that drops `.00` (keep paise only when non-zero).
- Header: "Table T1" gets one style on every screen (Attract uses the orange
  pill today).
- Stepper: − and + get equal size and weight.
- Add buttons: pairings use the same orange Add pill as dishes, in a smaller size.

### Step 4 — wording and navigation

- Remove "Round" everywhere (see list above). The cart bar becomes
  "2 items · ₹680 + GST".
- One name per action: **Order more** opens the menu, and **← Order status**
  returns to status. Back is always top-left (Menu, Cart, Games, Bill).
- Cart button: "Send to kitchen" → **Place order · ₹714**. Hold screen:
  "Sending to the kitchen in 1:54", "You can still change your order until
  then", buttons Send now / Change order / Cancel order (drop "Order more"
  there; Cancel becomes a real button).
- Attract: "Browse the menu, or tap the mic and ask." plus an **Ask by voice**
  button. This only adds a button that opens the existing voice flow; no voice
  pipeline code is touched.
- Bill: "Your bill" and "Ready to pay?". Add "Pay by UPI, card or cash".
- Waiting: "Queued" → Received, "Plating" → Ready, and remove the repeated
  "at the X stage" sentence.
- Games: one heading, drop the "Table Mode" / "Precision Grid" eyebrows, and
  selected chip black like the rest of the app.

### Step 5 — layout moves

- Menu: the category name becomes the heading, "6 dishes" a caption, a fade and
  arrow on the category row, and the mic moves inside the cart bar with an
  "Ask" label.
- Waiting: status card first, then Order more, then Water / Call staff /
  Get bill (with icons), then "While you wait" (small ad + Games + Table talk).
- Remove the Order confirmed screen and show a "Sent to the kitchen" toast on
  the Waiting screen instead (`ConfirmationView.tsx`, routing in `Index.tsx`).
- Games and Screensaver: add a food-status strip ("Your food: Cooking · ~8 min").
- Screensaver: add a small "Silver · Table T1" tag, and show the ad whole
  instead of cropped (`contain` over a blurred fill).

### Step 6 — per-order status and ETA (needs data)

- WaitingView subscribes to `kot_tickets` for the live `order_id` (INSERT and
  UPDATE) and shows one row per KOT: "1st order · Cooking".
- The top-level stepper shows the least-advanced active KOT.
- ETA: the largest `facts.prep_minutes` among items on KOTs not yet ready,
  minus minutes since that KOT was created, never below "~1 min". Hide the ETA
  when no item has `prep_minutes`.
- Rohan fills `prep_minutes` for Silver's dishes. The menu cards show
  "· 12 min" next to the price only when the value exists.

### Step 7 — needs a decision first (not started until decided)

- **Phone step:** either (a) "Get your bill on WhatsApp", which needs a
  WhatsApp sending integration (new work, separate plan), or (b) drop the phone
  step. Until decided, only the wording fix from Step 2 ships.
- **Name field:** turn `promptForIdentity` off for Silver, or keep it with
  helper text "So staff can call you".
- **Language switch (EN / हिं):** the switch itself is small, but the kiosk
  has no Hindi strings today, so this is its own project. Not in this plan.
- **Cheezious "Order now" line:** the owner's call. There's nothing to change
  in code.
- **Pre-submit nudge on the cart:** confirm why it didn't show for Avocado
  Toast + Cold Brew (no matching `meal_completion_rules` row, or a bug).

## Out of scope

- Voice pipeline code (frozen). The Ask button only opens the existing flow.
- The ~16 legacy class renames and dead-CSS cleanup noted in CLAUDE.md.
- Hindi translation.

## Verification

- `pnpm test` (vitest) in `apps/kiosk`. `aov-attribution.test.tsx` must still pass,
  because Steps 3–5 touch the pairing Add button and the cart.
- Manual pass on the Lenovo Tab K9 through the full flow: Attract → Menu → add +
  pairing → Cart → hold → Waiting → Games → Bill → phone → Bill requested →
  idle 2 min → screensaver → tap anywhere.
- Kitchen status: advance a KOT in POS and check that the Waiting row, stepper,
  ETA, Games strip and screensaver strip all update, and that the screensaver
  closes on Ready.
- After merge: refresh graphify (code and docs only) and update
  `docs/overview.md`.

## Outcome (2026-09-29)

Steps 0–2 and 6 shipped as planned. Steps 3–5 shipped except the items
below. Commits: `00af469` (Step 1), `ed717ad` (Steps 2–5), `70a668e`,
`643f705` (Step 6 + Step 7 decisions), `0259111` (mic, facts panel,
sticky footer). A follow-up pass (uncommitted at time of writing) added the
items marked "follow-up".

**Changed from the plan**
- **ETA is a fixed number, not a countdown** (follow-up). Step 6 said "minus
  minutes since the KOT was created". Rohan didn't want a timer that shrinks
  with no kitchen change. ETA is now the longest `prep_minutes` among items on
  tickets still cooking, and only moves when a ticket or order changes.
- **Games food-status strip** (follow-up): "Your food: <stage>" sits in the
  Games hero. Status only, no ETA.
- **Screensaver crash fix** (follow-up): `useKitchenStatus` now uses a unique
  realtime channel name per instance. Two watchers of one order (Waiting +
  Screensaver, or Games) collided on `order-status-<id>` and threw "cannot add
  `postgres_changes` callbacks after `subscribe()`". Test:
  `hooks/__tests__/useKitchenStatus.test.tsx`.
- Follow-up small items: pairing Add is now the orange "Add" pill; Games and
  Conversation Starters eyebrows removed; Cart has "← Back to menu" and Bill
  has "← Order status" top-left; Bill's "Continue Ordering" is "Order more".

**Step 7 decisions**
- Phone step: kept, reworded (no WhatsApp promise).
- "Order more" after a bill request: stays disabled, reason shown as text.
- Name field: off for Silver (migration 0075).
- Pre-submit nudge: data gap, `meal_completion_rules` is empty for Silver;
  author a rule in `apps/dashboard`.
- Cheezious "Order now" line: Rohan's call in the ads dashboard.
- Attract "Ask by voice" button: skipped (would mount a second
  `VoiceOrderButton`; voice code is frozen).

**Not done, left on purpose**
- Waiting-screen reorder (status card first, action icons, "While you wait"
  block).
- Screensaver blurred fill behind the contained ad.
- Mic inside the cart bar with an "Ask" label.
- Attract carousel repeating a dish when there are few chef picks (the
  three-copy loop is by design; check Silver's chef-pick count first).

**Still open**
- Silver's real `prep_minutes` values (local test data only was seeded).
- Manual pass on the Lenovo Tab K9.
- Bill screen at ~800px height: the "Ready to pay?" card covers the Total row
  (pre-existing).
