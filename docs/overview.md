# tabletot-pilot — overview

> Living document. Update when the state of the project changes meaningfully.
> Last updated: 2026-09-29

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

Since Sep 4 (all merged to `main`, latest commit `75367c2`, 2026-09-20):

- **Kiosk v1.0 Sprints 6–7 merged** — Venue/About screen (16, from
  `restaurants.config`, migration 0071), "About" added to the Attract
  secondary panel, Games/Table Talk/voice UI classes renamed off the
  legacy namespace, the Warm Espresso CSS bridge retired
  (`docs/plans/2026-08-30-kiosk-sprint-6-7.md`).
- **Per-item structured facts** (migration 0072, `menu_items.facts` jsonb —
  calories, allergens, spice level, prep time, ingredients) rendered into
  the LLM menu summary so voice/Ask-AI answers only stated facts, never
  estimates (`services/order-engine/src/llm/prompts/menu_summary.py`,
  system prompt Truth Rule 6).
- **Admin-managed ad carousel** on the kiosk waiting screen (migration
  0073, new `ads` table with `restaurant_id`/`image_url`/`sort_order`/
  `active`, RLS: anon reads only `active = true`), replacing the old
  `restaurants.config.promos` JSONB blob; curated from `apps/dashboard`.
- **Voice/POS bugfixes**: voice modal crash from Product Detail, mic
  access on Product Detail + back-to-order from menu, recommendation card
  image cropping/sizing, idle-kiosk auto-navigation when POS starts an
  order, filter-intent losing attribute/category, TTS reconnect race
  silently dropping sentences, POS Add Items dialog scroll/close bug,
  voice modal left open after a POS-ended session.

Kiosk UX audit (2026-09-28/29, branch `feat/kiosk-ux-audit-fixes`, not yet
merged; plan and outcome in `docs/plans/2026-09-28-kiosk-ux-audit-fixes.md`):

- **Trust fixes** — egg dishes corrected to Non-Veg (migration 0074), square
  FSSAI diet marks, "Round" wording removed, prices without `.00`, phone
  prompt reworded, Order-confirmed screen replaced by a toast.
- **Per-order status + ETA** — Waiting shows one row per KOT ("1st order ·
  Cooking") from `kot_tickets` (`useKotTickets`); ETA is the longest
  `facts.prep_minutes` among items still cooking, a fixed number that changes
  only when the kitchen moves a ticket. Prep times show on dish cards.
- **Dish detail** — "Details" card from `menu_items.facts` (`menuFacts.ts`),
  sticky footer no longer covers the mic dock, one mic icon everywhere.
- **Screensaver / Games** — tap anywhere dismisses, closes when food is
  Ready, shows "Your food: <stage>" (also on Games). `useKitchenStatus` uses a
  per-instance realtime channel; sharing one name crashed the screensaver.
- Migration 0075 turns the "Name for this order" prompt off for Silver.
  0074 and 0075 exist on the branch only, applied locally, not on `main` or
  the remote.
- Left on purpose: Waiting reorder, blurred screensaver fill, mic in the cart
  bar, Attract carousel repeat.

Kiosk Games redesign (2026-09-29, branch `feat/kiosk-games-redesign`, not
merged; `docs/notes/2026-09-29-kiosk-games-redesign.md`): Games is now a
"While you wait" hub with five games (Memory Match, Guess the Dish,
Tic-Tac-Toe, Word Scramble, Emoji Decode), decks built from the live menu.
Ludo, Connect 4 and Word Duel removed, about 1,230 lines of game CSS deleted.

Order-engine tests: 197 passed, 3 skipped as of the last verified run
(2026-08-30, post-ElevenLabs integration) — not re-verified since; the
suite needs local Supabase running on port 54322.
Migrations: `main` at 0073 (0066–0070 applied to remote Supabase
2026-08-30; 0071–0073 not yet confirmed applied to remote — verify before
relying on them there).

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

A pre-deployment code audit (2026-08-28,
`docs/notes/2026-08-28-pre-deployment-code-audit.md`) found 10 fixable
defects (3 P0, 2 High, 3 Medium, 2 Low) blocking the floor — a kiosk
reload during the 2-minute hold silently destroying the round while
telling the guest it was confirmed; public POS signup granting full write
access to orders/payments/menu; cancel-then-reorder resurrecting
cancelled items onto the bill; cash overpayment inflating AOV revenue;
among others. All 10 are fixed, verified (real Postgres 16 instance for
DB changes, the kiosk's vitest suite for frontend changes), and **merged
to `main`** via PRs #13–#15 on 2026-08-30 (migrations 0066–0070 applied
to the remote Supabase the same day, commit `90deb91`). This also closes
the readiness assessment's under-tested category — admin/POS-driven state
changes hitting the event ledger
(`docs/notes/pre-launch-readiness-assessment.md`), where findings 1, 3
and 5 all landed.

Open items, in rough order:

1. Merge `kiosk-v1-sprint-6-7` — Sprints 6–7 proper already landed on
   `main` separately, but the branch is still **ahead** by a voice
   channel redesign (screens 06/07/08 — `VoiceDockPanel`,
   `VoiceConversationScreen`, `EarlierStrip`, `VoiceAnswerCard`,
   `useMicLevels`; 14 commits, latest `7399b60` "Add voice single-surface
   rework plan"). Specs/plans:
   `docs/plans/2026-08-30-voice-channel-redesign-spec.md`,
   `docs/plans/2026-08-30-voice-channel-redesign.md`,
   `docs/plans/2026-08-31-voice-single-surface-rework.md`. Needs a rebase
   onto current `main` before merging or continuing.
2. Show the client the redesigned kiosk (Sprints 0–5, and now 6–7);
   confirm direction on the voice redesign in progress on
   `kiosk-v1-sprint-6-7`.
3. Voice: manual on-device pass on the Tab K9 (both provider defaults and
   the Sarvam fallback flip), and the ElevenLabs voice-ID listening test
   (placeholders Adam/Rachel still seeded).
4. Deploy to the restaurant — still on the Lenovo Tab K9 bench, not yet
   on the floor.
5. Confirm migrations 0071–0073 have been applied to the remote Supabase
   (0066–0070 confirmed applied 2026-08-30; later ones unverified).

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
