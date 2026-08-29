import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Stepper from "@/components/Stepper";

describe("Stepper", () => {
  it("renders the quantity and name-scoped aria-labels", () => {
    render(<Stepper qty={3} label="Avocado Toast" onDec={vi.fn()} onInc={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("Avocado Toast quantity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease Avocado Toast" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Avocado Toast" })).toBeInTheDocument();
  });

  it("fires onDec / onInc on the − and + controls", () => {
    const onDec = vi.fn();
    const onInc = vi.fn();
    render(<Stepper qty={2} label="Latte" onDec={onDec} onInc={onInc} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Latte" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Latte" }));
    expect(onDec).toHaveBeenCalledTimes(1);
    expect(onInc).toHaveBeenCalledTimes(1);
  });

  it("de-emphasises the − control at qty 1 (clears in one tap)", () => {
    const { rerender } = render(
      <Stepper qty={1} label="Latte" onDec={vi.fn()} onInc={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Decrease Latte" })).toHaveClass(
      "tt-stepper-minus--floor",
    );
    rerender(<Stepper qty={2} label="Latte" onDec={vi.fn()} onInc={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Decrease Latte" })).not.toHaveClass(
      "tt-stepper-minus--floor",
    );
  });

  it("both controls are type=button (no accidental form submit)", () => {
    render(<Stepper qty={2} label="Latte" onDec={vi.fn()} onInc={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Decrease Latte" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Increase Latte" })).toHaveAttribute("type", "button");
  });
});
