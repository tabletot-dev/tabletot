import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AboutView from "@/components/screens/AboutView";

const base = {
  venueName: "Silver Specialty Coffee",
  hours: "11 AM - 11 PM, every day",
  address: "Plot 910C, Banjara Hills, Road 46, Khairatabad, Hyderabad",
  chefName: "Rohit Nair",
  chefNote: "Small batches, pulled on a lever machine.",
  onBack: () => {},
};

describe("AboutView (screen 16)", () => {
  it("renders venue name, hours, address and chef note", () => {
    render(<AboutView {...base} />);
    expect(screen.getByText("Silver Specialty Coffee")).toBeInTheDocument();
    expect(screen.getByText(/11 AM - 11 PM/)).toBeInTheDocument();
    expect(screen.getByText(/Banjara Hills/)).toBeInTheDocument();
    expect(screen.getByText(/lever machine/)).toBeInTheDocument();
    expect(screen.getByText(/Rohit Nair/)).toBeInTheDocument();
  });

  it("hides the chef row when chefNote is empty", () => {
    render(<AboutView {...base} chefNote="" chefName="" />);
    expect(screen.queryByText(/Rohit Nair/)).not.toBeInTheDocument();
  });

  it("hides the hours row when hours is empty", () => {
    render(<AboutView {...base} hours="" />);
    expect(screen.queryByText(/11 AM - 11 PM/)).not.toBeInTheDocument();
  });

  it("calls onBack when the back control is pressed", () => {
    const onBack = vi.fn();
    render(<AboutView {...base} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
