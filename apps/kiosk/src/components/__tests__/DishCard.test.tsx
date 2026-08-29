import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DishCard from "@/components/DishCard";
import type { MenuItem } from "@/data/menu";

const base: MenuItem = {
  id: "i1",
  name: "Avocado Toast",
  price: 390,
  category: "Breakfast",
  tags: [],
  is_veg: true,
};

function renderCard(item: MenuItem) {
  return render(
    <DishCard
      item={item}
      qty={0}
      pairings={[]}
      cartTotal={0}
      onAddToCart={vi.fn()}
      onUpdateQuantity={vi.fn()}
      onSelect={vi.fn()}
      onAddPairing={vi.fn()}
    />,
  );
}

describe("DishCard — diet label on the card (A4)", () => {
  it("shows the 'Veg' word, not just the glyph, for a veg dish", () => {
    renderCard(base);
    expect(screen.getByText("Veg")).toBeInTheDocument();
  });

  it("shows 'Non-Veg' for a non-veg dish", () => {
    renderCard({ ...base, name: "Egg Bagel", is_veg: false });
    expect(screen.getByText("Non-Veg")).toBeInTheDocument();
  });
});
