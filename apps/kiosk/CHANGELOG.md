# Changelog — Kiosk PWA

Customer-facing tablet ordering app (React + Vite, Android Chrome kiosk mode).

---

## [Unreleased]

### Added

- **Sessionful ordering** (`lib/orderSubmission.ts`, `hooks/useDeviceNavigation.ts`) — all order rounds placed by the same table in one sitting are linked via `tt_session_id` (UUID stored in `sessionStorage`). `session_id` is written to both `orders` and `kot_tickets` rows so the POS can bill the full session together.
- **WaitingView — live order status** (`components/screens/WaitingView.tsx`) — subscribes to the specific `orders` row via Supabase Realtime; fetches initial status on mount so the progress bar reflects reality rather than a timer. Status map: `pending` → Queued (28%), `preparing` → Cooking (60%), `ready` → Plating (85%), `served` → Done (100%).
- **WaitingView — End Session long-press** — 2-second hold-to-confirm button clears the order state, removes `tt_session_id` from `sessionStorage`, and returns to idle. Animated fill bar shows hold progress.
- **ListeningScreen — real voice session** (`components/screens/ListeningScreen.tsx`) — fully rewired: auto-starts a backend voice session on mount, opens the TTS WebSocket, and begins recording immediately. No tap needed. Sends current cart as `cart_sync` before audio. `done`/`no_speech`/`error` events drive phase transitions and close the sheet.
- **Voice enable/disable flag** — `voiceEnabled` from `restaurants.config.voice_enabled` (Supabase JSONB) controls PTT button and "Ask Waiter" CTA visibility. Clean touch-only UI when false.
- **Migration 0013** (`supabase/migrations/0013_orders_session_id.sql`) — adds `session_id TEXT` to `orders` and `kot_tickets` with partial indexes.
- **Migration 0014** (`supabase/migrations/0014_pin_silver_uuid.sql`) — pins Silver Specialty Coffee's UUID to `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91` after every `db reset`, so `VITE_RESTAURANT_ID` stays valid across resets.
- **`apps/kiosk/docs/TODOs.md`** — deferred items not blocking pilot (POS Realtime session end, session_id tab-refresh edge case, type regen, voice timeout guard, image seeding, etc.).

### Fixed

- **Order submission 400** — migration 0013 not applied caused `Could not find the 'session_id' column` error on order confirm. Fixed by applying the migration and regenerating Supabase types.
- **Supabase types** (`src/integrations/supabase/types.ts`) regenerated after migration 0013; removed `as any` casts in `orderSubmission.ts`.

---

## [0.4.0] — 2026-05-08

### Added

- **Voice PTT button** (`components/VoiceOrderButton.tsx`) — persistent floating push-to-talk button wired to the full backend voice pipeline. Tap-to-toggle recording (not hold-to-talk).
- **ListeningScreen** (`components/screens/ListeningScreen.tsx`) — bottom-sheet voice UI with phase states: `connecting → recording → processing → error`. Shows example prompts and animated wave during recording.
- **DetailView — tags + pairings** (`components/screens/DetailView.tsx`) — dietary tags (veg/non-veg indicator) and item pairings displayed in the detail sheet.
- **Header redesign** — refined header layout with visible cart total and cleaner bill/confirmation action flows.

### Changed

- **`lib/menuStore.tsx`** (renamed from `.ts`) — loads pairings and anchor items alongside menu data; exposes `useMenuStore` hook.
- **Veg indicator** — green/red dot on DishCard and DetailView driven by `is_veg` column.
- **Pricing logic extracted** (`lib/pricing.ts`) — `computeTotals()` centralises subtotal/tax/total calculation, shared by CartView and orderSubmission.
- **Menu rendering optimised** — reduced re-renders; category scroll anchors wired.
- **Submission UX** — loading state and retry affordance on confirm order button.

---

## [0.3.0] — 2026-05-01

### Added

- **DB-driven item pairings** (`components/PairingNudge.tsx`) — replaces static upsell logic with pairings read from `item_pairings` Supabase table. Post-add nudge fires when a pairing exists for the added item.
- **Voice session analytics** (`lib/voice/api.ts`) — `tt_session_id` from `sessionStorage` is sent as `client_session_id` on session start, unifying voice and touch events under the same session key.
- **Tap-to-toggle PTT** — PTT button switches between recording and idle on each tap rather than requiring a held press.
- **Touch cart sync** — current touch cart is sent to the backend as `cart_sync` at the start of each voice press so the LLM has accurate order context.
- **Mic permission UX** — `MicPermissionDeniedError` surfaces a specific message directing users to browser settings rather than a generic error.
- **`restaurant_id` filters** — all Supabase queries (menu, pairings, anchors, tables) scoped to `VITE_RESTAURANT_ID` for multi-restaurant correctness.

---

## [0.2.0] — 2026-04-30

### Added

- **Voice pipeline wiring** (`lib/voice/`) — `api.ts` (session start/end), `sttClient.ts` (per-press STT WebSocket), `ttsClient.ts` (persistent TTS WebSocket, audio playback), `types.ts` (`SttMessage`/`TtsMessage` unions).
- **Pattern 2 — post-add pairing nudge** — fires after item is added to cart; logs `recommendation_events` row for AOV measurement.
- **Pattern 3 — pre-submit completion nudge** (`components/CompletionNudge.tsx`) — evaluates `meal_completion_rules` before order confirm; suggests missing items (e.g. no drink in cart).
- **Recommendation event logging** — `recommendation_events` rows written on nudge show and accept for A/B lift measurement.

---

## [0.1.0] — 2026-04-29

### Added

- **Menu from Supabase DB** — `useMenuStore` reads `menu_items` via Supabase client with Realtime subscription; falls back gracefully when offline.
- **Chef's Picks — anchor-on-empty** (`components/AnchorNudge.tsx`) — Pattern 1: when cart is empty, shows curated anchor items from `anchor_items` table (SQL-only, no LLM).
- **Initial screens** — `MenuView`, `CartView`, `DetailView`, `WaitingView` (static), `IdleView`.
- **Supabase client wiring** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` + `VITE_RESTAURANT_ID` + `VITE_TABLE_ID` env vars.
- **Order submission** (`lib/orderSubmission.ts`) — inserts into `orders` + `kot_tickets`; resolves `table_id` UUID from `VITE_TABLE_ID` (table number) on first submit and caches for session.
