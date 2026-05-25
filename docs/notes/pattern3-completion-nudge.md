# Pattern 3: Pre-Submit Completion Nudge

## How the confirm-order intercept works

`handleConfirmOrder` in `apps/kiosk/src/pages/Index.tsx` is async. When the user taps
"Confirm Order" in `OrderSummaryScreen`:

1. Query `meal_completion_rules` (`active=true`, ordered by `priority DESC`)
2. Evaluate each rule's condition against the current cart (`order` state)
3. **If a matching rule is found**: set `completionSuggestion` state — this mounts
   `<CompletionNudge>` as a modal overlay. `submitOrder()` is NOT called yet.
4. **If no matching rule** (or DB error): call `confirmOrder()` directly — normal flow.

`CompletionNudge` renders as an `absolute inset-0 z-50` overlay on the device frame,
blocking interaction with the screen behind it.

## The two supported condition types

Conditions live in the `condition` jsonb column of `meal_completion_rules`.

| Type | Example | Evaluates to true when |
|---|---|---|
| `has_category` | `{"has_category": "Mains"}` | Cart contains ≥1 item whose `category` equals the value |
| `missing_category` | `{"missing_category": "Beverages"}` | Cart contains NO item whose `category` equals the value |

Rules are evaluated in `apps/kiosk/src/lib/completionRules.ts` (`findMatchingRule`).
The **first rule** (highest priority) whose condition is true wins.

### Adding more condition types

Add a new branch in `evalCondition()` in `completionRules.ts`. The function receives
the full `condition` object and the `order: OrderItem[]` array — anything computable
from those two inputs can be supported (e.g. `{"cart_total_below": 500}`,
`{"item_count_below": 2}`).

## How `suggestion` jsonb should be structured

```json
{
  "text": "Add a drink to complete your meal?",
  "item_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

- `text`: shown verbatim in the modal heading
- `item_id`: UUID of the `menu_items` row to suggest. `CompletionNudge` fetches the
  item name and price from DB at render time. If the item is inactive or not found,
  the component calls `onSkip()` immediately (no modal shown — order goes through).

### Full example rule row

```sql
INSERT INTO meal_completion_rules (rule_name, condition, suggestion, priority, active)
VALUES (
  'Missing beverage',
  '{"missing_category": "beverages"}',
  '{"text": "Add a drink to complete your meal?", "item_id": "<uuid>"}',
  10,
  true
);
```

## How event logging works

`CompletionNudge` logs to `recommendation_events` on mount (after the item fetch succeeds):

| field | value |
|---|---|
| `pattern_type` | `'completion_nudge'` |
| `item_shown` | suggested item UUID |
| `item_accepted` | `false` (initial insert) |
| `cart_value_at_show` | `totalBill` at the moment "Confirm Order" was tapped |
| `session_id` | session UUID from `sessionStorage` (`tt_session_id`) |
| `table_id` | `null` |

When "Add [item name]" is tapped: `item_accepted` is flipped to `true` via UPDATE.
When "No thanks, place order" is tapped: row stays `item_accepted = false`.

After "Add": the user is returned to the order-summary screen to review before
re-confirming. A second "Confirm Order" tap re-runs the rule evaluation — the rule
may no longer match (e.g. a beverage was just added), so the order goes through.

## Known limitation

The nudge is invisible until `meal_completion_rules` is populated. With an empty table,
the query returns 0 rows, `findMatchingRule` returns `null`, and `confirmOrder()` fires
directly. This is correct and expected behaviour.
