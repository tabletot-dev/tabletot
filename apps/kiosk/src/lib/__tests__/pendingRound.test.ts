import { describe, it, expect, beforeEach } from "vitest";
import {
  HOLD_DURATION_MS,
  savePendingRound,
  loadPendingRound,
  clearPendingRound,
  isExpired,
} from "@/lib/pendingRound";
import type { OrderItem } from "@/data/menu";

const items: OrderItem[] = [
  { id: "i1", name: "Avocado Toast", price: 390, quantity: 1, category: "Breakfast", tags: [], is_veg: true },
];

describe("pendingRound", () => {
  beforeEach(() => sessionStorage.clear());

  it("holds for two minutes", () => {
    expect(HOLD_DURATION_MS).toBe(120_000);
  });

  it("returns null when nothing is held", () => {
    expect(loadPendingRound()).toBeNull();
  });

  it("round-trips a held round through sessionStorage", () => {
    const deadline = Date.now() + HOLD_DURATION_MS;
    savePendingRound({ items, deadline });
    expect(loadPendingRound()).toEqual({ items, deadline });
  });

  it("clears", () => {
    savePendingRound({ items, deadline: Date.now() + HOLD_DURATION_MS });
    clearPendingRound();
    expect(loadPendingRound()).toBeNull();
  });

  it("reports a passed deadline as expired", () => {
    const now = 1_000_000;
    expect(isExpired({ items, deadline: now - 1 }, now)).toBe(true);
    expect(isExpired({ items, deadline: now + 1 }, now)).toBe(false);
  });

  // A kiosk that reboots mid-hold must not resurrect a corrupt round and
  // submit garbage to the kitchen. Bad JSON is treated as no round at all.
  it("survives corrupt storage without throwing", () => {
    sessionStorage.setItem("tt_pending_round", "{not json");
    expect(loadPendingRound()).toBeNull();
  });

  it("rejects a stored value that is missing its items array", () => {
    sessionStorage.setItem("tt_pending_round", JSON.stringify({ deadline: 1 }));
    expect(loadPendingRound()).toBeNull();
  });
});
