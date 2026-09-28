import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";

// Control framer-motion's reduced-motion signal per test.
const motionState = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => motionState.reduced };
});

import DishCard from "@/components/DishCard";

beforeEach(() => {
  motionState.reduced = false;
});

const base: MenuItem = {
  id: "i1",
  name: "Avocado Toast",
  price: 390,
  category: "Breakfast",
  tags: [],
  is_veg: true,
};

function renderCard(item: MenuItem, opts: { qty?: number; pairings?: PairedItem[] } = {}) {
  return render(
    <DishCard
      item={item}
      qty={opts.qty ?? 0}
      pairings={opts.pairings ?? []}
      cartTotal={0}
      onAddToCart={vi.fn()}
      onUpdateQuantity={vi.fn()}
      onSelect={vi.fn()}
      onAddPairing={vi.fn()}
      getQuantity={() => 0}
    />,
  );
}

const pairing = (over: Partial<PairedItem>): PairedItem => ({
  id: "p1",
  name: "Silver Cold Brew",
  price: 290,
  category: "Iced Coffee",
  tags: [],
  is_veg: true,
  context: "with",
  priority: 1,
  ...over,
});

// A4 (pre-2026-09-28) required the "Veg"/"Non-Veg" word next to the dish
// name. The 2026-09-28 UX audit reversed that: the word next to every dish
// name read as redundant with the icon (kept only in the All/Veg/Non-Veg
// filter). The icon's accessible name still carries "Veg"/"Non-Veg" for
// screen readers — only the always-visible text label was dropped.
describe("DishCard — diet mark on the card", () => {
  it("carries the 'Veg' accessible name, with no separate visible word, for a veg dish", () => {
    renderCard(base);
    expect(screen.getByLabelText("Veg")).toBeInTheDocument();
    expect(screen.queryByText("Veg")).not.toBeInTheDocument();
  });

  it("carries the 'Non-Veg' accessible name, with no separate visible word, for a non-veg dish", () => {
    renderCard({ ...base, name: "Egg Bagel", is_veg: false });
    expect(screen.getByLabelText("Non-Veg")).toBeInTheDocument();
    expect(screen.queryByText("Non-Veg")).not.toBeInTheDocument();
  });
});

describe("DishCard — pairing chips fly-in (A5)", () => {
  it("renders the pairing chips once the item is in the cart", () => {
    renderCard(base, {
      qty: 1,
      pairings: [pairing({}), pairing({ id: "p2", name: "Cappuccino", price: 240 })],
    });
    expect(screen.getByText("Silver Cold Brew")).toBeInTheDocument();
    expect(screen.getByText("Cappuccino")).toBeInTheDocument();
  });

  it("caps the fly-in at 2 chips", () => {
    renderCard(base, {
      qty: 1,
      pairings: [
        pairing({ id: "p1", name: "Cold Brew" }),
        pairing({ id: "p2", name: "Cappuccino" }),
        pairing({ id: "p3", name: "Cortado" }),
      ],
    });
    expect(screen.getByText("Cold Brew")).toBeInTheDocument();
    expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    expect(screen.queryByText("Cortado")).not.toBeInTheDocument();
  });

  it("prefers-reduced-motion → pairing rows carry no transform", () => {
    motionState.reduced = true;
    renderCard(base, { qty: 1, pairings: [pairing({})] });
    const row = screen.getByText("Silver Cold Brew").closest(".tt-pairing-row") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.style.transform ?? "").toBe("");
  });
});
