# Working in tabletot-pilot

This repo is a tablet-based ordering + recommendation system for Indian dine-in
restaurants. Pilot 1: Silver Specialty Coffee, Hyderabad. Solo developer (Rohan).

## What this system does

Tabletot is a layer **above** whatever POS a restaurant uses. The core value
proposition is measurable AOV lift through contextual, human-curated
recommendations — post-add pairing nudges, anchor-on-empty chef's picks, and
pre-submit completion nudges. Touch is the primary ordering path. Voice is an
add-on feature. The internal canonical menu model is Tabletot's own; Petpooja
and Tabletot POS are peer adapters.

## Codebase exploration

**IMPORTANT: Use `/graphify` BEFORE using Grep/Glob/Read to explore the codebase.**
The knowledge graph is faster, cheaper (fewer tokens), and gives structural context
(callers, dependents, relationships) that file scanning cannot.

- **Exploring code, finding symbols**: `/graphify` first, grep as fallback
- **Understanding impact of a change**: `/graphify`
- **Architecture questions**: `/graphify`

Fall back to Grep/Glob/Read **only** when graphify doesn't cover what you need.

## Read these before making changes

1. `docs/overview.md` — current state of the project, what's in scope right now.
2. `docs/decisions/` — list filenames; read any ADR relevant to what you're
   about to touch. ADRs are numbered and named by topic.

## When you make a meaningful decision

- **Architectural?** Propose a new ADR using `docs/decisions/_template.md`.
  Never edit existing ADRs. To replace one, write a new ADR and mark the
  old one as superseded in its frontmatter.
- **Smaller?** Add a note to `docs/notes/`, or update `docs/overview.md` if
  the project state has changed.

## When uncertain

- Ask. Don't guess about architecture, naming conventions, or where files
  should live. Cheap to ask, expensive to undo.

## Repo layout
```
apps/
kiosk/          customer-facing PWA (React, Vite). Primary surface.
src/components/screens/ — one file per view
src/lib/menuStore.tsx  — single hook for all menu data
src/styles/tabletot.css — design system (do not edit lightly)
pos/            restaurant management app (auth, KOT, billing, tables)
dashboard/      recommendation curation + AOV measurement
services/
order-engine/   FastAPI backend: voice pipeline, LLM resolver, menu loader
menus/        one JSON per restaurant (see MENU-CREATION-GUIDE.md)
backend/config/restaurants.json — speaker + language config per restaurant
packages/         shared types and utilities — currently empty
supabase/
migrations/     applied in order; never edit an existing migration
                currently at 0036 + remote schema (2026-05-29)
seed/           reference data only
```
## Supabase table groups (one project, three logical layers)

- **POS-owned** — `orders`, `kot_tickets`, `restaurant_tables` (JSONB-heavy,
  match apps/pos shape)
- **Tabletot-canonical** — `restaurants`, `menu_items`, `external_id_mapping`
  (clean relational; `external_id_mapping` is empty until Petpooja adapter)
- **Recommendation + analytics** — `item_pairings`, `anchor_items`,
  `meal_completion_rules`, `recommendation_events` (FK to canonical layer only)

## Menu files

Every restaurant needs two things:
1. `services/order-engine/menus/<id>.json` — follow `MENU-CREATION-GUIDE.md`
   exactly. ID format: `{brand}-{location-short}` kebab-case.
2. An entry in `services/order-engine/backend/config/restaurants.json`

Current restaurants in DB:
- `silver-ssc-hyd` — Silver Specialty Coffee, Hyderabad (pilot)

## Key rules

**Recommendations:** Patterns 1, 3, 6 are SQL-only — no LLM on the touch path.
Pattern 5 (Ask AI / voice upsell) uses the two-pass LLM flow only. Never let
the LLM confirm items it didn't successfully resolve.

**Voice:** THE VOICE PIPELINE IS FROZEN — do not modify voice code unless
explicitly asked ("i dont want to create some new bugs in the voice").
PTT only. STT WebSocket is stateless per press (Sarvam saaras:v3).
TTS WebSocket is persistent per session (Sarvam bulbul:v3, 30s keepalive).
LLM responds in native script only — no romanised transliteration.

**Migrations:** Never edit an existing migration file. Always append a new one.
Migrations 0009–0036 are applied. Current Silver UUID is
`b22b5d53-6dd8-4f5b-8276-2e828cd1ab91` (pinned in migration 0014).

**Env vars:** `VITE_RESTAURANT_ID` and `VITE_TABLE_ID` are set in
`apps/kiosk/.env.local`. All four services have env vars configured in Railway.

**Local dev ports:** kiosk 8080, POS 8081, dashboard 8082.

**Images:** `menu_items.image_url` is nullable. DishCard, CartView, and
WaitingView all fall back to category-gradient placeholders when null — do not
remove the fallback.

**Dashboard:** `apps/dashboard` is curation-only — recommendation rules,
pairings, anchor items. It is not a menu CRUD tool. Menu CRUD belongs in
apps/pos and only for restaurants without their own POS admin.

## Current status (as of 2026-06-03)

All four services deployed on Railway: kiosk, POS, dashboard, order-engine.

**Active phase:** Hardware testing on a Lenovo Tab K9. Not yet in the
restaurant. Fixing bugs surfaced by real-device usage.

**Next major milestone:** AOV data accuracy for the pilot restaurant.
The system must produce trustworthy AOV numbers before Silver Specialty Coffee
can use them to measure lift. This means:
- recommendation_events firing correctly on every pattern (post-add pairing,
  anchor-on-empty, pre-submit nudge)
- orders and order_items recorded with accurate amounts and item counts
- AOV baseline vs. nudged sessions distinguishable in the data

