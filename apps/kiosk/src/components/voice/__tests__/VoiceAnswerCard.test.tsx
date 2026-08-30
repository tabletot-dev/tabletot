import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VoiceAnswerCard from "@/components/voice/VoiceAnswerCard";
import type { MenuItem } from "@/data/menu";

const item = (over: Partial<MenuItem> = {}): MenuItem => ({
  id: "a", name: "Avocado Toast", price: 390, category: "Breakfast",
  tags: [], is_veg: true, ...over,
});
const base = {
  getQuantity: () => 0,
  onAddItem: vi.fn(),
  onUpdateQuantity: vi.fn(),
  onSelectItem: vi.fn(),
};

describe("VoiceAnswerCard", () => {
  it("rec variant renders one row per item, capped at 3", () => {
    render(<VoiceAnswerCard {...base} text="Two dairy-free picks." items={[item({id:"a"}), item({id:"b",name:"Cold Brew"}), item({id:"c",name:"Latte"}), item({id:"d",name:"Mocha"})]} />);
    expect(screen.getByText("Two dairy-free picks.")).toBeInTheDocument();
    expect(screen.getByText("Avocado Toast")).toBeInTheDocument();
    expect(screen.queryByText("Mocha")).not.toBeInTheDocument();
  });

  it("rec variant: Add fires onAddItem; stepper shows when qty > 0", () => {
    const onAddItem = vi.fn();
    const { rerender } = render(<VoiceAnswerCard {...base} onAddItem={onAddItem} text="x" items={[item()]} />);
    fireEvent.click(screen.getByRole("button", { name: /add avocado toast|^add$/i }));
    expect(onAddItem).toHaveBeenCalledTimes(1);
    rerender(<VoiceAnswerCard {...base} getQuantity={() => 2} text="x" items={[item()]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("info variant: text + footnote, no dish rows", () => {
    render(<VoiceAnswerCard {...base} text="About 520 kcal a portion." items={[]} />);
    expect(screen.getByText(/About 520 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/ask a staff member/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
  });
});
