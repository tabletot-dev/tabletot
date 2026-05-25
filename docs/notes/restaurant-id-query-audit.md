# Restaurant-ID Query Audit — Kiosk App

Added `VITE_RESTAURANT_ID` env var and scoped all Supabase queries to the active restaurant.

## Env var

`VITE_RESTAURANT_ID` — UUID matching `restaurants.id` in Supabase for this deployment.

- Set in `apps/kiosk/.env.local`: `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91 (Silver Specialty Coffee Hyderabad — pinned in migration 0014))
- Template in `apps/kiosk/.env.example` with comment

Each file reads it as a module-level constant:
```ts
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
```

## Files and queries updated

### `src/lib/menuStore.ts`
- `menu_items` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`

### `src/lib/orderSubmission.ts`
- `restaurant_tables` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`
- `orders` INSERT — added `restaurant_id: RESTAURANT_ID`
- `kot_tickets` INSERT — added `restaurant_id: RESTAURANT_ID`

### `src/components/ChefsPicks.tsx`
- `anchor_items` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`
- `recommendation_events` INSERT (batch) — added `restaurant_id: RESTAURANT_ID` to each row

### `src/components/PairingNudge.tsx`
- `item_pairings` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`
- `recommendation_events` INSERT — added `restaurant_id: RESTAURANT_ID`

### `src/components/CompletionNudge.tsx`
- `menu_items` SELECT (by id) — added `.eq('restaurant_id', RESTAURANT_ID)`
- `recommendation_events` INSERT — added `restaurant_id: RESTAURANT_ID`

### `src/pages/Index.tsx`
- `meal_completion_rules` SELECT — added `.eq('restaurant_id', RESTAURANT_ID)`

## Tables not scoped (no query in kiosk)

- `menu_item_aliases` — queried only by the order-engine backend, not the kiosk
- `external_id_mapping` — backend only

## Notes

- `recommendation_events` UPDATE queries (flipping `item_accepted`) use the row's `id` (UUID PK) — no `restaurant_id` filter needed there.
- `anchor_items` uses `menu_items!inner(...)` join — the restaurant filter on `anchor_items` is sufficient; the join already constrains to items belonging to those anchors.
