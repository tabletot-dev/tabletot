import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// submitOrder/track are mocked at the boundary — this test is about what
// confirmOrder submits, not the RPC/ledger plumbing underneath it.
vi.mock("@/lib/orderSubmission", () => ({
  submitOrder: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock("@/lib/eventBus", () => ({
  track: vi.fn(),
}));

import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import { submitOrder } from "@/lib/orderSubmission";
import type { OrderItem } from "@/data/menu";

const heldItems: OrderItem[] = [
  { id: "item-1", name: "Espresso", price: 180, quantity: 2, category: "Coffee", tags: [], is_veg: true },
];

describe("confirmOrder submits the items it is given, not the live cart", () => {
  beforeEach(() => {
    vi.mocked(submitOrder).mockReset();
  });

  // Reproduces the 2026-08-28 audit's finding 1: the round-hold's expiry
  // callback fires after a reload, when the in-memory `order` state is back
  // to its initial empty array (the cart itself is never persisted — only
  // the held round is, via sessionStorage). confirmOrder must still submit
  // the round it was actually asked to submit.
  it("submits the passed items even when the hook's own order state is empty", async () => {
    vi.mocked(submitOrder).mockResolvedValue({ orderId: "order-1", kotId: "kot-1" });
    const { result } = renderHook(() => useDeviceNavigation());

    expect(result.current.order).toEqual([]);

    await act(async () => {
      await result.current.confirmOrder(heldItems);
    });

    expect(submitOrder).toHaveBeenCalledWith(heldItems);
    expect(result.current.previousOrders).toHaveLength(1);
    expect(result.current.previousOrders[0].items).toEqual(heldItems);
    expect(result.current.currentScreen).toBe("order-confirmation");
  });

  it("does not call submitOrder for an empty round, but still confirms", async () => {
    const { result } = renderHook(() => useDeviceNavigation());

    await act(async () => {
      await result.current.confirmOrder([]);
    });

    expect(submitOrder).not.toHaveBeenCalled();
    expect(result.current.currentScreen).toBe("order-confirmation");
  });
});
