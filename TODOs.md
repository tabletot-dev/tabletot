# Tabletot — Project TODOs

Deferred items across the whole repo. Each section notes where the work lives.

---

## Infrastructure & DevOps

### Move restaurant config from JSON file to Supabase
**Where:** `services/order-engine/backend/config/restaurants.json` → `restaurants` table in Supabase.

Right now, adding a new restaurant requires editing `restaurants.json` and redeploying the order-engine server. The `restaurants` table already exists in Supabase. The fix is to add the voice/LLM config columns there (`language_code`, `speaker`, `fallback_language_code`, `fallback_speaker`, `voice_persona`) and update the order-engine config loader to read from Supabase at session start instead of from a local file. Once done, adding a restaurant = inserting a row — no server touch needed.

Blocked on: none. Do this before onboarding a second pilot restaurant.

### Multi-table support for kiosk
**Where:** `apps/kiosk/src/lib/orderSubmission.ts`

`VITE_TABLE_ID` is a single env var — one kiosk build = one table. For multi-table pilots, the kiosk URL should accept a `?table=T3` query param that overrides the env default. `resolveTableId()` already caches the UUID; just make `TABLE_NUMBER` dynamic from the URL param.

### LAN / tablet testing setup
**Where:** `apps/kiosk/.env.local`, `apps/pos/.env.local`

When testing on a real Android tablet on the same LAN, set:
- `VITE_SUPABASE_URL=http://<mac-ip>:54321`
- `VITE_ORDER_ENGINE_HTTP=http://<mac-ip>:8000`
- `VITE_ORDER_ENGINE_WS=ws://<mac-ip>:8000`

Start order-engine with `--host 0.0.0.0`. Restart Vite after changing env vars.

---

## Kiosk (`apps/kiosk`)

### POS-driven session end via table status (Phase 2 Option A)
**Where:** `apps/kiosk/src/components/screens/WaitingView.tsx`

Currently session end is triggered by long-pressing "End Session" on WaitingView (Option B). Option A is cleaner: subscribe to `restaurant_tables.status` via Supabase Realtime; when the POS marks the table `available` (after payment), the kiosk auto-resets to idle. Blocked on: defining the table status lifecycle in the POS.

### session_id rotation on browser refresh
**Where:** `apps/kiosk/src/lib/orderSubmission.ts`

`sessionStorage.removeItem("tt_session_id")` is called on End Session. But a mid-session browser refresh generates a new UUID, splitting one physical session across two `session_id` values. Acceptable for pilot; fix before multi-session analytics.

### Regenerate Supabase types for apps/pos after migration 0013
**Where:** `apps/pos/`

Run `supabase gen types typescript --local > src/integrations/supabase/types.ts` in `apps/pos` after migration 0013 is applied. Kiosk types are already regenerated.

### VoiceAssistantOverlay — dead code
**Where:** `apps/kiosk/src/components/VoiceAssistantOverlay.tsx`

This file is unused — it was the pre-redesign full-screen overlay. Delete once confirmed nothing imports it.

### ListeningScreen — max-recording timeout guard
**Where:** `apps/kiosk/src/components/screens/ListeningScreen.tsx`

Add a 30s max-recording guard so the sheet doesn't hang indefinitely if the backend stalls. Currently there's no client-side timeout.

### Seed image_url from Unsplash
**Where:** Supabase `menu_items` table

`menu_items.image_url` is nullable; DishCard, CartView, and WaitingView fall back to category-gradient placeholders. The `tabletot-redesign.html` prototype has Unsplash placeholder URLs per dish. Seed via Supabase Studio or a one-off migration once URLs are confirmed.

### Populate meal_completion_rules (owner session)
**Where:** Supabase `meal_completion_rules` table

The CompletionNudge fires only when a matching rule exists. The table is empty until the owner populates it. Schedule a session with the Silver owner to fill in rules (e.g., "no drink in cart → suggest cold brew").

---

## POS (`apps/pos`)

### BillSummaryScreen — sessionTotal scoping
**Where:** `apps/pos/src/components/screens/BillSummaryScreen.tsx`

`sessionTotal` currently sums across all tables (wrong). Fix is blocked on the owner conversation about the POS tablet's role at Roast CCx — need to decide whether the POS shows per-table or all-table totals before scoping the query.

### Petpooja adapter + external_id_mapping
**Where:** `supabase/`, `services/`

`external_id_mapping` is empty until the Petpooja adapter is built. The POS currently uses Tabletot's own `menu_items` table. Petpooja sync is explicitly post-pilot.

---

## Order Engine (`services/order-engine`)

### Voice persona examples in Pass 1 prompt
**Where:** `services/order-engine/src/llm/prompts/system_prompt.py`

The examples in `_INTENT_ROLE_AND_FORMAT` use full-meal Indian restaurant items (butter chicken, garlic naan, etc.). For Silver Specialty Coffee, consider swapping to coffee-shop phrasing examples (e.g., "ek cold brew", "oat milk wala latte") to better prime intent extraction for the actual menu type. Low priority — the menu context overrides this in practice.

---

## Pilot Launch Sequence (ordered)

1. Apply migrations 0009 → 0010 (fix cold-brew pairing first) → 0011
2. Set `VITE_RESTAURANT_ID` to Silver UUID; set `VITE_TABLE_ID`
3. Seed `image_url` from Unsplash placeholders
4. ADRs 0004–0008 (solo)
5. Manual E2E test on Android tablet
6. Owner session — populate `meal_completion_rules`
7. Pilot launch
