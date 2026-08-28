# tabletot-pilot — overview

> Living document. Update when the state of the project changes meaningfully.
> Last updated: 2026-08-28

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

Four stages already shipped (in `services/order-engine/`). Detailed history: (in `services/order-engine/CHANGELOG.md`):

- **Stage 1** — Menu resolver: deterministic 5-step matching cascade,
  time-of-day availability, alias support.
- **Stage 2** — LLM intent extraction: two-pass flow (intents → resolver
  → response generation), Gemini (gemini-3.1-flash-lite), prompt-driven.
- **Stage 3** — Voice pipeline: Sarvam STT (saaras:v3) + TTS (bulbul:v3),
  FastAPI backend, voice CLI, voice-test-page React frontend.
- **Stage 4** — Recommendation patterns wired into the kiosk (post-add
  pairing, anchor-on-empty, pre-submit nudge — SQL-only touch path),
  curation dashboard, voice grafted into the kiosk. Attribution guarded by
  `apps/kiosk/src/components/__tests__/aov-attribution.test.tsx`.

Since then (all merged to `main` via PR #12, 2026-08-17):

- **Kiosk v1.0 visual redesign** — Sprints 0–5 shipped
  (`docs/plans/2026-08-08-kiosk-v1-redesign.md`); Games, Table Talk, and
  the voice UI (Sprints 6–7) intentionally unrebuilt, on a CSS bridge,
  pending client feedback.
- **Revenue-integrity hardening** (2026-08-15/16) — payments-sourced AOV
  (`get_aov_summary` v6, ADR 0023), KOT `cancelled` status (ADR 0022),
  cancellation cascades, discount fixes, POS QA fixes. Triggered by
  `docs/notes/pre-launch-readiness-assessment.md`.
- **Dual-provider voice** (2026-08-17) — ElevenLabs default
  (`STT_PROVIDER`/`TTS_PROVIDER` env switches), Sarvam fallback, restaurant
  voice config DB-backed (migration 0064). Always-on voice evaluated and
  deferred (ADR 0024).
- **Menu + restaurant config are DB-backed** — order-engine loads both from
  Supabase at startup; per-restaurant JSON files and `restaurants.json`
  are gone.

Order-engine tests: 197 passed, 3 skipped (post-ElevenLabs integration).
Migrations: repo at 0065.

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

## What's next

**Next major milestone: AOV data accuracy for the pilot restaurant** —
trustworthy baseline-vs-nudged numbers before Silver Specialty Coffee can
measure lift (see `CLAUDE.md`, "Current status").

Open items, in rough order:

1. Re-verify the readiness assessment's under-tested category —
   admin/POS-driven state changes hitting the event ledger
   (`docs/notes/pre-launch-readiness-assessment.md`).
2. Show the client the redesigned kiosk (Sprints 0–5); decide on
   Sprints 6–7 (Games, Table Talk, voice UI).
3. Voice: manual on-device pass on the Tab K9 (both provider defaults and
   the Sarvam fallback flip), and the ElevenLabs voice-ID listening test
   (placeholders Adam/Rachel still seeded).
4. Deploy to the restaurant — still on the Lenovo Tab K9 bench, not yet
   on the floor.

## Tech stack reference

- **STT:** ElevenLabs Scribe v2 Realtime (default) / Sarvam saaras:v3
  (fallback via `STT_PROVIDER`; WebSocket, stateless per PTT press)
- **TTS:** ElevenLabs `eleven_flash_v2_5` (default; WS closes per utterance
  via `CloseConnection`, reconnects transparently) / Sarvam bulbul:v3
  (fallback via `TTS_PROVIDER`; persistent per session, codec `linear16`)
- **LLM:** Gemini gemini-3.1-flash-lite (intent extraction + response generation, two-pass)
- **Backend:** FastAPI (Python), Supabase Postgres (ap-south-1)
- **Frontend:** React PWA, Vite, evolving from tabletot frontend PoC
- **Infra:** Monorepo + Docker Compose, local-first dev

## Open questions

Maintained inline as `#open-question` tags in notes. Promote to ADRs
when a decision is made.
