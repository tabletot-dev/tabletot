# Kiosk redesign — Sprint 2 done

Sprint 2 from `docs/plans/2026-08-08-kiosk-v1-redesign.md`: single-column
shell with docked bars.

## What shipped
- `AppBar`, `OrderBar`, `StatusStrip` created; `AppHeader` and
  `MiniCartSidebar` deleted along with their exclusive CSS
  (`.mini-cart-*`, `.browse-layout/-main/-content/-footer`, `.qty-btn`,
  `.qty-val`, `.mini-sent-*`, `.mini-pick-*`, `.success-mark` — all
  confirmed dead via grep before removal).
- `AppShell` rewritten: `BARE_SCREENS` is now just `["idle",
  "order-confirmation"]`, down from the old `HEADERLESS_SCREENS`
  (`idle`, `session-idle`, `bill-summary`). That's an intentional change,
  not a bug — the v1.0 pattern is header → scroll → docked bars on nearly
  every screen. Table Status and Bill now carry the AppBar; they didn't
  before.
- `OrderBar` replaces the two-pane MiniCartSidebar's per-item editing with
  a single "N items · Round X · ₹total · Review order" bar — editing now
  happens on the Cart screen. This drops inline quantity adjustment from
  the menu-adjacent rail; that's the plan's explicit design, not scope
  lost by accident (single 800px column has nowhere for a rail to live).
- Attract (`IdleScreen`) and Confirmation restyled to `.tt-attract*` /
  `.tt-confirmation*`. Attract now reads `venueName` from
  `useRestaurant()` instead of a hardcoded "SILVER / SPECIALTY COFFEE"
  string — added a `name` column read + `venueName` field to
  `restaurantContext.tsx` for this, then wired the same value into
  `AppShell`'s venue button so the header shows the real restaurant name
  too.

## Two bugs caught and fixed during this sprint, not called out by the plan
1. **Task 1.2 Step 5 was skipped in Sprint 1 and only caught now.** The
   Tailwind HSL palette in `index.css` was never retuned — `--foreground`
   was still `240 3% 91%` (near-white), so any shadcn/Tailwind-styled text
   inheriting `text-foreground` rendered nearly invisible on the new light
   `--tt-field` background. Confirmation's logo wordmark was the tell
   (a ghost of itself). Fixed now: dropped the Google Fonts `@import`,
   retuned the full HSL block to the v1.0 palette per the plan's Task 1.2
   Step 5 spec.
2. **`TabletotLogo` renders an icon *and* a "Table-Tot" wordmark stacked
   vertically**, with no way to show just the icon via props. The old
   header CSS clipped it to icon-only via a fixed-size overflow:hidden
   box; my new `.tt-appbar-brand`/`.tt-attract-logo`/`.tt-confirmation-logo`
   didn't, so the wordmark doubled up next to AppBar's own "Tabletot"
   label. Fixed by sizing the `svg` directly and hiding `.font-display`
   within each of those three contexts — cheaper than touching the shared
   component, which is used in a few other places (e.g. CartView's
   submitting overlay) I didn't want to risk.

## Verified
Full `npm run build && npm test` green throughout. Visual walkthrough via
gstack `/browse` at 800×1280 with local Supabase: Attract → Menu (OrderBar
populates correctly, pairing panel still fires) → Cart → Confirmation →
Table Status (now with AppBar) → Bill (now with AppBar) → Bill phone entry
(preserved family, unaffected). Didn't get a fresh post-fix Attract
screenshot specifically (session state is server-authoritative via
`get_table_state`, not reset by clearing local/session storage) — inferred
correct rendering from the identical, separately-verified fix on the
Confirmation screen, which shares the same CSS pattern.
