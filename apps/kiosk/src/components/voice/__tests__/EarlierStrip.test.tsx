import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EarlierStrip from "@/components/voice/EarlierStrip";

const turns = [
  { role: "user" as const, text: "How many calories in the avocado toast?" },
  { role: "ai" as const, text: "About 520 kcal." },
  { role: "user" as const, text: "And the cold brew?" },
];

describe("EarlierStrip", () => {
  it("renders nothing with no turns", () => {
    const { container } = render(<EarlierStrip turns={[]} onExpand={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the first user line and a count of the rest", () => {
    render(<EarlierStrip turns={turns} onExpand={() => {}} />);
    expect(screen.getByText(/calories in the avocado toast/i)).toBeInTheDocument();
    expect(screen.getByText(/·\s*2 more/)).toBeInTheDocument();
  });

  it("fires onExpand when tapped", () => {
    const onExpand = vi.fn();
    render(<EarlierStrip turns={turns} onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
