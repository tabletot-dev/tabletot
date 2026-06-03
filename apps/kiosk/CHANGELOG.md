# Changelog — Kiosk PWA

Customer-facing tablet ordering app (React + Vite, Android Chrome kiosk mode).

---

## [Unreleased]

### Added

- **Session lifecycle — DB-backed** (`lib/orderSubmission.ts`, `pages/Index.tsx`, `hooks/useDeviceNavigation.ts`) — "Start Ordering" tap now INSERTs a `sessions` row before navigating to the menu. A DB trigger marks the table as occupied immediately; no POS action required. Session key (`tt_session_id`) is stored in `sessionStorage` and written to every `orders` and `kot_tickets` row. See ADR 0010.
- **Single orders row per session** (`lib/orderSubmission.ts`) — first "Send to Kitchen" INSERTs an `orders` row and caches its UUID as `tt_order_id` in `sessionStorage`. Subsequent rounds UPDATE that same row (append to `items_json`, recalculate totals). Each round still INSERTs a new `kot_tickets` row so the kitchen sees rounds separately. See ADR 0011.
- **Bidirectional session close** (`pages/Index.tsx`) — kiosk subscribes to its `sessions` row via Supabase Realtime. When POS staff mark the session as `closed` (after payment or manual end-service), the kiosk screen resets to idle automatically with no customer action.
- **Bill request → DB** (`components/screens/BillView.tsx`) — bill request INSERTs into `bill_requests` table (replaces localStorage write) and sets `sessions.status = 'bill_requested'`. POS Billing receives this via Realtime and highlights the table card with a pulsing bell.
- **Water request → DB** (`pages/Index.tsx`) — water request button INSERTs into `table_requests` table. POS Billing receives via Realtime and shows a blue droplet badge on the table card.
- **`resolveTableId` exported** (`lib/orderSubmission.ts`) — used by `BillView` and `Index.tsx` to get the table UUID without duplicating the lookup logic.
- **`clearSession()` exported** (`lib/orderSubmission.ts`) — clears `tt_session_id`, `tt_order_id`, and the cached table UUID. Single source of truth for all session storage cleanup.

### Fixed

- **Cart out-of-sync when a touch-added item is removed by voice** (`pages/Index.tsx`) — `handleVoiceDone` now has a third sweep after the existing two loops. The first loop applies voice deltas for items present in the backend snapshot; the second loop removes items that were in the previous voice snapshot but are now gone. Neither covered the case where a customer touch-added an item and then verbally removed it: the item was absent from both `next.items` (removed) and `prevVoiceOrderRef` (never voice-added), so it silently stayed in the kiosk UI. The third sweep iterates the current kiosk `order` and removes any item whose display name is not found in the new backend snapshot, closing this gap.

- **Client-side pricing allowed zero-cost order manipulation** (`lib/orderSubmission.ts`) — `submitOrder` previously computed `subtotal` and `total` from `item.price` values held in React state, which a developer-console override could set to zero before the Supabase INSERT. The function now fetches authoritative prices from `menu_items` for all cart item IDs immediately before computing totals. The cart-state price is kept only as a fallback for any item the DB lookup misses. Computed totals are now grounded in the database record, not client memory.

- **Stale session accumulation + bill_requested sessions never closing** (`lib/orderSubmission.ts`, `hooks/useDeviceNavigation.ts`) — two complementary fixes. (1) `startSession()` now closes any `active` or `bill_requested` session rows for the same table before upserting the new session, so reloads and test cycles don't leave orphaned rows. (2) `clearSession()` is now async and writes `status: 'closed', ended_at` to the DB before wiping `sessionStorage`, so every kiosk-side reset (bill close, POS-triggered Realtime reset) leaves the DB in a clean state. `endSession` fires `clearSession` as a non-blocking void call — UI resets synchronously, DB write follows async. The POS-triggered close path (Realtime on `restaurant_tables`) is unchanged; the new DB update is a no-op when POS has already closed the session.

