# Kiosk App Review

Scope reviewed:
- `src/components/screens/CartView.tsx`
- `src/components/screens/DetailView.tsx`
- `src/components/screens/MenuView.tsx`
- `src/lib/menuStore.ts`
- `src/styles/tabletot.css`

Related runtime paths inspected for verification:
- `src/pages/Index.tsx`
- `src/hooks/useDeviceNavigation.ts`
- `src/lib/orderSubmission.ts`
- `src/components/DishCard.tsx`
- `src/components/screens/HomeView.tsx`
- `src/components/screens/WaitingView.tsx`

## Findings

### P0: Launch blockers

1. **Displayed total does not match submitted total**
   - `CartView` shows GST and a grand total.
   - `submitOrder()` writes `total: subtotal` and never applies GST.
   - Result: the customer sees one amount and the backend records another.
   - References:
     - `src/components/screens/CartView.tsx:26`
     - `src/components/screens/CartView.tsx:113`
     - `src/lib/orderSubmission.ts:39`

2. **Confirm Order can be double-submitted**
   - The confirm button has no in-flight state, no submit lock, and no idempotency key.
   - The order submission path is async and non-idempotent.
   - Result: tap spam can create duplicate `orders` and duplicate `kot_tickets`.
   - References:
     - `src/components/screens/CartView.tsx:117`
     - `src/pages/Index.tsx:152`
     - `src/hooks/useDeviceNavigation.ts:54`
     - `src/lib/orderSubmission.ts:34`

3. **`useMenu()` is not a shared store; it is a per-mount fetcher**
   - `MenuView`, `DetailView`, `HomeView`, `WaitingView`, and `Index` all call `useMenu()`.
   - Each mount creates its own state, its own Supabase reads, and its own realtime subscription.
   - Result: duplicate network traffic, duplicate subscriptions, and inconsistent snapshots between screens.
   - References:
     - `src/lib/menuStore.ts:28`
     - `src/pages/Index.tsx:56`
     - `src/components/screens/HomeView.tsx:23`
     - `src/components/screens/WaitingView.tsx:22`
     - `src/components/screens/MenuView.tsx:102`
     - `src/components/screens/DetailView.tsx:13`

4. **Realtime subscription is scoped wrong and will refetch too often**
   - Subscription listens to all `menu_items` changes in the table.
   - There is no `restaurant_id` scoping in the subscription filter.
   - Every event triggers a full `fetchAll()`.
   - Result: in a multi-tenant DB, unrelated menu edits can thrash every kiosk.
   - References:
     - `src/lib/menuStore.ts:108`
     - `src/lib/menuStore.ts:111`
     - `src/lib/menuStore.ts:112`

5. **`fetchAll()` is race-prone**
   - Initial load and realtime refresh can overlap.
   - There is no abort, request version, or stale-response guard.
   - Result: an older response can land last and overwrite newer state.
   - References:
     - `src/lib/menuStore.ts:35`
     - `src/lib/menuStore.ts:105`
     - `src/lib/menuStore.ts:111`

6. **`fetchAll()` can leave the kiosk stuck in loading forever**
   - Only `menuRes.error` is checked.
   - There is no `try/catch/finally` around the whole async flow.
   - Any thrown exception before `setLoading(false)` leaves the screen spinning indefinitely.
   - References:
     - `src/lib/menuStore.ts:35`
     - `src/lib/menuStore.ts:56`
     - `src/lib/menuStore.ts:102`

### P1: High severity

7. **Pairing and anchor failures are silently swallowed**
   - `pairingsRes.error` and `anchorsRes.error` are ignored.
   - Failure degrades to empty pairings/anchors with no error signal, no logging, and no user recovery.
   - Result: recommendation features fail silently and debugging production issues gets harder.
   - References:
     - `src/lib/menuStore.ts:36`
     - `src/lib/menuStore.ts:44`
     - `src/lib/menuStore.ts:48`
     - `src/lib/menuStore.ts:56`
     - `src/lib/menuStore.ts:85`

