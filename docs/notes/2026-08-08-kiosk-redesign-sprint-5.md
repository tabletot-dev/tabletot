# Kiosk redesign — Sprint 5 done (Status and Bill)

Sprint 5 from `docs/plans/2026-08-08-kiosk-v1-redesign.md` — the last
sprint of "simple scope." **Sprints 0–5 are now fully shipped and
committed on `kiosk-redesign`.**

## What shipped
- **Table Status (`WaitingView`)**: percentage progress bar replaced with
  a discrete 4-stage strip (`.tt-stages` — Queued · Cooking · Plating ·
  Served), only the current stage filled. `served` label renamed "Done" →
  "Served". Dropped the `pct` field entirely — nothing else read it.
- **Promos moved out of hardcoded kiosk code** and into
  `restaurants.config.promos` (added `venueName`'s sibling, `promos:
  Promo[]`, to `restaurantContext.tsx`). When a restaurant has none
  configured, the slideshow slot renders nothing — verified this by
  seeding a local test config, confirming the promo renders, then
  reverting the local DB back to its original state.
- **Bill (`BillView`)**: dropped the duplicated local `TAX_RATE` in favor
  of the shared `computeTotals()` (matches Sprint 4's `CartView`). Bill is
  now grouped by round ("Round 1 · Sent", "Round 2 · Sent", ...) instead
  of a flat item list. Phone-entry validation logic (the `/^[6-9]\d{9}$/`
  check) is untouched, only restyled — and reuses the existing
  `.tt-modal`/`.tt-field` system instead of introducing bespoke
  `.bill-phone-*` classes, since the phone step already *is* a modal.
- Consolidated CSS cleanup: `.bill-view`, `.bill-flow-*`, `.bill-phone-*`
  (the three families explicitly preserved through Task 1.2's original
  cut, specifically for this moment) plus `.split-layout`/`.scroll-panel`/
  `.summary-panel` (dead now that both CartView and BillView are
  rebuilt) — 32 rules removed, 10 dead selectors stripped from shared
  rules.
- Added supersession notices to `docs/design-system.md` and
  `docs/kiosk-visual-design-current.md` rather than rewriting them —
  both are still accurate for Games/Table Talk/voice (unrebuilt,
  Sprints 6–7), so a full replacement now would be premature and the
  plan's own Task 7.0 is the right trigger for that.

## Verified
`npm run build && npm test` green (17 tests, unchanged from Sprint 4 —
this sprint touched no new logic paths that needed their own tests).
Full visual walkthrough via `/browse`: Table Status (4-stage strip with
correct active state, promo rotating from config), Bill (round grouping,
totals, phone modal end-to-end including a real `bill_requested` submit
through to "Bill coming your way").

## What's next
Simple scope (Sprints 0–5) is the whole visual story per the plan's own
framing — this is the point to show the client and decide on Sprint 6
(Games/Table Talk restyle) and Sprint 7 (voice UI restyle, frozen pipeline
untouched). Also still open from the plan's Manual Steps: Sentry DSN,
Railway env vars, portrait lock at the OS level, and a re-audit of
`CLAUDE.md`'s "Current status" section (still dated 2026-06-03, predates
this whole redesign) — flagging that one rather than editing it, since
it's a project-status call, not a docs-accuracy one.
