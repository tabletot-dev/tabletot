# tabletot-pilot — overview

> Living document. Update when the state of the project changes meaningfully.
> Last updated: 2026-08-02

## What this is

Tablet-based ordering and recommendation system for Indian casual dine-in
restaurants. Customers tap (and optionally speak) their order at the table.
The system's distinctive claim is **measurable AOV lift through curated,
contextual recommendations** — acting like a trained 5-star server,
tunable per restaurant.

Pilot 1: **Silver Specialty Coffee, Hyderabad.**

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
  → response generation), Gemini (gemini-3.1-flash-lite), prompt-driven.
- **Stage 3** — Voice pipeline: Sarvam STT (saaras:v3) + TTS (bulbul:v3),
  FastAPI backend, voice CLI, voice-test-page React frontend.

Tests: 136/136 unit, 98/98 batch, 46/48 natural speech (96%).
Menu (Silver SSC): 49 items in DB (migration 0009); voice engine index entry count TBD — run `python -m cli.interactive` to verify,
38 categories.

## Session state architecture — table_events ledger (2026-07-12)

Order/session lifecycle now runs on a single append-only ledger (`table_events`)
with one server-side writer, the `append_event()` RPC. The kiosk is stateless:
it boots from `get_table_state()` and survives power-cycles. See
**ADR 0019** (`docs/decisions/0019-table-events-ledger.md`) for the full
rationale; it supersedes 0010, 0014, and 0017.

- **Migrations 0047–0056.** 0047 ledger tables + `append_event` core +
  `get_table_state`; 0048 `order_submitted`; 0049 `bill_requested` /
  `payment_settled` (retires the 0019 table-free trigger); 0050
  `get_aov_summary` v4 (span-deduped, reads the ledger); 0051 drops the dead
  `recommendation_events` table; 0052 adds `service_ended` (**ADR 0020**) +
  KOT `special_notes`/`modifiers`; 0053–0054 fix KOT-archive survival/ordering
  (found while verifying 0052); 0055 propagates KOT `archived` → order
  `served` and resets order status on round merge; 0056 revokes the
  now-unnecessary anon direct-write RLS grants on `orders`/`sessions`.
- **Kiosk + POS** submit, settle, add-items, and end-service all go through
  `append_event`. `sessionStorage` holds UI identity only, never lifecycle
  state. No direct-write path remains — `SettleBillModal`/`POSLayout` (the
  last one) were dead code with zero importers and were deleted rather than
  migrated (2026-08-02).
- **Regression harness:** `cd apps/kiosk && SUPABASE_SERVICE_ROLE_KEY=… `
  `SUPABASE_PUBLISHABLE_KEY=… npm run test:golden` (11 tests, local Supabase —
  the 12th tested the now-deleted pre-ledger `submit_order` RPC).

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
- **LLM:** Gemini gemini-3.1-flash-lite (intent extraction + response generation, two-pass)
- **Backend:** FastAPI (Python), Supabase Postgres (ap-south-1)
- **Frontend:** React PWA, Vite, evolving from tabletot frontend PoC
- **Infra:** Monorepo + Docker Compose, local-first dev

## Open questions

Maintained inline as `#open-question` tags in notes. Promote to ADRs
when a decision is made.
