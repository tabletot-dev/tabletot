import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Stepper from "@/components/Stepper";

afterEach(() => vi.useRealTimers());

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

  // --- T3: two-tap × clear ---------------------------------------------------

  it("shows no × control when onClear is omitted", () => {
    render(<Stepper qty={5} label="Latte" onDec={vi.fn()} onInc={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("hides × at qty 1, shows it at qty 2+", () => {
    const { rerender } = render(
      <Stepper qty={1} label="Latte" onDec={vi.fn()} onInc={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Remove Latte" })).not.toBeInTheDocument();
    rerender(<Stepper qty={2} label="Latte" onDec={vi.fn()} onInc={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Remove Latte" })).toBeInTheDocument();
  });

  it("first × tap arms a confirm and does NOT clear; second tap clears", () => {
    const onClear = vi.fn();
    render(<Stepper qty={3} label="Latte" onDec={vi.fn()} onInc={vi.fn()} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Latte" }));
    expect(onClear).not.toHaveBeenCalled();
    const armed = screen.getByRole("button", { name: "Tap again to remove Latte" });
    expect(armed).toHaveTextContent("Tap again to remove");

    fireEvent.click(armed);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("the armed confirm reverts after the timeout without clearing", () => {
    vi.useFakeTimers();
    const onClear = vi.fn();
    render(<Stepper qty={3} label="Latte" onDec={vi.fn()} onInc={vi.fn()} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Latte" }));
    expect(screen.getByRole("button", { name: "Tap again to remove Latte" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove Latte" })).toBeInTheDocument();
  });

  it("a quantity change cancels a pending confirm", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <Stepper qty={3} label="Latte" onDec={vi.fn()} onInc={vi.fn()} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Latte" }));
    expect(screen.getByRole("button", { name: "Tap again to remove Latte" })).toBeInTheDocument();

    rerender(<Stepper qty={4} label="Latte" onDec={vi.fn()} onInc={vi.fn()} onClear={onClear} />);
    expect(screen.getByRole("button", { name: "Remove Latte" })).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });
});
