# Pattern 2: Post-Add Pairing Nudge

## What it does

After any item is added to the cart, a small inline nudge banner appears at the bottom of the
screen saying "Goes well with [paired item name]" with an "Add ₹[price]" button and a "×" dismiss.
The nudge auto-dismisses after 8 seconds if neither button is pressed.

Only one nudge is visible at a time. Adding a new item while a nudge is showing replaces it
with a nudge for the new item.

## Where it is wired in

- **Component**: `apps/kiosk/src/components/PairingNudge.tsx`
- **Wired in**: `apps/kiosk/src/pages/Index.tsx`
  - `handleAddToOrderWithNudge` wraps `addToOrder` — captures `cartValueAtShow` (cart total
    before the add), calls `addToOrder`, then sets `nudge` state.
  - `nudge` state `{ itemId, itemName, cartValueAtShow }` is rendered as `<PairingNudge>` 
    absolutely positioned at the bottom of the device frame (`z-30`), visible on any screen.
  - When the paired item is added via the nudge, `handleAddToOrderWithNudge` is called again
    (so the paired item itself can trigger its own nudge if it has pairings).
  - `key={nudge.itemId}` ensures the component fully remounts when a new item is added,
    cancelling any in-flight query or timer from the previous nudge.

## The Supabase query

```sql
SELECT m.id, m.name, m.price
FROM item_pairings ip
JOIN menu_items m ON m.id = ip.paired_item_id
WHERE ip.source_item_id = $addedItemId
  AND m.active = true
ORDER BY ip.priority DESC
LIMIT 2
```

Only the highest-priority row with a non-null `menu_items` join is shown.
If 0 rows are returned, the component renders `null` — no banner appears.

## Event logging

Every nudge impression logs a row to `recommendation_events` immediately on mount:

| field | value |
|---|---|
| `pattern_type` | `'post_add_pairing'` |
| `item_shown` | paired item UUID |
| `item_accepted` | `false` (initial insert) |
| `cart_value_at_show` | cart total at the moment the trigger item was added |
| `session_id` | session UUID from sessionStorage (`tt_session_id`) |
| `table_id` | `null` (table association not yet wired) |

When the "Add" button is pressed: `item_accepted` is flipped to `true` via an UPDATE before
the item is added to cart.

When "×" is pressed or the 8-second timer fires: the row stays `item_accepted = false`.

## Known limitation

The nudge is invisible until `item_pairings` is populated during the owner curation session.
With an empty `item_pairings` table, every query returns 0 rows and nothing is rendered.
This is correct and expected behaviour — no fallback needed.
