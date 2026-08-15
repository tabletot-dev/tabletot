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

import BillView from "@/components/screens/BillView";
import { appendEvent } from "@/lib/ledger";

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
});
