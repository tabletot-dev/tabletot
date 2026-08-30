import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// vi.hoisted so the fn exists before the hoisted vi.mock factory runs.
const { startSttPress } = vi.hoisted(() => ({
  // stop() must return a promise — the frozen unmount cleanup does .stop().catch().
  startSttPress: vi.fn().mockResolvedValue({ stop: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("@/lib/voice/sttClient", () => ({ startSttPress, MicPermissionDeniedError: class extends Error {} }));
vi.mock("@/lib/voice/ttsClient", () => ({ openTtsClient: () => ({ close: vi.fn(), bargeIn: vi.fn() }), unlockAudioContext: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/voice/api", () => ({ startSession: vi.fn().mockResolvedValue({ voiceSessionId: "s1", clientSessionId: "c1" }), endSession: vi.fn() }));

import VoiceConversationPanel from "@/components/VoiceConversationPanel";

it("still calls startSttPress(sessionId, handler, cartItems) when the mark is toggled", async () => {
  let toggle = () => {};
  render(
    <VoiceConversationPanel
      sessionId="s1" turns={[]} order={[{ id: "a", name: "X", price: 10, quantity: 1 }]}
      getQuantity={() => 0} onClose={() => {}} onDone={() => {}} onAddItem={() => {}}
      onUpdateQuantity={() => {}} onSelectItem={() => {}}
      voicePhase="dock" onPressStatusChange={() => {}} onToggleReady={(t) => { toggle = t; }}
      transcript="" onExpandHistory={() => {}} onChip={() => {}}
    />,
  );
  await waitFor(() => expect(typeof toggle).toBe("function"));
  toggle();
  await waitFor(() => {
    expect(startSttPress).toHaveBeenCalledWith("s1", expect.any(Function), [
      { id: "a", name: "X", qty: 1, price: 10 },
    ]);
  });
});
