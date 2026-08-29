import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VoiceConversationPanel from "@/components/VoiceConversationPanel";

// Chrome-only test (frozen-voice rule): we never press the mic, so the STT
// client is never invoked. Stub it anyway so nothing tries to touch WS/mic.
vi.mock("@/lib/voice/sttClient", () => ({
  startSttPress: vi.fn(),
}));

const baseProps = {
  sessionId: "s1",
  turns: [],
  order: [],
  getQuantity: () => 0,
  onClose: vi.fn(),
  onDone: vi.fn(),
  onAddItem: vi.fn(),
  onUpdateQuantity: vi.fn(),
  onSelectItem: vi.fn(),
};

describe("VoiceConversationPanel — Radix Dialog wrapper (B1)", () => {
  it("renders as a modal dialog with the Ask Tabletot title", () => {
    render(<VoiceConversationPanel {...baseProps} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask Tabletot" })).toBeInTheDocument();
  });

  it("renders an opaque backdrop behind the panel", () => {
    render(<VoiceConversationPanel {...baseProps} onClose={vi.fn()} />);
    expect(document.querySelector(".voice-conversation-backdrop")).toBeInTheDocument();
  });

  it("Escape closes the panel", () => {
    const onClose = vi.fn();
    render(<VoiceConversationPanel {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the close (X) button closes the panel", () => {
    const onClose = vi.fn();
    render(<VoiceConversationPanel {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close voice conversation" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
