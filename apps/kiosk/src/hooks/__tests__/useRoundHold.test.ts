import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRoundHold } from "@/hooks/useRoundHold";
import { HOLD_DURATION_MS } from "@/lib/pendingRound";
import type { OrderItem } from "@/data/menu";

const items: OrderItem[] = [
  { id: "i1", name: "Avocado Toast", price: 390, quantity: 1, category: "Breakfast", tags: [], is_veg: true },
];

describe("useRoundHold — display name threading", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  // Regression test for the order-name leak: identity must only reach the
  // caller at the moment a round actually, irreversibly submits (expiry or
  // sendNow) — never at startHold, so a cancelled round can't leak a name.
  it("carries the displayName captured at startHold through to onExpire when the hold naturally expires", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useRoundHold(onExpire));

    act(() => {
      result.current.startHold(items, "Priya");
    });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS + 1000);
    });

    expect(onExpire).toHaveBeenCalledWith(items, "Priya");
  });

  it("carries the displayName through on sendNow (immediate send)", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useRoundHold(onExpire));

    act(() => {
      result.current.startHold(items, "Priya");
    });
    act(() => {
      result.current.sendNow();
    });

    expect(onExpire).toHaveBeenCalledWith(items, "Priya");
  });

  it("never calls onExpire for a cancelled hold, so a stale name can't leak into the next round", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useRoundHold(onExpire));

    act(() => {
      result.current.startHold(items, "Priya");
    });
    act(() => {
      result.current.cancelHold();
    });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS + 1000);
    });

    expect(onExpire).not.toHaveBeenCalled();
  });
});
