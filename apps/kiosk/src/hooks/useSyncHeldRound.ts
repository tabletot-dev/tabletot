import { useEffect } from "react";
import type { OrderItem } from "@/data/menu";

interface HoldHandle {
  isHolding: boolean;
  extendHold: (items: OrderItem[]) => void;
}

// Keeps an active hold's captured round in sync with the live cart.
//
// useRoundHold.extendHold exists precisely for this ("adding an item during
// the hold restarts the clock — otherwise an item added at 1:58 would reach
// the kitchen two seconds later, on its own") but was never called from
// anywhere (2026-08-28 audit, finding 5). Without it, an item added via
// "Order more" while the countdown is running is invisible to the held
// round: it is not part of what SentView shows the guest, not part of what
// reaches the kitchen when the hold expires, and — because the cart is
// reset to [] once that round submits — the item is silently lost rather
// than carried into a next round.
//
// Deliberately keyed on `order` alone, not `[order, hold.isHolding]`: a
// reload restores an in-progress hold by flipping `hold.isHolding` true
// while `order` is still the freshly-mounted empty array (the cart itself
// is never persisted — see useDeviceNavigation.confirmOrder). Depending on
// `hold.isHolding` too would re-fire this effect at that exact moment and
// wipe the just-restored round with extendHold([]). Keying on `order` only
// means this never fires on a bare isHolding flip — only on a genuine cart
// mutation — which is what the reload-restore path needs.
export function useSyncHeldRound(order: OrderItem[], hold: HoldHandle): void {
  useEffect(() => {
    if (hold.isHolding) {
      hold.extendHold(order);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);
}
