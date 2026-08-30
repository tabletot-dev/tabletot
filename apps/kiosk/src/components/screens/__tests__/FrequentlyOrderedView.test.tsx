import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AnchorItem } from "@/lib/menuStore";

const menu = vi.hoisted(() => ({ anchors: [] as AnchorItem[] }));
vi.mock("@/lib/menuStore", () => ({
  useMenu: () => ({ anchors: menu.anchors, pairingsByItemId: {} }),
}));

// Testing the list screen, not DishCard (which has its own tests).
vi.mock("@/components/DishCard", () => ({
  default: ({ item }: { item: { name: string } }) => (
    <div data-testid="dish">{item.name}</div>
  ),
}));

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/eventBus", () => ({ track }));

import FrequentlyOrderedView from "@/components/screens/FrequentlyOrderedView";

const anchor = (over: Partial<AnchorItem>): AnchorItem => ({
  id: "a1",
  name: "Anchor",
  price: 100,
  category: "Coffee",
  tags: [],
  is_veg: true,
  itemId: "a1",
  anchorType: "chef_pick",
  priority: 0,
  ...over,
});

const noop = () => {};
function renderView() {
  return render(
    <FrequentlyOrderedView
      order={[]}
      onSelect={noop}
      onAddToCart={noop}
      onUpdateQuantity={noop}
      onBack={noop}
    />,
  );
}

describe("FrequentlyOrderedView — the 'Popular' screen (C1/C2)", () => {
  beforeEach(() => {
    menu.anchors = [];
    track.mockClear();
  });

  it("renders anchors highest-priority first", () => {
    menu.anchors = [
      anchor({ id: "low", name: "Low", priority: 1 }),
      anchor({ id: "high", name: "High", priority: 9 }),
      anchor({ id: "mid", name: "Mid", priority: 5 }),
    ];
    renderView();
    const names = screen.getAllByTestId("dish").map((n) => n.textContent);
    expect(names).toEqual(["High", "Mid", "Low"]);
  });

  it("shows the empty state when no anchors are configured", () => {
    menu.anchors = [];
    renderView();
    expect(screen.getByText("Ask the team for today's picks.")).toBeInTheDocument();
    expect(screen.queryByTestId("dish")).not.toBeInTheDocument();
  });

  it("uses the user-facing label 'Popular', not 'Recommended' / 'Frequently Ordered'", () => {
    menu.anchors = [anchor({})];
    renderView();
    expect(screen.getByRole("heading", { name: "Popular" })).toBeInTheDocument();
  });

  it("fires one recommendation_shown per anchor (discovery attribution)", () => {
    menu.anchors = [anchor({ id: "a1" }), anchor({ id: "a2", name: "Two" })];
    renderView();
    expect(track).toHaveBeenCalledWith("recommendation_shown", { itemId: "a1", surface: "popular" });
    expect(track).toHaveBeenCalledWith("recommendation_shown", { itemId: "a2", surface: "popular" });
  });
});
