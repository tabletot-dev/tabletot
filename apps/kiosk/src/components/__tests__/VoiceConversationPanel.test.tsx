import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VoiceConversationPanel from "@/components/VoiceConversationPanel";

// Frozen-voice rule: we never press the mic here, so the STT client is never
// invoked. Stub it anyway so nothing tries to touch WS/mic.
vi.mock("@/lib/voice/sttClient", () => ({
  startSttPress: vi.fn(),
  MicPermissionDeniedError: class extends Error {},
}));

// The dock's waveform hook opens its own mic stream — stub it out.
vi.mock("@/hooks/useMicLevels", () => ({
  useMicLevels: () => ({ levels: Array(24).fill(0), rms: 0 }),
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
  onPressStatusChange: vi.fn(),
  onToggleReady: vi.fn(),
  transcript: "",
  onExpandHistory: vi.fn(),
  onChip: vi.fn(),
};

describe("VoiceConversationPanel — frozen-code host", () => {
  it("renders VoiceDockPanel when voicePhase === 'dock'", () => {
    render(<VoiceConversationPanel {...baseProps} voicePhase="dock" />);
    expect(screen.getByRole("region", { name: "Voice recording" })).toBeInTheDocument();
    expect(screen.getByText(/listening/i)).toBeInTheDocument();
  });

  it("renders nothing when voicePhase is 'answer' or 'closed'", () => {
    const { container, rerender } = render(
      <VoiceConversationPanel {...baseProps} voicePhase="answer" />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<VoiceConversationPanel {...baseProps} voicePhase="closed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lifts handleToggle via onToggleReady", () => {
    const onToggleReady = vi.fn();
    render(
      <VoiceConversationPanel
        {...baseProps}
        voicePhase="dock"
        onToggleReady={onToggleReady}
      />,
    );
    expect(onToggleReady).toHaveBeenCalledWith(expect.any(Function));
  });

  it("the dock Close button closes the panel", () => {
    const onClose = vi.fn();
    render(
      <VoiceConversationPanel {...baseProps} voicePhase="dock" onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
