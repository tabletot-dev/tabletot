---
status: accepted
date: 2026-05-08
tags: [architecture, pos, menu-model, adapters]
---

# 0005 — POS-agnostic recommendation layer via Tabletot canonical menu

## Context

Tabletot is positioned as a layer above whatever POS a restaurant uses.
Pilot 1 (Silver Specialty Coffee) has no existing POS — they will use the
Tabletot POS directly. Future restaurants may run Petpooja.

The recommendation engine (pairings, anchor items, completion rules) needs
to reference menu items by a stable internal ID. If we used POS-native IDs
directly, every restaurant integration would require reworking the
recommendation tables and order-engine logic.

Additionally, the order-engine's menu resolver was built against a JSON
file format, not a POS API. It needed to remain decoupled from any single
POS's data model.

## Decision

Tabletot maintains its own canonical menu model in Supabase:

- `menu_items` — the authoritative item list, owned by Tabletot
- `external_id_mapping` — maps Tabletot item UUIDs to external POS IDs
  (empty until a POS adapter is needed)

Recommendation tables (`item_pairings`, `anchor_items`, `meal_completion_rules`)
foreign-key only to `menu_items.id` — never to POS-native IDs.

For restaurants with an existing POS (e.g. Petpooja), an adapter is
responsible for:
1. Populating `menu_items` from the POS menu
2. Filling `external_id_mapping` so orders can be forwarded back to the POS

The Tabletot POS (`apps/pos`) and the kiosk (`apps/kiosk`) are both
consumers of the canonical layer, not owners of it.

## Alternatives considered

- **Use Petpooja item IDs directly everywhere** — rejected. Ties the entire
  recommendation system to one POS vendor. Migration cost if a restaurant
  switches POS is enormous.
- **Per-restaurant schema / separate Supabase projects** — rejected.
  Operational complexity is too high for a solo developer at pilot stage.
  One project, shared schema, restaurant-scoped via `restaurant_id` column.
- **Order-engine owns the canonical menu (JSON files only)** — rejected.
  JSON files in `services/order-engine/menus/` work for the voice/LLM path
  but cannot serve the kiosk's real-time availability or the dashboard's
  curation UI. Supabase is the source of truth; JSON files are a
  development-time seed artifact.

## Consequences

- Every new restaurant requires a data migration to populate `menu_items`
  before recommendations can be curated. The `external_id_mapping` table
  starts empty and is filled by the adapter.
- The Petpooja adapter doesn't exist yet. When it's built, it writes to
  `menu_items` and `external_id_mapping`; the recommendation layer doesn't
  change.
- Menu CRUD for restaurants without their own POS admin belongs in
  `apps/pos`, not in the dashboard. The dashboard is curation-only.
- `VITE_RESTAURANT_ID` is the pivot point for all multi-tenancy. Every
  Supabase query in every app scopes to this ID. Missing or wrong UUID
  causes silent empty results — not an error.
