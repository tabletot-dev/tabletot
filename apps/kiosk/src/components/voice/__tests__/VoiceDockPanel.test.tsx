import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VoiceDockPanel from "@/components/voice/VoiceDockPanel";

vi.mock("@/hooks/useMicLevels", () => ({
  useMicLevels: () => ({ levels: Array(24).fill(0), rms: 0, barsRef: () => {} }),
}));

const base = {
  status: "recording" as const,
  transcript: "",
  turns: [] as { role: "user" | "ai"; text: string }[],
  onToggle: vi.fn(),
  onClose: vi.fn(),
  onExpandHistory: vi.fn(),
  onChip: vi.fn(),
};

describe("VoiceDockPanel", () => {
  it("shows LISTENING and the live transcript", () => {
    render(<VoiceDockPanel {...base} transcript="Something light, no dairy" />);
    expect(screen.getByText(/listening/i)).toBeInTheDocument();
    expect(screen.getByText(/Something light, no dairy/)).toBeInTheDocument();
  });

  it("hides EarlierStrip at 0 turns, shows it with a count at 3", () => {
    const { rerender } = render(<VoiceDockPanel {...base} />);
    expect(screen.queryByText(/earlier/i)).not.toBeInTheDocument();
    rerender(<VoiceDockPanel {...base} turns={[
      { role: "user", text: "How many calories?" },
      { role: "ai", text: "520" },
      { role: "user", text: "and the brew?" },
    ]} />);
    expect(screen.getByText(/·\s*2 more/)).toBeInTheDocument();
  });

  it("mic mark fires onToggle; Close fires onClose; a chip fires onChip", () => {
    render(<VoiceDockPanel {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /stop|mark/i }));
    expect(base.onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(base.onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "What's popular?" }));
    expect(base.onChip).toHaveBeenCalledWith("What's popular?");
  });

  it("error status disables the mark and shows the unavailable copy", () => {
    render(<VoiceDockPanel {...base} status="error" />);
    expect(screen.getByText(/voice unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark/i })).toBeDisabled();
    expect(screen.queryByText(/again to stop/i)).not.toBeInTheDocument();
  });

  it("processing status shows a distinct pill, disables the mark, drops the stop hint", () => {
    render(<VoiceDockPanel {...base} status="processing" />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
    expect(screen.getByText(/one moment/i)).toBeInTheDocument();
    expect(screen.queryByText(/again to stop/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark/i })).toBeDisabled();
  });

  it("shows the trailing ellipsis only while the transcript is interim", () => {
    const { rerender } = render(
      <VoiceDockPanel {...base} transcript="two flat whites" interim />,
    );
    expect(screen.getByText("two flat whites…")).toBeInTheDocument();
    rerender(<VoiceDockPanel {...base} transcript="two flat whites" interim={false} />);
    expect(screen.getByText("two flat whites")).toBeInTheDocument();
  });
});
