# Changelog — Dashboard

Recommendation curation and AOV measurement app (internal, port 8081).

---

## [Unreleased]

### Added
- "New version available — Refresh" banner when a newer deploy exists (never auto-reloads, to protect unsaved edits). Build writes `version.json`.

The dashboard is now the single editor for everything the kiosk shows — ADR 0025 (supersedes 0008). Plan: `docs/plans/2026-09-29-dashboard-kiosk-editor.md`.

- **Menu screen** (`pages/MenuItems.tsx`) — edit name, price, category, description, Veg/Non-Veg, on/off, tags, photo upload and dish facts (`menu_items.facts`: prep minutes, calories, allergens, spice, ingredients, notes). Dishes are switched off, never deleted. Saving refreshes the voice engine's menu (`VITE_VOICE_ENGINE_URL` / `VITE_VOICE_ADMIN_KEY`). Photo uploads need migration 0076.
- **Venue screen** (`pages/Venue.tsx`) — hours, chef name/note, street address, Wi-Fi name + password (blank = open network), GST rate, voice and "ask for a name" switches. Saves merge into `restaurants.config`, keeping unknown keys.
- **Completion Rules editable** (`pages/CompletionRules.tsx`) — form for the two rule shapes the kiosk reads; other shapes show as read-only "Custom rule".
- `pnpm test` runs the pure-helper self-checks (`src/lib/*.test.ts`, node's built-in runner).

### Fixed

- **GST save** — the shared `gst_rate` row is written with update-then-insert; `upsert(onConflict: 'key')` fails because the unique index on `key` is partial.

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
