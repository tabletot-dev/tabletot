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

After any validated code change (tests pass / change confirmed working), run
`/graphify` again to refresh the graph — a stale graph gives wrong answers to
future queries. Scope refreshes to **code and docs only** (`.py`, `.ts`, `.tsx`,
`.md`, etc.) — never re-extract images or other media (screenshots, menu
photos) as part of a routine refresh; that content doesn't change with code
edits and re-extracting it burns a lot of tokens for no benefit.

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
menus/        MENU-CREATION-GUIDE.md + seed validation SQL only — menu data
              itself lives in the DB (see "Menu data" below)
packages/         shared types and utilities — currently empty
supabase/
migrations/     applied in order; never edit an existing migration
                currently at 0070
seed/           reference data only
```
## Supabase table groups (one project, three logical layers)

- **POS-owned** — `orders`, `kot_tickets`, `restaurant_tables` (JSONB-heavy,
  match apps/pos shape)
- **Tabletot-canonical** — `restaurants`, `menu_items`, `external_id_mapping`
  (clean relational; `external_id_mapping` is empty until Petpooja adapter)
- **Recommendation + analytics** — `item_pairings`, `anchor_items`,
  `meal_completion_rules` (FK to canonical layer only).
  `recommendation_events` was dropped in migration 0051. Nudge attribution
  rides the `table_events` ledger via `append_event` (`item_added` with a
  `source`), and AOV is computed from that ledger + `payments`
  (`get_aov_summary` v6, ADR 0023). `kiosk_events` (migration 0041) exists
  but has **no writer or reader** — dead, see the 2026-08-28 audit

## Menu data

Menu and restaurant config are DB-backed — there are no per-restaurant JSON
files or `restaurants.json` anymore. Every restaurant needs:
1. A row in the `restaurants` table with `slug` (format
   `{brand}-{location-short}` kebab-case), `language_code`, Sarvam
   speaker columns (migration 0028), and ElevenLabs voice-ID columns
   (migration 0064).
2. Menu rows in `menu_items` (+ `external_id_mapping` when a POS adapter
   applies). `MENU-CREATION-GUIDE.md` in `services/order-engine/menus/`
   documents the expected shape.

The order-engine loads menus and restaurant config from the DB at startup
(`load_menu_from_db`, `voice_agent/restaurant_config.py` — no JSON
fallback, startup fails loudly) and refreshes on a background task.

Current restaurants in DB:
- `silver-ssc-hyd` — Silver Specialty Coffee, Hyderabad (pilot)

## Key rules

**Recommendations:** Patterns 1, 3, 6 are SQL-only — no LLM on the touch path.
Pattern 5 (Ask AI / voice upsell) uses the two-pass LLM flow only. Never let
the LLM confirm items it didn't successfully resolve.

**Voice:** THE VOICE PIPELINE IS FROZEN — do not modify voice code unless
explicitly asked ("i dont want to create some new bugs in the voice").
PTT only. Dual-provider since 2026-08-17: `STT_PROVIDER` and `TTS_PROVIDER`
env switches, both defaulting to `elevenlabs` (STT: Scribe v2 Realtime;
TTS: `eleven_flash_v2_5`, WS closes per utterance via `CloseConnection`,
reconnects transparently), both falling back to `sarvam` with a config
flip — Sarvam handler code (saaras:v3 STT stateless per press, bulbul:v3
TTS persistent per session) is byte-for-byte untouched. ElevenLabs voice
IDs are still placeholders (Adam/Rachel) pending a listening test. LLM
responds in native script only — no romanised transliteration. See
`docs/plans/2026-08-15-elevenlabs-voice-integration.md` and ADR 0024
(always-on voice: feasible, deferred).

**Migrations:** Never edit an existing migration file. Always append a new one.
Repo is at 0070; 0064+ were applied to local Supabase — Rohan pushes remote
himself per convention. Current Silver UUID is
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

## Current status (as of 2026-08-28)

All four services deployed on Railway: kiosk, POS, dashboard, order-engine.

**Kiosk v1.0 redesign is merged to `main`** (PR #12, 2026-08-17 — the
`kiosk-redesign` branch no longer exists on the remote). Sprints 0–5
(Attract, Menu, Detail, Cart/Sent with the 2-minute kitchen hold,
Confirmation, Table Status, Bill) shipped.

**Sprints 6–7 + reduced Task 7.0 done on `kiosk-v1-sprint-6-7`**
(2026-08-30, `docs/plans/2026-08-30-kiosk-sprint-6-7.md`, not yet merged):
new Venue/About screen (16, from `restaurants.config`, migration 0071);
"About" added to the Attract secondary panel; Games / Table Talk / voice UI
classes renamed off the legacy namespace; the **Warm Espresso CSS bridge is
removed** — every `var()` in `tabletot.css` is now `--tt-*`, `design-system.md`
is retired. Left for a follow-up: renaming the ~16 pre-`.tt-` primitive
classes (`.eyebrow`, `.summary-line`, `.panel`, `.order-*`, `.bill-row`,
`.detail-mic-*`) still used by CartView/BillView/DetailView, and deleting the
~100 dead pre-v1.0 rules still in the file.

**Revenue-integrity hardening (2026-08-15/16)** followed the pre-launch
readiness assessment (`docs/notes/pre-launch-readiness-assessment.md`,
verdict: not ready on documented findings alone). AOV is now
payments-sourced (`get_aov_summary` v6, migration 0062, ADR 0023),
cancelled orders excluded from revenue and cascaded to KOT tickets
(ADR 0022), discount handling fixed, plus a batch of POS QA fixes. The
assessment's core warning — admin/POS-driven ledger interactions are
under-tested — has not been systematically re-verified since.

**Voice went dual-provider** (2026-08-17, `docs/notes/2026-08-15-elevenlabs-voice-integration-implementation.md`):
ElevenLabs default, Sarvam fallback, restaurant voice config DB-backed
(migration 0064). Deferred: manual on-device testing (Rohan's pass) and
the voice-ID listening test (placeholders seeded). Always-on voice is
feasible but deferred (ADR 0024) — PTT ships to the pilot first.

Still on a Lenovo Tab K9 for hardware testing, not yet in the restaurant.

**Pre-deployment code audit (2026-08-28)** —
`docs/notes/2026-08-28-pre-deployment-code-audit.md`. Static audit of all
three apps + the shared DB layer found 10 fixable defects (3 P0, 2 High,
3 Medium, 2 Low); all 10 are now fixed, verified, and pushed on
`claude/project-status-review-7w70cm` (migrations 0066–0070, plus kiosk and
POS commits — see the audit note's summary table for exact commit hashes
per finding). Not yet merged to `main`.

**Next major milestone:** AOV data accuracy for the pilot restaurant.
The system must produce trustworthy AOV numbers before Silver Specialty Coffee
can use them to measure lift. This means:
- nudge attribution (`table_events`, `item_added` + `source`) firing
  correctly on every pattern (post-add pairing, anchor-on-empty,
  pre-submit nudge)
- orders and order_items recorded with accurate amounts and item counts
- AOV baseline vs. nudged sessions distinguishable in the data

The redesign's Sprint 0 added a regression test
(`apps/kiosk/src/components/__tests__/aov-attribution.test.tsx`) guarding this
invariant, and Sprint 3 fixed a real attribution bug found along the way
(DetailView's pairing stepper wasn't passing `source: "pairing_chip"`).

