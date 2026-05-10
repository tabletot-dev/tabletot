# Changelog — POS App

Restaurant management app: KOT display, order management, billing, tables.

---

## [Unreleased]

_No unreleased changes._

---

## [0.3.0] — 2026-04-30

### Added

- **Menu management page** (`src/pages/Menu.tsx`) — view, add, edit, and soft-delete menu items directly in the POS. Writes to `menu_items` table; does not touch `external_id_mapping` (Petpooja adapter is post-pilot).
- **AOV lift readout** — cohort A/B measurement summary visible in the curation section. Calls `recommendation_aov_lift_cohort` DB function; shows treatment vs. control average order value and Welch's t-stat.

---

## [0.2.0] — 2026-04-29

### Added

- **Recommendation curation dashboard** (`src/pages/Curation.tsx`) — manage anchor items and item pairings used by the kiosk recommendation engine. Reads/writes `anchor_items` and `item_pairings` tables.
- **KOT Realtime subscription** — POS KOT view subscribes to `kot_tickets` via Supabase Realtime (`postgres_changes`); new tickets appear without polling.

### Changed

- **Schema rewrite** — migrated from a kiosk-shaped PoC schema to the POS-native schema (`orders`, `kot_tickets` with JSONB `items` column). `submitOrder()` rewritten to match. Types regenerated.
- **Migrations 0001–0006** — POS-native schema, internal canonical tables, Realtime enrollment for `orders` + `kot_tickets` + `menu_items`.

---

## [0.1.0] — 2026-04-29

### Added

- Initial POS PoC import — basic order list and KOT display.
- Supabase client wiring with local dev config.
