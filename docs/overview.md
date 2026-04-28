# tabletot-pilot — overview

> Living document. Update when the state of the project changes meaningfully.
> Last updated: 2026-04-28

## What this is

Tablet-based ordering and recommendation system for Indian casual dine-in
restaurants. Customers tap (and optionally speak) their order at the table.
The system's distinctive claim is **measurable AOV lift through curated,
contextual recommendations** — acting like a trained 5-star server,
tunable per restaurant.

Pilot 1: **Roast CCx, Hyderabad.**

## Product positioning

- For restaurants **without** a POS: tabletot is a standalone product
  (kiosk PWA + tabletot POS as the backend).
- For restaurants **with** Petpooja: tabletot is a layer on top
  (kiosk PWA + Petpooja API as the backend; tabletot POS not deployed).

The recommendation engine is POS-agnostic — same logic, two adapters
underneath. See [[0002-pos-agnostic-recommendation-layer]] when written.

## Build status

Three stages already shipped (in `services/order-engine/`). Detailed history: (in `services/order-engine/CHANGELOG.md`):

- **Stage 1** — Menu resolver: deterministic 5-step matching cascade,
  time-of-day availability, alias support.
- **Stage 2** — LLM intent extraction: two-pass flow (intents → resolver
  → response generation), Claude Sonnet, prompt-driven.
- **Stage 3** — Voice pipeline: Sarvam STT (saaras:v3) + TTS (bulbul:v3),
  FastAPI backend, voice CLI, voice-test-page React frontend.

Tests: 136/136 unit, 98/98 batch, 46/48 natural speech (96%).
Menu (Roast CCx): 285 items, 66 variants, ~440 index entries, 191 aliases,
38 categories.

## What's next (Stage 4)

Recommendation system + PWA evolution. Four patterns selected:

1. **Post-add pairing nudge** — inline "goes well with" on addToCart. SQL-only.
2. **Anchor-on-empty** — Chef's Picks / bestsellers when cart is empty. SQL-only.
3. **Ask AI soft upsell** — voice path, two-pass LLM weaves curated pairings.
4. **Pre-submit review nudge** — gentle completion suggestion. SQL-only.

Touch path stays LLM-free. Voice path uses two-pass. Same curation data
underneath, two render paths on top.

## Active sequence (this week)

0. **Kill Google Sheets middleware** between kiosk and POS; wire direct
   Supabase writes. Prerequisite for everything else.
1. Schema: 4 recommendation tables + POS mapping table, in shared Supabase.
2. Menu reconciliation: load `services/order-engine/menu.json` into
   tabletot POS Supabase + our enrichment tables.
3. Self-curation pass on the 285-item menu (Rohan as proxy owner). v0 ruleset.
4. Curation dashboard (hard cap: 2-3 days). Brutally simple.
5. Graft voice mechanics from `apps/voice-test-page` into `apps/kiosk`.
6. Wire patterns 1 and 3 (the SQL-only ones) into kiosk.

## Tech stack reference

- **STT:** Sarvam saaras:v3 (WebSocket, `language_code=unknown` auto-detect)
- **TTS:** Sarvam bulbul:v3 (WebSocket streaming, persistent per session,
  codec `linear16`, message type `text`, completion event `final`)
- **LLM:** Claude Sonnet (intent extraction + response generation, two-pass)
- **Backend:** FastAPI (Python), Supabase Postgres (ap-south-1)
- **Frontend:** React PWA, Vite, evolving from tabletot frontend PoC
- **Infra:** Monorepo + Docker Compose, local-first dev

## Open questions

Maintained inline as `#open-question` tags in notes. Promote to ADRs
when a decision is made.
