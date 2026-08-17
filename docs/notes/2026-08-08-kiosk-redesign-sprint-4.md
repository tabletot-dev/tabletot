# Kiosk redesign — Sprint 4 done (2-minute kitchen hold)

Sprint 4 from `docs/plans/2026-08-08-kiosk-v1-redesign.md`: the biggest
feature in the redesign. Architectural decision written up as
[ADR 0021](../decisions/0021-two-minute-kitchen-hold.md) rather than left
as a "manual step," per instruction.

## What shipped
- `src/lib/pendingRound.ts` — sessionStorage persistence for the held
  round, corrupt-JSON-safe. 7 tests.
- `src/hooks/useRoundHold.ts` — countdown state, reload recovery (late
  round submits rather than vanishing), extend-on-add plumbing (see gap
  below).
- `SentView`, `CancelConfirm` — new screens, `"sent"` added to
  `ScreenType`.
- `CartView` rebuilt single-column: `.tt-cart-row`, "Send to kitchen"
  (was "Confirm Order"), dropped the hardcoded marketing line about
  breakfast/coffee/dessert pairing.
- `Index.tsx`: `handleConfirmOrder` and `handleCompletionSkip` now call
  `hold.startHold(order)` instead of `confirmOrder()` directly — the hold's
  expiry callback is the *only* path that reaches `submitOrder`. Cart
  state (`order`) is deliberately left untouched while a hold is active,
  so "Edit round" can return to a populated cart; only "Cancel round"
  actually clears it.
- `StatusStrip` wired to show whenever `hold.isHolding` and the guest
  isn't already on the Sent screen, so the countdown survives navigation.

## Verified against the real ledger, not just the UI
This is the one sprint where "looks right" wasn't enough to trust, so I
checked `kot_tickets` / `table_events` directly in the local Supabase
instance at each step:
- **Send to kitchen → hold starts:** KOT count unchanged immediately
  after tapping Send. Confirmed the round is *not* in the kitchen yet.
- **Natural expiry:** let a real 2-minute countdown run out. KOT count
  went 10 → 11 at the exact moment the countdown hit zero and the screen
  auto-navigated to Table Status.
- **Cancel round:** started a hold, cancelled it via the modal. KOT count
  stayed at 11 — the cancelled round never reached the kitchen ledger.
- Also re-verified the Sprint 3 pairing-attribution fix here as a side
  effect of testing: `table_events.payload->>'source'` for the pairing
  stepper increment is `pairing_chip`, not `main_menu`.

## Known gap, documented rather than fixed
`extendHold()` exists on `useRoundHold` for the case where a guest adds
another item via "Order more" while a round is being held — restarting
the clock so a 1:58-old add doesn't reach the kitchen two seconds after
the original items. It is **not wired** into `handleAddToOrder`/
`handleUpdateQuantity`. The redesign plan's own Task 4.3 code sample
doesn't wire it either, so this matches plan scope rather than being an
oversight — but it's a real, visible gap: adding an item during a hold
grows the live cart without updating the `SentView` countdown's displayed
item count (the *live* cart is what actually gets submitted at expiry,
so nothing is lost financially, but the display briefly understates it).
Written up in ADR 0021's Consequences section as a flagged follow-up.

## Verified
`npm run build && npm test` green after every step (17 tests total, up
from 10 at the end of Sprint 3). Full live walkthrough via `/browse`
covering all three hold outcomes above, plus the identity-capture
interstitial (`promptForIdentity`) still gating hold start exactly as
before — confirmed that guard wasn't disturbed.
