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
                currently at 0076
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
`main` is at 0076, and the remote Supabase is in sync (`supabase migration
list --linked` confirmed 0001–0076 applied on 2026-09-29; 0074–0076 were
pushed that day). Rohan pushes remote himself per convention. Current Silver UUID is
`b22b5d53-6dd8-4f5b-8276-2e828cd1ab91` (pinned in migration 0014).

**Env vars:** `VITE_RESTAURANT_ID` and `VITE_TABLE_ID` are set in
`apps/kiosk/.env.local`. All four services have env vars configured in Railway.

**Local dev ports:** kiosk 8080, POS 8081, dashboard 8082.

**Images:** `menu_items.image_url` is nullable. DishCard, CartView, and
WaitingView all fall back to category-gradient placeholders when null — do not
remove the fallback.

**Dashboard:** `apps/dashboard` is the single editor for everything the
kiosk shows (ADR 0025, supersedes 0008): menu items + dish facts, venue
info, completion rules, anchors, pairings, ads. Admin only. `apps/pos` runs
orders only, plus a sold-out switch (`menu_items.active`) and its Settings
page (GST). Dishes are switched off, never deleted. Plan:
`docs/plans/2026-09-29-dashboard-kiosk-editor.md`.

## Current status (as of 2026-09-23)

All four services deployed on Railway: kiosk, POS, dashboard, order-engine.

**Kiosk v1.0 redesign is merged to `main`** (PR #12, 2026-08-17 — the
`kiosk-redesign` branch no longer exists on the remote). Sprints 0–5
(Attract, Menu, Detail, Cart/Sent with the 2-minute kitchen hold,
Confirmation, Table Status, Bill) shipped.

**Sprints 6–7 + reduced Task 7.0 are merged to `main`**
(2026-08-30, `docs/plans/2026-08-30-kiosk-sprint-6-7.md`): new Venue/About
screen (16, from `restaurants.config`, migration 0071); "About" added to
the Attract secondary panel; Games / Table Talk / voice UI classes renamed
off the legacy namespace; the **Warm Espresso CSS bridge is removed** —
every `var()` in `tabletot.css` is now `--tt-*`, `design-system.md` is
retired. Left for a follow-up: renaming the ~16 pre-`.tt-` primitive
classes (`.eyebrow`, `.summary-line`, `.panel`, `.order-*`, `.bill-row`,
`.detail-mic-*`) still used by CartView/BillView/DetailView, and deleting the
~100 dead pre-v1.0 rules still in the file.

**`kiosk-v1-sprint-6-7` branch still exists and is not merged** — but only
because it has since grown a **voice channel redesign** on top of the
already-landed Sprints 6–7 work: screens 06/07/08
(`VoiceDockPanel`, `VoiceConversationScreen`, `EarlierStrip`,
`VoiceAnswerCard`, `useMicLevels`), 14 commits, latest `7399b60` ("Add
voice single-surface rework plan", 2026-08-31). Specs:
`docs/plans/2026-08-30-voice-channel-redesign-spec.md`,
`docs/plans/2026-08-30-voice-channel-redesign.md`,
`docs/plans/2026-08-31-voice-single-surface-rework.md`. Needs a rebase
onto current `main` before merging or resuming.

**Since 2026-09-04, merged to `main` (latest commit `75367c2`,
2026-09-20):**
- Structured per-item **facts** (migration 0072, `menu_items.facts` jsonb
  — calories/allergens/spice level/prep time/ingredients) feeding the LLM
  menu summary, with a truth rule barring the model from estimating any
  fact not present.
- Admin-managed **ad carousel** on the kiosk waiting screen (migration
  0073, new `ads` table, RLS-gated to `active = true` for anon), curated
  from `apps/dashboard`, replacing the old `restaurants.config.promos`
  blob.
- A run of voice/POS bugfixes: voice modal crash from Product Detail,
  mic access + back-to-order navigation fixes, recommendation card image
  cropping, idle-kiosk auto-navigation on POS-started orders, filter-intent
  losing attribute/category, a TTS reconnect race silently dropping
  sentences, POS Add Items dialog scroll/close, voice modal left open
  after a POS-ended session.
- Migrations 0071–0073 are applied to the remote Supabase (confirmed
  2026-09-29).

**Dashboard-as-kiosk-editor (2026-09-29)** is merged to `main` (PR #25,
`192d665`; ADR 0025): dashboard Menu, Venue and editable Completion Rules
screens; POS Sold-out page replaces the POS menu editors; POS admin sidebar
links to the dashboard (`VITE_DASHBOARD_URL`); kiosk reads Wi-Fi + address
from `restaurants.config` and generates the Wi-Fi QR. Migration 0076
(menu-images bucket policies, staff-only writes) is on remote. Railway env:
dashboard needs `VITE_VOICE_ENGINE_URL` + `VITE_VOICE_ADMIN_KEY` (post-save
voice refresh); POS needs `VITE_DASHBOARD_URL`; all three services need a
rebuild to pick up build-time vars. Still to do by hand: replace the
placeholder chef name/note (Venue screen), fill Silver's real
`prep_minutes`, and check remote `restaurant_settings` for a per-restaurant
`gst_rate` override row (kiosk prefers it over the shared row the dashboard
and POS edit).

**Kiosk UX-audit fixes + games redesign (2026-09-29)** are merged to
`main` (PR #24, `79fdb3d`): egg dishes fixed to Non-Veg,
per-order kitchen status + a fixed (non-countdown) ETA from
`menu_items.facts.prep_minutes`, dish-detail facts card, Order-confirmed
screen removed, screensaver/Games "Your food" strip. Adds migrations 0074
(egg data) and 0075 (Silver name prompt off), pushed to remote 2026-09-29. Plan + outcome:
`docs/plans/2026-09-28-kiosk-ux-audit-fixes.md`. Silver's real
`prep_minutes` still need filling in.

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
3 Medium, 2 Low); all 10 are fixed, verified, and **merged to `main`**
via PRs #13–#15 on 2026-08-30 (migrations 0066–0070, plus kiosk and POS
commits — see the audit note's summary table for exact commit hashes per
finding). Migrations 0066–0070 were applied to the remote Supabase the
same day (commit `90deb91`, which also regenerated the Supabase types).
The `claude/project-status-review-7w70cm` branch is now fully contained
in `main`.

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