8. **Realtime updates ignore data this UI actually depends on**
   - Subscription only listens to `menu_items`.
   - `pairingsByItemId` depends on `item_pairings`.
   - `anchors` depend on `anchor_items`.
   - Result: relevant changes to pairings or anchors do not propagate to the kiosk until some unrelated `menu_items` event happens.
   - References:
     - `src/lib/menuStore.ts:44`
     - `src/lib/menuStore.ts:48`
     - `src/lib/menuStore.ts:111`

9. **Menu failure state has no recovery path**
   - `MenuView` shows an error message and stops.
   - There is no Retry button, no timed retry, and no fallback action besides asking staff.
   - Result: a transient failure can leave a table kiosk dead until someone reloads the app or a DB event happens.
   - References:
     - `src/components/screens/MenuView.tsx:133`
     - `src/lib/menuStore.ts:57`

10. **Dietary data defaults in the wrong direction**
    - `is_veg` falls back to `true` when data is missing.
    - Result: unknown items are mislabeled as vegetarian.
    - In a real restaurant, that is a trust and dietary-risk issue.
    - References:
      - `src/lib/menuStore.ts:68`
      - `src/lib/menuStore.ts:69`
      - `src/components/screens/DetailView.tsx:35`
      - `src/components/screens/MenuView.tsx:110`

11. **Category selection can drift to a dead value after live refresh**
    - `resolvedCategory` prefers `activeCategory` even if that category no longer exists.
    - There is no reconciliation after menu updates.
    - Result: the user can land on a blank menu pane with no self-correction.
    - References:
      - `src/components/screens/MenuView.tsx:103`
      - `src/components/screens/MenuView.tsx:106`
      - `src/components/screens/MenuView.tsx:109`

12. **Cart CTA is easy to lose on long screens**
    - The cart bar is rendered after the entire workspace and is not sticky or fixed.
    - Result: on a long menu, checkout falls below the fold and becomes easy to miss.
    - References:
      - `src/components/screens/MenuView.tsx:221`
      - `src/styles/tabletot.css:1884`

13. **Detail screen pays for a full menu fetch to show pairings for one item**
    - `DetailView` calls `useMenu()` again just to read `pairingsByItemId[item.id]`.
    - Result: avoidable redundant reads and another subscription on a very common navigation path.
    - References:
      - `src/components/screens/DetailView.tsx:13`
      - `src/components/screens/DetailView.tsx:14`
      - `src/lib/menuStore.ts:28`

### P2: Medium severity

14. **Hot-path render does repeated linear scans for quantity lookup**
    - `getQty()` does `order.find()`.
    - It is called once per menu card render.
    - Cost scales with `items × order size` on the busiest screen.
    - References:
      - `src/components/screens/MenuView.tsx:115`
      - `src/components/screens/MenuView.tsx:202`
      - `src/components/screens/MenuView.tsx:206`

15. **Cart count is recomputed twice in one render**
    - The floating cart text does the same `reduce()` twice.
    - It is minor, but pointless churn on a frequently re-rendered screen.
    - References:
      - `src/components/screens/MenuView.tsx:223`

16. **Touch targets are below kiosk-safe minimums**
    - Card stepper buttons are `36x36`.
    - Cart stepper buttons are `40x40`.
    - The detail back action is a plain text button with no enforced minimum target.
    - Result: mis-taps are likely on shared tablets.
    - References:
      - `src/styles/tabletot.css:791`
      - `src/styles/tabletot.css:792`
      - `src/styles/tabletot.css:1398`
      - `src/styles/tabletot.css:1399`
      - `src/styles/tabletot.css:1915`

