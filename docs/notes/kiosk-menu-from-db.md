# Kiosk: Menu from Supabase DB with Realtime Updates

## What changed and where

### Old static references removed

| File | What it had | What replaced it |
|---|---|---|
| `apps/kiosk/src/data/menu.ts` | 21 hardcoded menu items (Cheeseburger, Margherita Pizza, …), hardcoded `menuCategories` array | Types only: `MenuItem`, `OrderItem` |
| `apps/kiosk/src/data/upsell.ts` | Imported `menuItems` from static file; used hardcoded category-pairing map | Accepts `allItems: MenuItem[]` as parameter; uses "different category" heuristic |
| `apps/kiosk/src/components/screens/MenuScreen.tsx` | Read from `menuItems` / `menuCategories` static arrays | Calls `useMenu()` hook |
| `apps/kiosk/src/components/screens/ItemDetailScreen.tsx` | Rendered `item.image` (img tag) and `item.description` | Both removed; `MenuItem` no longer has these fields |
| `apps/kiosk/src/components/screens/OrderSummaryScreen.tsx` | Rendered `item.image` in cart rows | Img elements removed |
| `apps/kiosk/src/components/screens/BillSummaryScreen.tsx` | Rendered `item.image` in bill rows | Img elements removed |
| `apps/kiosk/src/components/ChefsPicks.tsx` | Passed `description: "", image: ""` to `onAddToCart` | Passes `tags: []` instead; matches new `MenuItem` shape |

### New files

- **`apps/kiosk/src/lib/menuStore.ts`** — exports `useMenu()` hook
- **`supabase/migrations/0006_menu_items_realtime.sql`** — adds `menu_items` to the `supabase_realtime` publication

## How `useMenu()` works

```
mount
  → fetch: SELECT id,name,category,price,tags FROM menu_items WHERE active=true ORDER BY category,name
  → setItems(mapped rows)
  → subscribe: supabase.channel('menu_items_realtime').on('postgres_changes', {event:'*', table:'menu_items'}, refetch)

any INSERT/UPDATE/DELETE on menu_items
  → Realtime fires the callback
  → fetchItems() runs again (re-queries active=true)
  → React state updates → MenuScreen re-renders
```

The subscription listens to all events (`*`) so both toggling `active` (UPDATE) and adding a new item (INSERT) propagate immediately.

## Loading and error states

- **Loading**: spinner + "Loading menu…" shown while fetch is in-flight
- **Error**: "Menu unavailable, please ask staff" shown if the Supabase query fails — no crash, no empty screen

## How to test live-update behaviour

1. Open kiosk at `http://localhost:5174` — navigate to Menu screen, confirm real Roast CCx items appear (325 items across the real categories)
2. In a second browser tab open POS at `http://localhost:5173` → Menu Items admin (`/admin/menu-items`)
3. Toggle any item's Active switch OFF in the POS admin
4. Watch the kiosk — the item should disappear from the menu within ~1–2 seconds (Realtime event triggers a re-fetch)
5. Toggle it back ON — item reappears within ~1–2 seconds

## Notes

- Category tabs are now dynamic and derived from DB values (e.g. `breakfast_platters`, `sweets_and_toasts`). Underscores are replaced with spaces for display.
- Prices display in ₹ (rupees) — the old static data used `$` which was incorrect for Roast CCx.
- No image column exists in `menu_items`. Images are deferred to a future milestone.
- The `menu_items` Realtime publication is added via migration `0006_menu_items_realtime.sql`. After any `supabase db reset`, re-run `scripts/import_menu.py` to restore the 325 items.
