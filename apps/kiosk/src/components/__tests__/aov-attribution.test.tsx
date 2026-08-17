// src/components/__tests__/aov-attribution.test.tsx
//
// This file is the guard on the only two event sources that feed
// get_aov_summary's direct_revenue (migration 0050): 'pairing_chip' and
// 'completion_nudge'. The redesign moves every surface that emits them.
// If these tests go red, the owner-facing AOV number is about to go wrong
// and nothing else in the app will error to tell you.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";

// vi.hoisted, not plain consts: vi.mock factories are hoisted above the module
// body, so a factory referencing a normal const would read it before
// initialisation. The fixtures have to be hoisted alongside the mocks.
const fx = vi.hoisted(() => ({
  toast: {
    id: "i1", name: "Avocado Toast", price: 390,
    category: "Breakfast", tags: [] as string[], is_veg: true,
  },
  coldBrew: {
    id: "i2", name: "Silver Cold Brew", price: 290,
    category: "Coffee", tags: [] as string[], is_veg: true,
    context: null, priority: 10,
  },
}));

vi.mock("@/lib/eventBus", () => ({ track: vi.fn() }));

vi.mock("@/lib/menuStore", () => ({
  useMenu: () => ({
    items: [fx.toast],
    itemsByCategory: { Breakfast: [fx.toast] },
    categories: ["Breakfast"],
    pairingsByItemId: { i1: [fx.coldBrew] },
    anchors: [],
    completionRules: [],
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

import DishCard from "@/components/DishCard";
import MenuView from "@/components/screens/MenuView";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import { track } from "@/lib/eventBus";
import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";

const toast = fx.toast as MenuItem;
const coldBrew = fx.coldBrew as PairedItem;

function renderDishCard(qty: number, onAddPairing = vi.fn()) {
  render(
    <DishCard
      item={toast}
      qty={qty}
      pairings={[coldBrew]}
      cartTotal={qty * toast.price}
      onAddToCart={vi.fn()}
      onUpdateQuantity={vi.fn()}
      onSelect={vi.fn()}
      onAddPairing={onAddPairing}
      getQuantity={() => 0}
    />,
  );
  return onAddPairing;
}

describe("pairing panel (AOV surface: pairing_chip)", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("stays hidden until the dish is in the cart", () => {
    renderDishCard(0);
    expect(screen.queryByRole("button", { name: /Add Silver Cold Brew/i })).toBeNull();
    expect(track).not.toHaveBeenCalledWith("recommendation_shown", expect.anything());
  });

  it("fires recommendation_shown once the dish is in the cart", () => {
    renderDishCard(1);
    expect(track).toHaveBeenCalledWith("recommendation_shown", {
      itemId: "i2",
      surface: "inline_pairing",
    });
  });

  it("fires recommendation_tapped and hands the item up on Add", () => {
    const onAddPairing = renderDishCard(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Silver Cold Brew/i }));
    expect(track).toHaveBeenCalledWith("recommendation_tapped", {
      itemId: "i2",
      surface: "inline_pairing",
    });
    expect(onAddPairing).toHaveBeenCalledWith(coldBrew);
  });
});

describe("cart hook emits the AOV-critical sources verbatim", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("emits item_added with source pairing_chip", () => {
    const { result } = renderHook(() => useDeviceNavigation());
    act(() => result.current.addToOrder(coldBrew, "pairing_chip"));
    expect(track).toHaveBeenCalledWith("item_added", {
      itemId: "i2",
      source: "pairing_chip",
    });
  });

  it("emits item_added with source completion_nudge", () => {
    const { result } = renderHook(() => useDeviceNavigation());
    act(() => result.current.addToOrder(toast, "completion_nudge"));
    expect(track).toHaveBeenCalledWith("item_added", {
      itemId: "i1",
      source: "completion_nudge",
    });
  });
});

describe("MenuView wires the pairing Add to source pairing_chip", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("calls onAddToCart with the literal string pairing_chip", () => {
    const onAddToCart = vi.fn();
    render(
      <MenuView
        onSelect={vi.fn()}
        onAddToCart={onAddToCart}
        onUpdateQuantity={vi.fn()}
        order={[{ ...toast, quantity: 1 }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add Silver Cold Brew/i }));
    expect(onAddToCart).toHaveBeenCalledWith(coldBrew, "pairing_chip");
  });
});
