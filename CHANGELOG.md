# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — 2026-06-09 (continued)

### Phase 1 — Data Correctness (pilot blocker)

#### 1A: Atomic order submission RPC (`supabase/migrations/0044_submit_order_rpc.sql`, `0045_fix_submit_order_rpc_ambiguous_column.sql`)

**Fixed four data-correctness issues in a single migration:**

- **TOCTOU race** — session status was previously checked *after* the order write. The new `submit_order` RPC checks session status first under `SELECT ... FOR UPDATE`, making bill-lock enforcement atomic.
- **Ghost orders on crash** — the old flow made 6 sequential round-trips. Any crash between steps left partial DB state. The RPC runs the entire flow (session check → order upsert → KOT insert) inside one implicit transaction.
- **`items_json` accumulation** — the client was appending round arrays instead of merging. The RPC groups by item `id` and sums `qty`, so `orders.items_json` always reflects the true cumulative order state.
- **`kot_number` collision** — `KOT-${Date.now()}` is not unique under concurrent load. Replaced with `KOT-<gen_random_uuid()>` inside the DB.
- **Bonus:** 6 sequential Supabase round-trips collapse to 1. Authoritative subtotal is now computed from `menu_items.price` in the DB, not from client-supplied values.
- **Bug fix (0045):** `RETURNS TABLE` declares columns named `subtotal`/`total` which PL/pgSQL exposes as local variables. In the UPDATE path, `SELECT subtotal FROM orders` was ambiguous (SQLSTATE 42702). Fixed by qualifying with `orders.subtotal`.

**`apps/kiosk/src/lib/orderSubmission.ts`** — replaced the 6-step sequential body with a single `.rpc('submit_order', {...})` call. Removed now-unused `computeTotals` import.

#### 1B: Reliable `order_submitted` event delivery (`apps/kiosk/src/lib/eventBus.ts`)

`order_submitted` is the critical AOV measurement event. A single network blip must not silently drop it.

- Added a `localStorage`-backed retry queue for `order_submitted` only. On failure, the event is pushed to `tt_pending_events`. The queue is drained on the next `track()` call.
- Max queue depth: 10 entries. Oldest evicted on overflow.
- All other event types (`recommendation_shown`, `item_added`, etc.) remain fire-and-forget. The queue drain runs opportunistically on those calls too.

---

### Phase 2 — Reliability

#### 2A: Voice session recovery on 4004 (`apps/kiosk/src/components/VoiceOrderButton.tsx`)

The voice backend keeps sessions in memory. A backend restart drops all sessions; the next PTT press received WS close code 4004 and voice died silently with no user feedback.

- Extracted session init into a restartable `initSession()` function inside the component's `useEffect`.
- On receiving `"Session not found"` error from either the STT or TTS WebSocket, `doRestart()` tears down the current TTS connection and re-establishes a new voice session transparently.
- Cart state is intact in React — the next PTT press will send `cart_sync` as normal.
- Guarded against concurrent restart calls and unmounted components.

#### 2B: Session idle timeout raised + passive heartbeat (`backend/main.py`, `backend/routers/voice.py`)

- Raised `_SESSION_IDLE_SECONDS` from 15 to 30 minutes. Customers reading a long menu were being reaped before ever pressing PTT.
- Added a passive heartbeat in the TTS WebSocket loop: if no TTS work arrives for 60 seconds (customer browsing), `touch_session()` is called to reset the idle timer. The TTS connection itself is enough proof the session is active.

#### 2C: Menu consistency within a streaming turn (`backend/main.py`)

The 6-hour background `_refresh_loop` was loading `menu_data`, `index`, and `graph` in three separate `asyncio.to_thread` calls and assigning them with `await`s between each assignment. A `create_session()` call arriving mid-refresh could pick up a new `_menus` entry but an old `_menu_graphs` entry.

- Changed `_refresh_loop` to load all three concurrently via `asyncio.gather`, then assign both dicts without an `await` between them. The two assignments are now as close to atomic as Python allows.
- Same fix applied to the `/admin/refresh-menu` endpoint.

#### 2D: POS Supabase client crash guard (`apps/pos/src/integrations/supabase/client.ts`)

The POS client passed `undefined` directly to `createClient()` when env vars were missing, causing an immediate runtime crash on any machine without `.env.local`.

- Added the same `hasSupabaseConfig` guard pattern used by the kiosk client.
- When env vars are absent, placeholder values are used so the module loads cleanly. The guard is exported for call sites that need to conditionally skip DB operations.

---

### Phase 3 — Maintainability

#### 3A: `completionRules` moved into `menuStore` (`apps/kiosk/src/lib/menuStore.tsx`, `apps/kiosk/src/pages/Index.tsx`)

`CompletionNudge` previously fetched `meal_completion_rules` via a standalone `useEffect` + Supabase call on every mount (including a 700ms timeout). This was a separate DB round-trip that duplicated the pattern already used for pairings and anchors.

- Added `meal_completion_rules` to the `Promise.all` in `menuStore.fetchAll()`. Rules are now available synchronously from context at the moment "Send to Kitchen" is tapped.
- Added `meal_completion_rules` to the Realtime subscription list so rule changes propagate live.
- Removed the standalone Supabase fetch from `handleConfirmOrder` in `Index.tsx`.
- Removed the now-unused `withTimeout` helper.
- `MenuState` interface updated to expose `completionRules: CompletionRule[]`.

#### 3B: Supabase types regenerated (`apps/kiosk/src/integrations/supabase/types.ts`)

Types regenerated from local Supabase after applying all migrations through 0044.

