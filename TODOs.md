# Tabletot — Project TODOs

Deferred items across the whole repo. Each section notes where the work lives.

---

## Infrastructure & DevOps

### Move restaurant config from JSON file to Supabase
**Where:** `services/order-engine/backend/config/restaurants.json` → `restaurants` table in Supabase.

Right now, adding a new restaurant requires editing `restaurants.json` and redeploying the order-engine server. The `restaurants` table already exists in Supabase. The fix is to add the voice/LLM config columns there (`language_code`, `speaker`, `fallback_language_code`, `fallback_speaker`, `voice_persona`) and update the order-engine config loader to read from Supabase at session start instead of from a local file. Once done, adding a restaurant = inserting a row — no server touch needed.

Blocked on: none. Do this before onboarding a second pilot restaurant.

### Migrate dish images to Supabase Storage
**Where:** `menu_items.image_url`, Supabase Storage bucket.

Currently `image_url` holds Unsplash placeholder URLs (nullable; kiosk falls back to category gradients). Before the second restaurant, move images to a Supabase Storage bucket (`dish-images` or similar) so images are:
- Served from the same infrastructure as the DB (no external dependency on Unsplash or any CDN)
- Organised per restaurant (`silver-ssc-hyd/cold-brew.jpg`, etc.)
- Manageable from the POS admin (image upload in Menu page)

Post-pilot work: create the bucket, upload Silver SSC images, update `menu_items.image_url` to use Supabase Storage URLs, add file upload to the POS Menu form instead of a URL text field.

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

### session_id rotation on browser refresh *(partially resolved)*
**Where:** `apps/kiosk/src/lib/orderSubmission.ts`

`startSession()` uses upsert with `ignoreDuplicates: true`, so a refresh within the same tab correctly reuses the existing session row and resumes appending to the same `orders` row via `tt_order_id`. Remaining gap: a hard tab close wipes `sessionStorage` — the next open generates a new `tt_session_id`, orphaning the previous session row in the DB. For pilot this is acceptable; the orphaned session remains `active` until POS closes it. Fix before multi-session analytics.

### ListeningScreen — max-recording timeout guard
**Where:** `apps/kiosk/src/components/screens/ListeningScreen.tsx`

Add a 30s max-recording guard so the sheet doesn't hang indefinitely if the backend stalls. Currently there's no client-side timeout.

### Seed image_url from Unsplash
**Where:** Supabase `menu_items` table

`menu_items.image_url` is nullable; DishCard, CartView, and WaitingView fall back to category-gradient placeholders. Seed via Supabase Studio or a one-off migration once URLs are confirmed. See also: "Migrate dish images to Supabase Storage" above for the post-pilot permanent solution.

### Populate meal_completion_rules (owner session)
**Where:** Supabase `meal_completion_rules` table

The CompletionNudge fires only when a matching rule exists. The table is empty until the owner populates it. Schedule a session with the Silver owner to fill in rules (e.g., "no drink in cart → suggest cold brew").

---

## POS (`apps/pos`)

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

1. ~~Apply migrations 0009–0021~~ ✅ Done — all 21 migrations applied on clean DB reset
2. ~~Set `VITE_RESTAURANT_ID` to Silver UUID; set `VITE_TABLE_ID`~~ ✅ Done — pinned in migration 0014
3. Seed `image_url` from Unsplash placeholders (or skip and use gradients for pilot)
4. ADRs 0004–0008 (solo writeup)
5. Manual E2E test on Android tablet (LAN setup above)
6. Owner session — populate `meal_completion_rules`
7. Pilot launch

---

## Closed / Resolved

- ~~**POS-driven session end via table status**~~ — Implemented. Kiosk subscribes to `sessions` Realtime; POS closes the session on payment or "End Service"; kiosk auto-resets.
- ~~**Regenerate Supabase types after migration 0013**~~ — Done. Types regenerated after migrations 0017, 0019, 0020, 0021. Both apps current.
- ~~**VoiceAssistantOverlay dead code**~~ — Deleted.
- ~~**BillSummaryScreen sessionTotal scoping**~~ — `BillSummaryScreen.tsx` removed in POS refactor. New `Billing.tsx` computes totals per-table from the active order's `items_json`.
- ~~**Menu.tsx 400 on save**~~ — `item_id` (non-existent column) removed from PATCH payload; `description` column added via migration 0021; import order fixed.
