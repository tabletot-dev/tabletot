# Changelog — Dashboard

Recommendation curation and AOV measurement app (internal, port 8081).

---

## [Unreleased]

_No unreleased changes._

---

## [0.1.0] — 2026-04-30

### Added

- **Initial scaffold** — standalone Vite + React app for recommendation curation, split out from the POS app so restaurant owners have a focused curation surface without access to billing and KOT functions.
- **Pairings editor** — view, add, and remove `item_pairings` rows. Scoped to `VITE_RESTAURANT_ID`.
- **Anchor items editor** — view, add, and remove `anchor_items` rows (Chef's Picks shown when cart is empty on the kiosk).
- **AOV lift readout** — calls `recommendation_aov_lift_cohort` DB function; displays treatment vs. control average order value, delta, and Welch's t-stat for the active restaurant.
- **Supabase client** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` + `VITE_RESTAURANT_ID` env vars (mirrors kiosk config).

### Notes

- `meal_completion_rules` management UI is not yet built. Rules must be inserted via Supabase Studio or a one-off SQL script until the owner session populates them.
- This app is curation-only. Menu CRUD (add/edit items, prices) stays in the POS app.
