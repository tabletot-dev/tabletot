# Attract screen (Screen 01) rebuilt to reference spec

The client supplied an exact reference screenshot for the Attract/Welcome
screen (`IdleScreen.tsx`). It was rebuilt to match pixel-for-pixel, which
required three decisions that diverge from the earlier Task 2.3 note in
`docs/plans/2026-08-08-kiosk-v1-redesign.md`:

1. **Logo mark.** The reference uses a black-square "T" icon instead of the
   old circle-triangle mark. Since `TabletotLogo.tsx` is shared, the icon
   artwork changed globally — every screen that renders it (AppBar,
   Confirmation, BillView, CartView's submitting overlay) now shows the new
   mark. No other screen's layout or sizing changed.

2. **About link.** "About Silver — chef's note, our story →" has no
   destination yet — there is no about/story content anywhere in the
   codebase. It fires the existing `onInfoToast` toast pattern (same one
   `HomeView` uses for Dietary Info / Wi-Fi) with placeholder copy. Building
   real About content is a separate, unscoped task.

3. **Venue copy.** "Silver" / "Specialty Coffee" and "Wi-Fi: SILVER-GUEST"
   are hardcoded in `IdleScreen.tsx` for this pilot, not derived from
   `venueName` via `useRestaurant()`. Task 2.3 originally said the opposite
   ("the pilot venue's name does not belong compiled into shared kiosk
   code") — this is a deliberate, client-directed exception for Silver
   Specialty Coffee. If a second restaurant onboards, this screen needs the
   copy parameterized before reuse.

## Update: Attract now skips HomeView, goes straight to Menu

`IdleScreen`'s `onActivate` (in `Index.tsx`) was rerouted from
`setCurrentScreen("home")` to `setCurrentScreen("menu")`, calling
`startSession()` first — the same call `HomeView`'s "Start Ordering" makes,
required so `recommendation_events`/order events get a `span_id` to
attribute to (see the AOV note in the top-level `CLAUDE.md`). Tapping the
Attract screen (or the hero About-adjacent CTA) now lands the guest directly
on `MenuView`.

`HomeView.tsx` and its `"home"` case in `Index.tsx`'s `renderScreen()`
switch are untouched and still reachable in code — nothing was deleted, the
flow just no longer routes through it. Revert by pointing `onActivate` back
at `"home"` if this needs to come back.
