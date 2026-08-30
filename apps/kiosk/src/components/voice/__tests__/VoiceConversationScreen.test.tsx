import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import VoiceConversationScreen from "@/components/voice/VoiceConversationScreen";
import type { Turn } from "@/lib/voice/types";

const base = {
  getQuantity: () => 0,
  onAddItem: vi.fn(),
  onUpdateQuantity: vi.fn(),
  onSelectItem: vi.fn(),
  onClose: vi.fn(),
  onRequestSpeak: vi.fn(),
  onChip: vi.fn(),
};

// Shared vi.fn()s across the file — reset between tests so call counts don't leak.
beforeEach(() => {
  vi.clearAllMocks();
});
const recTurns: Turn[] = [
  { role: "user", text: "Something light, no dairy" },
  { role: "ai", text: "Two dairy-free picks.", matchedItems: [
    { id: "a", name: "Avocado Toast", price: 390, category: "b", tags: [], is_veg: true },
    { id: "c", name: "Cold Brew", price: 290, category: "b", tags: [], is_veg: true },
  ] },
];
const infoTurns: Turn[] = [
  { role: "user", text: "How many calories in the avocado toast?" },
  { role: "ai", text: "About 520 kcal a portion." },
];

describe("VoiceConversationScreen", () => {
  it("07: renders the answer card with dish rows and the YOU SAID card", () => {
    render(<VoiceConversationScreen {...base} turns={recTurns} />);
    expect(screen.getByText(/Something light, no dairy/)).toBeInTheDocument();
    expect(screen.getByText("Avocado Toast")).toBeInTheDocument();
    expect(screen.getByText(/2 messages/)).toBeInTheDocument();
  });

  it("07: 'Add both' adds every matched item", () => {
    const onAddItem = vi.fn();
    render(<VoiceConversationScreen {...base} onAddItem={onAddItem} turns={recTurns} />);
    fireEvent.click(screen.getByRole("button", { name: "Add both" }));
    expect(onAddItem).toHaveBeenCalledTimes(2);
  });

  it("08: text-only answer, 'Back to the menu' closes", () => {
    render(<VoiceConversationScreen {...base} turns={infoTurns} />);
    expect(screen.getByText(/About 520 kcal/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the menu" }));
    expect(base.onClose).toHaveBeenCalled();
  });

  it("speak-dock and Close fire their handlers", () => {
    render(<VoiceConversationScreen {...base} turns={infoTurns} />);
    fireEvent.click(screen.getByRole("button", { name: /tap the mark to speak/i }));
    expect(base.onRequestSpeak).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(base.onClose).toHaveBeenCalled();
  });
});
