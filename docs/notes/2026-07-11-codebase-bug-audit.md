# Codebase Bug Audit — 2026-07-11

Full read of kiosk, POS, dashboard, order-engine backend entry point, and all
migrations (submit_order RPC, triggers, RLS, AOV summary). Findings only —
nothing fixed yet. Branch: `pilot-hardening`.

**TL;DR:** Three ways a customer hits a dead end or gets kicked out mid-order,
AOV numbers inflated for multi-round sessions, one recommendation surface
silently dead (type error that `vite build` doesn't catch), and POS menu edits
never reach the kiosk or voice engine.

---

## Critical — customer cannot order, or loses their session

### C1. Home hero dish tap bypasses session creation → order submit fails
`startSession()` (creates the `sessions` row) is only called from the
"Start Ordering" button (`apps/kiosk/src/pages/Index.tsx:322`). The HomeView
chef-pick spotlight calls `onSelectItem` (`Index.tsx:326`) and jumps straight
to `item-detail`/`menu`. A customer entering that way builds a cart, taps
Confirm, and `submit_order` raises `'Session not found.'`
(`supabase/migrations/0045:59-61`) → raw `alert()`, no recovery path.

### C2. Missed Realtime event permanently bricks the kiosk session
Kiosk resets after settle only via the `restaurant_tables` Realtime event
(`Index.tsx:89-117`). If the tablet was asleep/offline at that moment,
`sessionStorage` keeps the old `tt_session_id` / `tt_order_id`. Next
"Start Ordering": the upsert uses `ignoreDuplicates: true`
(`apps/kiosk/src/lib/orderSubmission.ts:130-140`), so the closed session row
is never reactivated. Every submit fails "ordering is closed" (or
`'Order … not found'` since PaymentModal deleted the order row). Reload
doesn't help — only manually clearing sessionStorage does.

### C3. New customers can see "Payment Confirmed" + session wipe seconds after starting
`startSession` closes stale open sessions for the table
(`orderSubmission.ts:122-127`). The `free_table_on_session_close` trigger
(migration 0019) flips the table to `available`. The kiosk's own subscription
sees `status === 'available'` while the screen is already `menu` → shows the
payment-confirmed overlay and calls `handleEndSession()` after 3s
(`Index.tsx:101-113`), destroying the brand-new session. Fires whenever the
previous party's session was left open (walkout, staff forgot to settle).

---

## High — pilot metrics wrong, features silently dead

### H1. AOV "direct revenue" multiplied by number of order rounds
In `get_aov_summary` v3 (`supabase/migrations/0043`), the `submitted_orders`
CTE has one row **per `order_submitted` event** (no DISTINCT). `survived`
joins `rec_adds` on `session_key`, so a 2-round session counts every accepted
recommendation twice; 3 rounds, three times. The eventBus retry queue can also
double-insert `order_submitted` after a lost response, multiplying further.
`accepted_count` and `direct_revenue` — the pilot's headline numbers — inflate.

### H2. "House Specials" anchor rail never renders
`MiniCartSidebar.tsx:35` destructures `isTreatment` from `useRestaurant()`,
but that field doesn't exist on the context (`restaurantContext.tsx`). Always
`undefined` → the section at line 192 never mounts. Ships because the kiosk
build is `vite build` with no `tsc` step (`apps/kiosk/package.json`). One of
the three recommendation surfaces is dead on the test device.

### H3. Menu items created in POS never appear on kiosk or voice
`apps/pos/src/pages/Menu.tsx:76-90` inserts into `menu_items` without
`restaurant_id` (no DB default on that table — 0033 only covered
`restaurant_tables`). Kiosk fetches with `.eq('restaurant_id', …)` → new items
invisible. Same gap in POS `Billing.tsx:352-367`: POS-created orders have
`restaurant_id` NULL, which also excludes them from `get_aov_summary`'s
revenue window.

### H4. Voice-engine `/admin/refresh-menu` broken twice over
`services/order-engine/backend/main.py:196`: `Request` never imported; with
`from __future__ import annotations` FastAPI resolves it as a **required query
parameter named `request`** (verified: `dependant.request_param_name = None`,
query params `['request']`) → every call 422s. Even if fixed, POS calls it
without the required `X-Admin-Key` header (`apps/pos/src/pages/Menu.tsx:24-27`)
→ 403, error swallowed by `.catch(() => {})`. Menu edits reach voice only via
the 6-hour background cycle. Also refreshes only `_menus`, not `_menu_graphs`.

### H5. Completion nudge can loop and double-submit orders
- `findMatchingRule` (`apps/kiosk/src/lib/completionRules.ts`) never checks
  whether the suggested item is already in the cart. Any `has_category` rule —
  or a `missing_category` rule whose suggestion is a different category —
  re-matches on the next Confirm tap → repeat nudges / duplicate adds. Rules
  are hand-edited in Supabase Studio; nothing prevents this shape.
- `handleCompletionSkip` (`Index.tsx:275-278`) calls `confirmOrder()` directly,
  bypassing the `isSubmitting` guard and overlay. Cart stays interactive during
  the in-flight submit; a second Confirm tap starts a second round-1 submit
  with `existingOrderId = null` → two `orders` rows, two KOTs to the kitchen.

---

## Medium — wrong numbers shown, degraded flows

### M1. Bill screen total disagrees with its own itemization
`sessionTotal` includes the current *unsent* cart
(`useDeviceNavigation.ts:104`), but BillView itemizes only sent rounds. The
displayed total is higher than the listed lines and than what POS charges.

### M2. Failures reported as success
`BillView.submitBillRequest` catches all errors and still shows "Bill coming
your way" (`BillView.tsx:60-64`). Water request in `Index.tsx:479-491` shows
the "Water requested" toast even if the insert failed.

### M3. Kitchen status pipeline stalls
0035 trigger dropped the served mapping: archiving a KOT never advances the
order, so `orders.status` never reaches `'served'` → kiosk WaitingView stuck
at "Plating 85%" forever. All rounds share one order row: sending round 2
while round 1 is `ready` shows the new round instantly at "Plating" (trigger
only advances from `'new'`).

### M4. Mixed POS+kiosk orders corrupt quantities and totals
POS "Add Items" appends `{quantity, total}`-shaped items to `items_json`
(`Billing.tsx:379-387`); the kiosk RPC merge reads `elem->>'qty'` →
`SUM(NULL)` → merged items with `qty: null`. POS update also writes
`total = subtotal` (no tax), overwriting kiosk tax-inclusive totals —
`orders.total` means different things depending on who touched it last.

### M5. Kiosk amnesia after reload
`previousOrders` lives only in React state. After a crash/reload mid-session
the DB order is intact (rounds still merge via `tt_order_id`) but WaitingView
shows no items and BillView says "No orders yet this session" while letting
the customer request a bill.

### M6. Detail-view pairings invisible to measurement
The "Pairs well with" panel in DetailView fires no
`recommendation_shown`/`recommendation_tapped`, and adds carry source
`'detail_view'`, which `get_aov_summary` doesn't count. `getDetailPairings`
(`Index.tsx:161-175`) also fabricates a fallback "pairing" from anchors or
*any random menu item* — an uncurated recommendation surface with zero
attribution.

### M7. PaymentModal validation bypass
Clearing Amount Paid → `parseFloat('')` = NaN, and `NaN < total` is `false` —
validation passes, garbage `amount_paid` recorded (`PaymentModal.tsx:39`).

### M8. Customer phone numbers readable with the publishable key
`bill_requests` has `anon_read USING (true)` (migration 0022); anon can also
UPDATE any session/order (0032) — one table's device can close another
table's session. Pilot-tolerable except the phone-number read is PII exposure.

### M9. Going to the cart kills the voice conversation
`VoiceOrderButton` unmounts when leaving the menu screen → cleanup calls
`endSession` → new voice session on return, and `voiceTurns` resets
(`Index.tsx:131-133`). Transcript survives the modal closing but not a trip
to the cart. (Voice frozen — report only.)

---

## Low — polish, cruft, hygiene

- **L1.** `CompletionNudge` effect depends on `onSkip` (identity changes with
  cart) → can re-fire duplicate `recommendation_shown`; fetch errors
  auto-proceed to submission without distinguishing "item inactive" from
  "network down" (`CompletionNudge.tsx:24-51`).
- **L2.** `order_submitted.itemCount` is distinct cart lines, not units
  (`orderSubmission.ts:204`).
- **L3.** `?table=` URL override applies to `config.ts` `TABLE_NUMBER` but
  `restaurantContext.tsx` reads `VITE_TABLE_ID` directly — two sources of
  truth for table identity.
- **L4.** Kiosk orders show a blank heading in POS Orders (RPC never sets
  `orders.order_id`); POS-shaped items render as note-only rows in the details
  dialog (`Orders.tsx:237`); cancelling an order doesn't touch its KOTs — the
  kitchen keeps cooking.
- **L5.** WaitingView promo carousel hotlinks Unsplash — broken tiles on
  restaurant Wi-Fi without internet.
- **L6.** Bill phone input accepts any 10+ digits; convention is 10 digits
  starting 6–9.
- **L7.** Dead code: `UpsellPrompt`, `OrderSummaryScreen`, `ItemDetailScreen`,
  `SessionIdleScreen`, `OrderConfirmationScreen`, the unreachable
  `"listening"` screen, and the `recommendation_events` table (nothing writes
  to it since the event bus).
- **L8.** Root cause hygiene: kiosk and POS builds run no typechecker
  (`vite build` only; dashboard does `tsc -b`) — how H2 shipped, and it will
  happen again.

---

## Clusters (suggested fix order, when approved)

1. **Session lifecycle races:** C1, C2, C3, H5 — the ones that fall over in
   front of a customer.
2. **AOV poisoning:** H1, H3, M4, M6 — the ones that fall over in front of
   the owner.
3. Everything else by severity.
