import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const names = ["A", "B", "C", "D", "E", "F"];
// Fixed order: cards 0 and 1 never match, cards 0 and 6 do.
vi.mock("@/lib/games/decks", () => ({
  memoryDeck: () =>
    [...names, ...names].map((name, i) => ({ key: `${name}-${i < 6 ? 0 : 1}`, name, image: `${name}.jpg` })),
}));

import MemoryMatch from "@/components/games/MemoryMatch";

afterEach(() => vi.useRealTimers());

const setup = () =>
  render(<MemoryMatch items={[]} status={null} onExit={vi.fn()} onAgain={vi.fn()} />);

describe("MemoryMatch move cap", () => {
  it("shows the cap (2 x pairs = 12) and ends the solo game when moves run out", () => {
    vi.useFakeTimers();
    setup();
    expect(screen.getByText("Moves 0 of 12")).toBeInTheDocument();
    for (let m = 0; m < 12; m++) {
      const hidden = screen.getAllByRole("button", { name: "Hidden card" });
      fireEvent.click(hidden[0]); // A
      fireEvent.click(hidden[1]); // B — always a miss
      act(() => { vi.advanceTimersByTime(800); });
    }
    expect(screen.getByRole("heading", { name: "Out of moves" })).toBeInTheDocument();
  });

  it("has no cap in two-player mode", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /2 players/ }));
    expect(screen.getByText("Moves 0")).toBeInTheDocument();
  });
});