- `display_name` columns now present in `sessions.Insert/Update` and `kot_tickets.Insert/Update` — removed two `as never` casts in `orderSubmission.ts` (`setSessionDisplayName`, `startSession`).
- `submit_order` RPC now present in generated types — removed `as never` cast on `supabase.rpc('submit_order', ...)` and the manual `Array<{...}>` result cast in `submitOrder()`.

#### 3C: `RESTAURANT_ID` single source of truth (`apps/kiosk/src/lib/config.ts`)

`RESTAURANT_ID` was declared 5 times across the kiosk app; `TABLE_NUMBER` was declared twice with module-level `window.location.search` side effects in both places.

- Created `apps/kiosk/src/lib/config.ts` as the single source for both constants.
- Updated all kiosk files to import from `@/lib/config`:
  - `apps/kiosk/src/lib/orderSubmission.ts`
  - `apps/kiosk/src/lib/menuStore.tsx`
  - `apps/kiosk/src/lib/eventBus.ts`
  - `apps/kiosk/src/components/CompletionNudge.tsx`
  - `apps/kiosk/src/pages/Index.tsx`

#### 3D: `/admin/refresh-menu` authentication (`backend/main.py`)

The admin endpoint was unauthenticated — anyone who could reach the Railway URL could trigger a full menu reload.

- Added `X-Admin-Key` header check against `ADMIN_API_KEY` env var.
- Returns `503` if `ADMIN_API_KEY` is not configured on the server (prevents silent open access in misconfigured deploys).
- Returns `403 Forbidden` on header mismatch.
- Set `ADMIN_API_KEY` in the Railway environment for the order-engine service.

---

#### 2E: Voice session persistence across Railway restarts (`supabase/migrations/0046_voice_sessions_table.sql`, `voice_agent/session_manager.py`, `backend/main.py`)

A Railway redeploy dropped all in-memory voice sessions silently. The kiosk received a 4004 close code on the next PTT press and had no way to distinguish a backend restart from a normal timeout.

- Added `voice_sessions` table with `status` vocabulary: `active`, `closed`, `reaped`, `interrupted`.
- `SessionManager` now accepts a `db_pool` parameter. Fire-and-forget DB writes (via `asyncio.to_thread`) record each session lifecycle event without blocking the hot PTT path:
  - `create_session()` → INSERT `status='active'`
  - `end_session()` → UPDATE `status='closed'`
  - `reap_idle_sessions()` → UPDATE `status='reaped'` (direct, bypasses `end_session` to preserve the distinction)
  - `startup_cleanup()` → UPDATE any lingering `status='active'` rows to `status='interrupted'`
- `startup_cleanup()` is called in `lifespan` before the app begins accepting requests. This ensures stale rows from a crashed process are cleaned up immediately on restart.
- `db_pool` is now created before `SessionManager` in `main.py` so it can be passed at construction time.
- Note: conversation history is not revived (not worth it — voice sessions are stateless per PTT press). Cart state is reconciled via `cart_sync` on the next PTT press (see 2F).

#### 2F: Cart/voice state reconciliation on reconnect (already in place)

`cart_sync` was already implemented end-to-end: `sttClient.ts` sends `{type:"cart_sync", items:[...]}` as the first message of every STT WebSocket before audio begins. `_apply_cart_sync()` in `voice.py` reconciles `OrderState` from the kiosk's touch cart on every PTT press. This means any divergence — whether from a backend restart or a mid-session TTS drop — is corrected automatically on the next press with no additional code. Documented here to close the open issue.

---

### Phase 3 — Maintainability (continued)

#### 3E: Dashboard Supabase client crash guard (`apps/dashboard/src/integrations/supabase/client.ts`)

The dashboard client passed `undefined` directly to `createClient()` when env vars were missing, matching the unfixed state that was fixed in POS in 2D.

- Added `hasSupabaseConfig` guard, `safeUrl`, `safeKey` placeholders — same pattern as kiosk and POS.
- Renamed env var from `VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY` to match the other apps.
- Updated `apps/dashboard/.env.example` to reflect the renamed variable.

#### 3F: `CategoryIcon` extracted from `MenuView` (`apps/kiosk/src/components/CategoryIcon.tsx`)

The 83-line `CategoryIcon` component was declared inline inside `MenuView.tsx`. Adding a new DB category required a developer to locate and edit the component embedded inside a view file.

- Extracted `CategoryIcon` to `apps/kiosk/src/components/CategoryIcon.tsx` — the icon map and fallback are now isolated, self-documented, and independently importable.
- `MenuView.tsx` imports `CategoryIcon` from the new file. No behaviour change.

---

## Operational notes

### RPC test results (local Supabase, 2026-06-09)

| Test | Expected | Result |
|------|----------|--------|
| 1 — bad session key | `Session not found.` error | ✓ |
| 2 — round 1, 1×Veggie Bagel | subtotal=360, total=378 | ✓ |
| 3 — round 2, +2×Veggie Bagel, merge | orders.qty=3, subtotal=1080, total=1134 | ✓ |
| 4 — bill_requested blocks ordering | `ordering is closed` error | ✓ |

### Still to do before deploying

1. Set `ADMIN_API_KEY` in Railway environment for the order-engine service.
2. Push migration 0045 to remote (`supabase db push`).

### Testing the RPC locally

```sql
SELECT * FROM submit_order(
  '<restaurant_uuid>',
  '<table_uuid>',
  'T1',
  'test-session-key',
  '[{"id":"<item_uuid>","name":"Espresso","qty":2,"price":180,"modifiers":[]}]'::jsonb
);
```
