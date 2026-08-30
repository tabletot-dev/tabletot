import { useMicLevels } from "@/hooks/useMicLevels";
import EarlierStrip from "@/components/voice/EarlierStrip";

interface VoiceDockPanelProps {
  status: "recording" | "processing" | "error";
  transcript: string;
  turns: { role: "user" | "ai"; text: string }[];
  onToggle: () => void;
  onClose: () => void;
  onExpandHistory: () => void;
  onChip: (text: string) => void;
}

const CHIPS = ["What's popular?", "Something for two", "No onion or garlic"];

export default function VoiceDockPanel({
  status,
  transcript,
  turns,
  onToggle,
  onClose,
  onExpandHistory,
  onChip,
}: VoiceDockPanelProps) {
  const isRecording = status === "recording";
  const isError = status === "error";
  const { levels, rms } = useMicLevels(isRecording);
  const idle = !isRecording || rms < 0.04;

  return (
    <section className="tt-voice-dock" aria-label="Voice recording">
      <div className="tt-voice-dock-status">
        {isError ? (
          <span className="tt-voice-dock-pill tt-voice-dock-pill--error">Voice unavailable</span>
        ) : (
          <span className="tt-voice-dock-pill">● LISTENING</span>
        )}
        <span className="tt-voice-dock-hint">Tap the mark again to stop</span>
        <button type="button" className="tt-voice-dock-close" onClick={onClose}>
          Close ✕
        </button>
      </div>

      <EarlierStrip turns={turns} tone="dark" onExpand={onExpandHistory} />

      <div className="tt-voice-dock-wave-row">
        <div className={`tt-voice-wave${idle ? " tt-voice-wave--idle" : ""}`}>
          {levels.map((h, i) => (
            <span
              key={i}
              style={{ ["--h" as any]: Math.max(0.08, h) }}
              className={i % 3 === 0 ? "is-accent" : ""}
            />
          ))}
        </div>
        <button
          type="button"
          className="tt-voice-dock-mark"
          onClick={onToggle}
          disabled={isError}
          aria-label={isRecording ? "Stop — tap the mark" : "Voice mark"}
        />
      </div>

      {transcript !== "" && (
        <p className="tt-voice-dock-transcript">{transcript}…</p>
      )}

      <div className="tt-voice-dock-chips">
        {CHIPS.map((text) => (
          <button
            key={text}
            type="button"
            className="tt-voice-dock-chip"
            onClick={() => onChip(text)}
          >
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}
