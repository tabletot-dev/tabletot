import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Regression test for the mandatory-phone bug: requesting the bill (the
// actual staff-notifying ledger event) must not be gated on a phone number —
// phone capture is best-effort, per the code's own existing comment.
vi.mock("@/lib/ledger", () => ({ appendEvent: vi.fn() }));
vi.mock("@/lib/orderSubmission", () => ({ resolveTableId: vi.fn().mockResolvedValue("table-1") }));

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}));

// GST label must reflect the live restaurant rate, not a hardcoded "5%".
vi.mock("@/lib/restaurantContext", () => ({
  useRestaurant: () => ({ gstRatePercent: 18 }),
}));

import BillView from "@/components/screens/BillView";
import { appendEvent } from "@/lib/ledger";
import { formatRupees } from "@/lib/formatCurrency";

const previousOrders = [
  { orderId: "o1", items: [], total: 410, timestamp: new Date() },
];

describe("BillView — phone-optional bill request", () => {
  beforeEach(() => {
    vi.mocked(appendEvent).mockClear();
    insertMock.mockClear();
  });

  it("requests the bill without a phone number via Skip, and does not insert a phone row", async () => {
    render(<BillView previousOrders={previousOrders} sessionTotal={410} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Request Bill at Table" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip — request without a number" }));

    await waitFor(() => expect(appendEvent).toHaveBeenCalledWith("bill_requested"));
    expect(insertMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Bill coming your way.")).toBeInTheDocument();
  });

  it("Submit stays disabled for a partially-typed, invalid phone number", () => {
    render(<BillView previousOrders={previousOrders} sessionTotal={410} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Request Bill at Table" }));
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), { target: { value: "123" } });

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("labels the GST line with the live rate (A1), and the amount matches it", () => {
    render(<BillView previousOrders={previousOrders} sessionTotal={1000} onClose={() => {}} />);

    expect(screen.getByText("GST (18%)")).toBeInTheDocument();
    expect(screen.queryByText("GST (5%)")).not.toBeInTheDocument();
    expect(screen.getByText(formatRupees(180))).toBeInTheDocument();
  });
});
