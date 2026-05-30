# Kiosk TODOs

Deferred items that are known gaps but not blocking the pilot.

---

## Session & Order lifecycle

### Phase 2 Option A — POS-driven session end via table status
Currently the server ends a kiosk session by long-pressing "End Session" on the
WaitingView (Option B). Option A is cleaner: subscribe to `restaurant_tables.status`
via Supabase Realtime on the kiosk; when the POS marks the table `available`
(cleared after payment), the kiosk auto-resets to idle.

Blocked on: defining `restaurant_tables.status` lifecycle in the POS (what values,
who writes them, when). Implement once the POS table-management view is stable.

### session_id rotation on end-session
`sessionStorage.removeItem("tt_session_id")` is called on End Session so the next
customer gets a new grouping key. However if the browser tab is refreshed mid-session,
a new UUID is generated and orders from the same physical session get split across two
`session_id` values. For pilot this is acceptable; fix before multi-session analytics.

### Regenerate Supabase types for apps/pos after migration 0013
Run `supabase gen types typescript --local > src/integrations/supabase/types.ts`
in `apps/pos` after migration 0013 is applied (kiosk types already regenerated).

---

## Voice

### ListeningScreen — "Ask Waiter" auto-recording timeout
Currently the ListeningScreen auto-starts recording and waits for the backend to
return a `done` or `no_speech` event (no user timeout). Add a 30s max-recording
guard so the sheet doesn't hang if the backend stalls.

### Voice on WaitingView / session-idle screen
The `session-idle` screen currently hides the PTT VoiceOrderButton (to keep the
slideshow clean). If users want to order via voice while waiting, they tap "Order
More" first. This is intentional for the pilot. Revisit if voice-from-waiting becomes
a common pattern.

---

## Menu & images

### Seed image_url from Unsplash
`menu_items.image_url` is nullable; DishCard, CartView, and WaitingView fall back to
category-gradient placeholders. The `tabletot-redesign.html` prototype has Unsplash
placeholder URLs per dish. Seed these via Supabase Studio or a one-off migration once
URLs are confirmed.

---

## Recommendations

### Populate meal_completion_rules (owner session)
The CompletionNudge fires when a matching rule exists in `meal_completion_rules`.
The table is empty until the owner populates it. Schedule a session with the Silver
owner to fill in rules (e.g., "no drink in cart → suggest cold brew").

---

## Infrastructure

### Petpooja adapter + external_id_mapping
`external_id_mapping` is empty until the Petpooja adapter is built. The POS currently
uses Tabletot's own `menu_items` table. Petpooja sync is post-pilot.

### Multi-table support
`VITE_TABLE_ID` is a single env var — one kiosk = one table. For multi-table pilots,
the kiosk URL should include a `?table=T3` param that overrides the env default.
`resolveTableId()` in `orderSubmission.ts` already caches the UUID; just make
`TABLE_NUMBER` dynamic.
