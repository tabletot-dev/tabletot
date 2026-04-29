# Deferred: POS BillSummaryScreen needs scoping

## What's currently broken

After Beat 3, `apps/pos/src/components/screens/BillSummaryScreen.tsx` reads from `useOrderFeed()`, which returns the last 20 KOTs across all tables. The `sessionTotal` displayed there is a nonsensical cumulative sum of unrelated tables.

## Why we deferred

The fix depends on a product question, not an engineering one: what is the POS tablet's job at Roast CCx?

Three plausible jobs, each implies a different fix:

1. **Kitchen/order feed display.** Drop `sessionTotal`, render KOTs as cards by table, no per-session bill at all. Fits a counter-mounted tablet showing "what's coming out of the kitchen now."
2. **Per-table cashier billing.** Filter `feedOrders` by `table_id`. Needs a table picker on POS load (or table-id from URL).
3. **Both, with a tab toggle.** More UI work, may be the right answer for a real cashier workflow.

## What unblocks the decision

Conversation with Roast CCx owner about how the POS tablet is actually intended to be used at the counter. This is a restaurant-ops question — should not be answered solo.

## Why it's safe to park

Recommendation engine (Stage 4) does not depend on POS UI shape. `recommendation_events` writes happen from the kiosk side, and the recommendation tables are queried on the kiosk side. POS being visually broken during Stage 4 development is acceptable.

## Action item

Ask the owner during the next curation session. Until then, the cumulative-total bug stays — don't patch it speculatively, as the patch may be wrong for the actual answer.
