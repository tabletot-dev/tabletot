---
status: superseded by 0025
date: 2026-05-08
tags: [dashboard, architecture, scope]
---

# 0008 — Dashboard is curation-only; menu CRUD belongs in POS

## Context

`apps/dashboard` was built to give restaurant owners a way to tune the
recommendation system: configure which items are anchor picks, which items
pair with which, and what completion nudges to show.

During design there was a question of whether the dashboard should also
handle menu management (adding, editing, and disabling menu items). This
would make it a single tool for all owner-side operations.

## Decision

The dashboard is curation-only. Its scope is:

- **Anchor Items** — which items appear in the chef's picks carousel
- **Item Pairings** — which items are suggested after a cart add
- **Meal Completion Rules** — pre-submit nudges
- **AOV Lift** — read-only analytics on recommendation acceptance rates

Menu CRUD (creating, editing, pricing, enabling/disabling items) belongs
in `apps/pos`. For restaurants without their own POS admin UI (e.g. Silver
Specialty Coffee), the Tabletot POS Menu page is the management surface.

## Alternatives considered

- **Dashboard handles both curation and menu CRUD** — rejected. The two
  audiences are different. Curation is a periodic owner task ("tune what
  gets recommended"). Menu management is an operational task ("86 the
  avocado toast, it's sold out"). Mixing them creates a cluttered tool
  that does neither job cleanly.
- **Separate app per owner function** — rejected. Too many surfaces for a
  solo developer to maintain. POS already exists; add Menu management there.
- **Supabase Studio for everything** — acceptable stopgap for pilot (Rohan
  can seed data directly), but not a viable owner-facing tool. The dashboard
  exists to give the owner a UI that doesn't require database access.

## Consequences

- The dashboard's Supabase queries only touch the recommendation layer:
  `anchor_items`, `item_pairings`, `meal_completion_rules`,
  `recommendation_events`. It reads `menu_items` for the item picker
  dropdowns but never writes to it.
- `VITE_RESTAURANT_ID` in `apps/dashboard/.env.local` must be set to the
  correct restaurant UUID. If it points at a placeholder, every page shows
  empty — the queries succeed but return zero rows, with no visible error.
- Completion Rules has no editor UI yet — the page is read-only for pilot.
  Rules are seeded directly in Supabase Studio during the owner session.
  A rule editor UI is planned post-pilot.
- AOV Lift data only appears after the first recommendation event is logged
  from the live kiosk. It will be empty during local development.
