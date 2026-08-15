# Kiosk + POS Live QA Findings (2026-08-13)

Manual black-box QA via live browser automation against local Supabase +
local kiosk (8080) + local POS (8081), on branch `kiosk-redesign` post
Sprints 0-5. Simulated two separate customer visits to Table T1 (voice
assumed offline, touch-only), each fully ordered and cash-settled through
POS using the admin test login. No code changed during this session —
findings only, for later refactoring.

## Bugs

1. **Order-name state leaks across a canceled round, invisibly.**
   Typed a guest name into "Name for this order," then used "Cancel round."
   On the next round, the name input didn't render on the Review screen at
   all (no field, nothing to edit) — but the order that got sent was still
   silently labeled with the old name on the confirmation screen
   ("Your order is being prepared, X"). A different customer seated after a
   canceled round would have their order mislabeled with no way to see or
   fix it. Likely in the kiosk round/order-name state management — probably
   near wherever `orderName`/guest-name state lives relative to round
   cancel/reset logic.

2. **Orphaned "ready" KOTs never expire and resurface as a table's active
   bill.** Kitchen Display (`/kitchen`) had 5 stuck tickets at QA time, one
   ~15,304 min old (~10.6 days), four others ~6,340-6,407 min old (~4.4
   days) — all pre-existing test debris, never completed/archived. After
   settling each of the two fresh test orders, the POS Billing screen for
   Table T1 immediately picked up one of these ancient stuck tickets as
   "the current bill" for the table, complete with stale bill-requested /
   water-requested flags still showing active. There's no cleanup/expiry
   for orders stuck in `ready`. See `docs/notes/kot-order-lifecycle-fixes.md`
   — this may be a gap in (or regression of) that prior fix; that note's
   fixes addressed KOT↔Order cross-talk and bill-finalization locking but
   apparently not "an order stuck in ready forever" as a case. Whoever picks
   this up should check whether "current order for table" logic in
   `Billing.tsx` needs to filter/expire stale `ready` orders, and whether
   KOTs need a terminal timeout.

3. **Table grid briefly showed "Free" for an occupied table with a pending
   bill request**, right after logging into POS (bell badge visible, text
   said "Free"). Self-corrected on the very next order at the same table —
   looks like stale state / a race condition on initial load rather than a
   hard failure, but worth a repro attempt since a host seating off that
   grid could seat a walk-in at an "occupied" table in that window.

4. **Brief black/near-blank screen flash** on kiosk when transitioning from
   "Review order" to the "Going to the kitchen" countdown screen. Resolved
   on its own after ~2s. Possibly a FOUC/theme-transition artifact.

## UX friction

5. **"Continue Browsing" (only way back to menu from Review) sits below the
   fold**, under the primary orange "Send to kitchen" button, once the cart
   has enough items to fill the viewport. No visible way back without
   scrolling past the primary CTA first.

6. **Bill request forces a phone number with no skip option.** Submit is
   disabled until a number is entered; "Back" cancels the whole bill
   request rather than allowing it without a number. No stated purpose is
   shown to the customer for why a phone number is needed just to get the
   card reader brought over.

7. **Grammar bug:** category header reads "1 **dishes**" for a
   single-item category (no singular/plural handling).

8. **Cart-review item thumbnails revert to gray placeholders** even after
   the same images loaded fine in the menu grid moments earlier —
   inconsistent right before the customer commits to paying.

## Product / business concern

9. **"Goes well with" pairings look formulaic rather than curated.** Across
   three different dishes added in this session, the same handful of coffee
   items kept surfacing regardless of fit: Avocado Toast → Cappuccino,
   spicy Arrabiata pasta → Cappuccino again, fried chicken burger →
   "Espresso Cranberry" (a cold drink, fries, or sauce upsell would read as
   more deliberate). If this pattern holds at scale, repeat customers may
   notice the pairings aren't really dish-specific, undermining trust in
   the pairing nudge — the mechanic the AOV-lift measurement depends on.
   Worth a data check on `item_pairings` for Silver's menu to see if
   coverage is thin (falling back to a default/most-popular item) rather
   than genuinely per-dish.

## Minor polish

- Category tab bar scrolls horizontally with no arrow/gradient hint that
  more categories exist off-screen.
- Bill screen's "Continue Ordering" is consistently above the fold, unlike
  Review screen's "Continue Browsing" — worth aligning placement between
  the two.