17. **Previous order rows can overflow badly with long dish names**
    - `round.items.map((i) => i.name).join(", ")` is rendered into the middle column.
    - `.previous-round` has a three-column grid but no truncation or wrapping guard for that middle text.
    - Result: layout breakage on large orders or verbose menu names.
    - References:
      - `src/components/screens/CartView.tsx:90`
      - `src/styles/tabletot.css:1953`

18. **CartView API is already drifting**
    - `sessionTotal` and `onRemoveItem` are accepted props but unused.
    - Result: this screen contract is already out of sync with actual behavior, which usually means partial UX implementation.
    - References:
      - `src/components/screens/CartView.tsx:11`
      - `src/components/screens/CartView.tsx:15`
      - `src/components/screens/CartView.tsx:18`

## Fix list

### Immediate fixes

1. **Fix pricing consistency**
   - Define one source of truth for subtotal, tax, and total.
   - Reuse the same calculation in `CartView` and `submitOrder()`.
   - If GST is only display-only, remove it from the UI until the backend supports it.

2. **Add submit locking and idempotency**
   - Add `isSubmitting` state in the order confirmation path.
   - Disable the Confirm button and show a pending label while the request is in flight.
   - Add an idempotency key to the backend write path if the schema supports it.

3. **Replace `useMenu()` with a real shared store/provider**
   - Fetch menu data once at app level.
   - Expose menu state through context or a shared store.
   - Remove per-screen fetches and subscriptions.

4. **Fix realtime scoping**
   - Add a `filter` for `restaurant_id=eq.<id>` on the subscription.
   - Stop listening to all tenants.
   - Listen to only the tables needed by the kiosk: `menu_items`, `item_pairings`, and `anchor_items`.

5. **Make `fetchAll()` safe under concurrency**
   - Wrap it in `try/catch/finally`.
   - Track a request sequence number or active token.
   - Ignore stale responses from older requests.

### High-priority fixes

6. **Handle partial query failures explicitly**
   - Check `pairingsRes.error` and `anchorsRes.error`.
   - Decide whether each should be fatal, degraded-with-banner, or degraded-with-logging.
   - Do not silently convert operational failures into empty recommendations.

7. **Add a recovery path for menu failure**
   - Add a Retry button in the `MenuView` error state.
   - Optionally add automatic retry with backoff.
   - Expose the retry function from the shared menu store/provider.

8. **Stop defaulting unknown diet to vegetarian**
   - Make `is_veg` nullable in UI state, or introduce `dietaryType: 'veg' | 'nonveg' | 'unknown'`.
   - Render unknown clearly instead of lying.

9. **Reconcile `activeCategory` after menu refresh**
   - If the active category disappears, reset to the first valid category.
   - If categories become empty, show an explicit empty menu state instead of a blank grid.

10. **Pass pairings into `DetailView` instead of refetching**
    - Read pairings once from shared menu state.
    - Avoid a second full fetch on detail navigation.

### Secondary fixes

11. **Precompute order quantities**
    - Build a `Map<string, number>` from `order` once with `useMemo()`.
    - Use O(1) lookups in `MenuView`.

12. **Memoize cart count**
    - Compute item count once per render and reuse it.

13. **Raise touch targets to kiosk minimum**
    - Make all actionable controls at least `48x48`.
    - Increase spacing between decrement/increment buttons.
    - Give the detail back control a proper button target.

14. **Harden previous-order layout**
    - Add `min-width: 0` to the middle text container.
    - Add truncation or multi-line clamp.
    - Consider showing only item count plus first item name.

15. **Clean up dead props in `CartView`**
    - Either wire up `sessionTotal` and `onRemoveItem`, or remove them from the contract.

## Suggested implementation order

1. Pricing consistency
2. Double-submit protection
3. Shared menu store/provider
4. Realtime scoping and table coverage
5. `fetchAll()` error handling and stale-response protection
6. Retry path for menu failure
7. Dietary data correctness
8. Category reconciliation
9. Touch target fixes
10. Render-path cleanups and layout hardening