- **Voice conversation thread lost on modal close** (`pages/Index.tsx`, `components/VoiceConversationPanel.tsx`, `lib/voice/types.ts`) — closing and reopening the voice modal wiped the visible transcript, making voice feel like it had amnesia even though the backend session (and its `conversation_history` + `order_state`) was still alive the whole time. The transcript (`turns`) lived as component-local state in `VoiceConversationPanel`. It now lives in `Index.tsx` alongside `voiceSessionId` (new shared `Turn` type in `lib/voice/types.ts`) and is passed in as a prop, so it survives the modal closing/reopening. Turn-building moved into `Index.handleVoiceDone`, the single sink for `done` messages, so dock-initiated presses made while the modal is closed are now captured too. The thread resets only when the voice session actually changes/ends, not on modal close. Backend untouched. See `docs/notes/voice-conversation-continuity.md`. — previously removed `tt_session_id` and `tt_order_id` manually, duplicating the logic in `clearSession()` and guaranteeing drift on any future key addition. `endSession` now calls `clearSession()` directly; the manual removes are gone.
- **Kiosk-initiated session close left `sessions` row active in Supabase** (`pages/Index.tsx`) — when the customer closed the bill view from the kiosk side, the `sessions` table row stayed `status = 'active'`, making the table appear occupied in POS until staff manually closed it. `BillView.onClose` now fires a fire-and-forget `sessions` UPDATE to `closed` before resetting local state. The POS-triggered close path (Realtime) is unchanged.
- **`endSession` did not clear `tt_order_id`** (`hooks/useDeviceNavigation.ts`) — `sessionStorage.removeItem('tt_order_id')` added so the next session starts with a clean slate and doesn't accidentally append to the previous session's orders row.

### Added

- **VoiceConversationPanel — real backend wiring** (`components/VoiceConversationPanel.tsx`, `components/VoiceOrderButton.tsx`, `pages/Index.tsx`) — panel now runs real PTT using the session owned by `VoiceOrderButton`. Each completed turn appends the user transcript and AI response to a live conversation history. Items matched by the resolver (`type: "match"`) are shown as tappable cards below the AI turn. `VoiceOrderButton` gained `onSessionReady` callback; `Index.tsx` threads `voiceSessionId` to the panel.
- **Migration 0015** (`supabase/migrations/0015_seed_silver_tables.sql`) — seeds a T1 row in `restaurant_tables` for Silver Specialty Coffee. Superseded in practice by 0016 but kept for audit trail.
- **Migration 0016** (`supabase/migrations/0016_fix_table_number_unique.sql`) — drops the global `UNIQUE` constraint on `restaurant_tables.table_number` and replaces it with a composite `UNIQUE (restaurant_id, table_number)`, enabling two restaurants to both have a T1. Inserts Silver's T1 cleanly after the constraint fix.

### Fixed

- **Migration 0009** (`supabase/migrations/0009_silver_specialty_coffee.sql`) — hardcodes Silver's UUID (`b22b5d53-6dd8-4f5b-8276-2e828cd1ab91`) instead of `gen_random_uuid()`, so every `db reset` produces the same UUID and `VITE_RESTAURANT_ID` stays valid.
- **Migration 0014** (`supabase/migrations/0014_pin_silver_uuid.sql`) — fixed a duplicate-key crash: the old row is now renamed to `__migrating__` before the new row is inserted, releasing the `restaurants_name_uidx` unique constraint. Previously failed with `23505` on every fresh `supabase start`.
- **`.env.local` UUID mismatch** (`apps/kiosk/.env.local`, `apps/dashboard/.env.local`) — both files had `VITE_RESTAURANT_ID=73a32fde...` (stale value) while migrations pinned `b22b5d53...`. Aligned to `b22b5d53...`.

### Removed

- **`VoiceModal`** (`components/VoiceModal.tsx`) — post-turn result overlay. Redundant now that `VoiceConversationPanel` shows real transcript and resolver results inline.
- **`VoiceBanner`** (`components/VoiceBanner.tsx`) — status strip component. Was never imported; dead code from an earlier design iteration.
- **`VoiceAssistantOverlay`** (`components/VoiceAssistantOverlay.tsx`) — older listening overlay with pulsing mic and cycling prompts. Was never imported; superseded by `VoiceModal` then `VoiceConversationPanel`.
- **Floating PTT button on non-menu screens** (`pages/Index.tsx`) — second `VoiceOrderButton` instance (cart, detail, etc.) removed. Voice ordering is now menu-only. Also removed: `showFloatingPtt`, `voiceStatus`, `voiceModalData`, and the `VoiceModalState` interface.

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
