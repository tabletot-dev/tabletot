import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSyncHeldRound } from "@/hooks/useSyncHeldRound";
import type { OrderItem } from "@/data/menu";

const itemA: OrderItem = { id: "a", name: "Espresso", price: 180, quantity: 1, category: "Coffee", tags: [], is_veg: true };
const itemB: OrderItem = { id: "b", name: "Croissant", price: 120, quantity: 1, category: "Bakery", tags: [], is_veg: true };

describe("useSyncHeldRound", () => {
  it("extends the hold when the cart changes while holding", () => {
    const extendHold = vi.fn();
    const order: OrderItem[] = [itemA];
    const { rerender } = renderHook(
      ({ order, isHolding }) => useSyncHeldRound(order, { isHolding, extendHold }),
      { initialProps: { order, isHolding: false } },
    );

    // "Send to kitchen": isHolding flips true, `order` reference unchanged
    // (mirrors handleConfirmOrder calling hold.startHold(order, ...)
    // without touching order state itself). Must not fire here.
    rerender({ order, isHolding: true });
    expect(extendHold).not.toHaveBeenCalled();

    // Guest taps "Order more" and adds an item — a genuine cart mutation.
    rerender({ order: [itemA, itemB], isHolding: true });
    expect(extendHold).toHaveBeenCalledTimes(1);
    expect(extendHold).toHaveBeenCalledWith([itemA, itemB]);
  });

  it("does nothing while not holding", () => {
    const extendHold = vi.fn();
    const { rerender } = renderHook(
      ({ order, isHolding }) => useSyncHeldRound(order, { isHolding, extendHold }),
      { initialProps: { order: [] as OrderItem[], isHolding: false } },
    );
    rerender({ order: [itemA], isHolding: false });
    expect(extendHold).not.toHaveBeenCalled();
  });

  // Reproduces the reload-restore race this hook has to survive: a reload
  // restores an in-progress hold (isHolding flips false -> true) while the
  // cart's own state is still the freshly-mounted empty array, since the
  // cart is never persisted (only the held round is). If this hook fired on
  // an isHolding change, it would call extendHold([]) at exactly that
  // moment and wipe the round get_table_state just restored.
  it("does not fire merely because isHolding flips true, with order unchanged", () => {
    const extendHold = vi.fn();
    const order: OrderItem[] = [];
    const { rerender } = renderHook(
      ({ order, isHolding }) => useSyncHeldRound(order, { isHolding, extendHold }),
      { initialProps: { order, isHolding: false } },
    );
    expect(extendHold).not.toHaveBeenCalled();

    // Same `order` reference, only isHolding changes (mirrors the restore path).
    rerender({ order, isHolding: true });
    expect(extendHold).not.toHaveBeenCalled();
  });
});
