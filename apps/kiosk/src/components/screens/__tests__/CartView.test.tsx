import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The GST label must reflect the live restaurant rate, not a hardcoded "5%"
// (2026-08-28 audit finding 7 — the rate is restaurant-configurable).
vi.mock("@/lib/restaurantContext", () => ({
  useRestaurant: () => ({ gstRatePercent: 12 }),
}));

import CartView from "@/components/screens/CartView";
import { formatRupees } from "@/lib/formatCurrency";

const noop = () => {};

function renderCart() {
  return render(
    <CartView
      order={[
        { id: "i1", name: "Avocado Toast", price: 500, quantity: 2, category: "Breakfast", tags: [], is_veg: true },
      ]}
      totalBill={1000}
      previousOrders={[]}
      isSubmitting={false}
      onContinue={noop}
      onConfirm={noop}
      onUpdateQuantity={noop}
    />,
  );
}

describe("CartView — dynamic GST label (A1)", () => {
  it("labels the GST line with the live rate, not a hardcoded 5%", () => {
    renderCart();
    expect(screen.getByText("GST (12%)")).toBeInTheDocument();
    expect(screen.queryByText("GST (5%)")).not.toBeInTheDocument();
  });

  it("the GST amount matches that rate (12% of ₹1000 = ₹120)", () => {
    renderCart();
    expect(screen.getByText(formatRupees(120))).toBeInTheDocument();
  });
});
