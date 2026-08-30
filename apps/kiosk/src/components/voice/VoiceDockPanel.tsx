import { useMicLevels } from "@/hooks/useMicLevels";
import EarlierStrip from "@/components/voice/EarlierStrip";

interface VoiceDockPanelProps {
  status: "recording" | "processing" | "error";
  transcript: string;
  /** True while `transcript` is a partial STT result — drives the trailing "…". */
  interim?: boolean;
  turns: { role: "user" | "ai"; text: string }[];
  onToggle: () => void;
  onClose: () => void;
  onExpandHistory: () => void;
  onChip: (text: string) => void;
}

const CHIPS = ["What's popular?", "Something for two", "No onion or garlic"];
const BAR_COUNT = 24;

export default function VoiceDockPanel({
  status,
  transcript,
  interim = false,
  turns,
  onToggle,
  onClose,
  onExpandHistory,
  onChip,
}: VoiceDockPanelProps) {
  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const isError = status === "error";
  const { rms, barsRef } = useMicLevels(isRecording);
  const idle = !isRecording || rms < 0.04;

  return (
    <section className="tt-voice-dock" aria-label="Voice recording">
      <div className="tt-voice-dock-status">
        {isError ? (
          <span className="tt-voice-dock-pill tt-voice-dock-pill--error">Voice unavailable</span>
        ) : isProcessing ? (
          <span className="tt-voice-dock-pill tt-voice-dock-pill--processing">● PROCESSING</span>
        ) : (
          <span className="tt-voice-dock-pill">● LISTENING</span>
        )}
        {isRecording && (
          <span className="tt-voice-dock-hint">Tap the mark again to stop</span>
        )}
        {isProcessing && <span className="tt-voice-dock-hint">One moment…</span>}
        <button type="button" className="tt-voice-dock-close" onClick={onClose}>
          Close ✕
        </button>
      </div>

      <EarlierStrip turns={turns} tone="dark" onExpand={onExpandHistory} />

      <div className="tt-voice-dock-wave-row">
        <button
          type="button"
          className="tt-voice-dock-mark"
          onClick={onToggle}
          disabled={!isRecording}
          aria-label={isRecording ? "Stop — tap the mark" : "Voice mark"}
        />
        <div className={`tt-voice-wave${idle ? " tt-voice-wave--idle" : ""}`}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <span
              key={i}
              ref={(el) => barsRef(el, i)}
              className={i % 3 === 0 ? "is-accent" : ""}
            />
          ))}
        </div>
      </div>

      {transcript !== "" && (
        <p className="tt-voice-dock-transcript">
          {transcript}
          {interim ? "…" : ""}
        </p>
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
