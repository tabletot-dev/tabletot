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
src/lib/menuStore.ts   — single hook for all menu data
src/styles/tabletot.css — design system (do not edit lightly)
pos/            restaurant management app (auth, KOT, billing, tables)
dashboard/      recommendation curation + AOV measurement (port 8081)
services/
order-engine/   FastAPI backend: voice pipeline, LLM resolver, menu loader
menus/        one JSON per restaurant (see MENU-CREATION-GUIDE.md)
backend/config/restaurants.json — speaker + language config per restaurant
packages/         shared types and utilities — currently empty
supabase/
migrations/     applied in order; never edit an existing migration
0009 — Silver Specialty Coffee restaurant + menu_items
0010 — item_pairings + anchor_items (Silver)
0011 — image_url column on menu_items
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
- `roast-ccx-hyd` — Roast CCx, Hyderabad (seeded, not pilot)

## Key rules

**Recommendations:** Patterns 1, 3, 6 are SQL-only — no LLM on the touch path.
Pattern 5 (Ask AI / voice upsell) uses the two-pass LLM flow only. Never let
the LLM confirm items it didn't successfully resolve.

**Voice:** PTT only. STT WebSocket is stateless per press (Sarvam saaras:v3).
TTS WebSocket is persistent per session (Sarvam bulbul:v3, 30s keepalive).
LLM responds in native script only — no romanised transliteration.

**Migrations:** Never edit an existing migration file. Always append a new one.
Run `validate_silver_seed.sql` after applying 0009–0011 to confirm counts.

**Env vars:** `VITE_RESTAURANT_ID` must be set to the Silver Specialty Coffee
UUID after migration 0009 is applied. `VITE_TABLE_ID` is required for order
submission. Both are in `.env.example` with TODO comments marking every usage
site in source.

**Images:** `menu_items.image_url` is nullable. DishCard, CartView, and
WaitingView all fall back to category-gradient placeholders when null — do not
remove the fallback.

**Dashboard:** `apps/dashboard` is curation-only — recommendation rules,
pairings, anchor items. It is not a menu CRUD tool. Menu CRUD belongs in
apps/pos and only for restaurants without their own POS admin.

## What's next (ordered)

1. Apply migrations 0009 → 0010 (fix cold-brew pairing first) → 0011
2. Set `VITE_RESTAURANT_ID` to Silver UUID; set `VITE_TABLE_ID`
3. Seed `image_url` from Unsplash placeholders (see tabletot-redesign.html)
4. Step 7 — ADRs 0004–0008 (solo)
5. Step 8 — manual E2E test
6. Owner session — populate `meal_completion_rules`
7. Pilot launch