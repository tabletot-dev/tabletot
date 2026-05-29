import { useCallback, useEffect, useRef, useState } from "react";
import { startSession, endSession } from "@/lib/voice/api";
import { openTtsClient, unlockAudioContext, type TtsClientHandle } from "@/lib/voice/ttsClient";
import { startSttPress, MicPermissionDeniedError, type SttPressHandle } from "@/lib/voice/sttClient";
import type { DoneMessage, SttMessage } from "@/lib/voice/types";
import type { OrderItem } from "@/data/menu";

interface ListeningScreenProps {
  order: OrderItem[];
  restaurantId: string;
  tableId: string;
  onVoiceDone: (msg: DoneMessage) => void;
  onDone: () => void;
}

type Phase = "connecting" | "recording" | "processing" | "error";

const EXAMPLE_PROMPTS = ['"Order a burger"', '"Show desserts"', '"Add fries"'];

const ListeningScreen = ({
  order,
  restaurantId,
  tableId,
  onVoiceDone,
  onDone,
}: ListeningScreenProps) => {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const ttsRef = useRef<TtsClientHandle | null>(null);
  const sttRef = useRef<SttPressHandle | null>(null);

  const cleanup = useCallback(async () => {
    sttRef.current?.stop().catch(() => {});
    ttsRef.current?.close();
    sttRef.current = null;
    ttsRef.current = null;
    if (sessionIdRef.current) {
      endSession(sessionIdRef.current).catch(() => {});
      sessionIdRef.current = null;
    }
  }, []);

  const handleSttMessage = useCallback(
    (msg: SttMessage) => {
      if (msg.type === "done") {
        setPhase("processing");
        onVoiceDone(msg);
        // Brief delay so user sees "Processing" before sheet closes
        setTimeout(onDone, 600);
      } else if (msg.type === "no_speech") {
        onDone();
      } else if (msg.type === "error") {
        setErrorMsg("Something went wrong. Please try again.");
        setPhase("error");
      }
    },
    [onVoiceDone, onDone],
  );

  // 30s safety timeout — closes the sheet if the user doesn't speak or finish
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setTimeout(onDone, 30_000);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  // Auto-start: open session + TTS + STT on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await unlockAudioContext();
        const { voiceSessionId } = await startSession(tableId, restaurantId);
        if (cancelled) {
          endSession(voiceSessionId).catch(() => {});
          return;
        }
        sessionIdRef.current = voiceSessionId;

        ttsRef.current = openTtsClient(voiceSessionId, (m) => {
          if (m.type === "error") console.warn("TTS error:", m.message);
        });

        const cartItems = order.map((o) => ({
          id: o.id,
          name: o.name,
          qty: o.quantity,
          price: o.price,
        }));
        const handle = await startSttPress(voiceSessionId, handleSttMessage, cartItems);
        if (cancelled) {
          handle.stop().catch(() => {});
          return;
        }
        sttRef.current = handle;
        setPhase("recording");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof MicPermissionDeniedError) {
          setErrorMsg("Microphone access denied. Allow mic in browser settings.");
        } else {
          setErrorMsg("Voice service unavailable. Use touch to order.");
        }
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  // restaurantId and tableId are deployment constants
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = useCallback(async () => {
    if (phase === "recording") {
      setPhase("processing");
      try {
        await sttRef.current?.stop();
      } catch {
        onDone();
      }
    } else {
      onDone();
    }
  }, [phase, onDone]);

  return (
    <>
      <div className="voice-sheet-backdrop" onClick={phase === "error" ? onDone : undefined} />
      <section className="voice-sheet" aria-label="Voice assistant">
        <div className="voice-sheet-handle" />
        <div className="voice-sheet-top">
          <div className="voice-active-mark">
            <div className="voice-orb">
              <div className="voice-ring" />
              <div className="voice-ring voice-ring-b" />
              <svg
                className="mic-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M6 11a6 6 0 0 0 12 0" />
                <path d="M12 17v4" />
                <path d="M9 21h6" />
              </svg>
            </div>
            <div className="voice-sheet-copy">
              <p className="eyebrow">
                {phase === "connecting" && "Connecting…"}
                {phase === "recording" && "Listening"}
                {phase === "processing" && "Processing…"}
                {phase === "error" && "Unavailable"}
              </p>
              <h2>
                {phase === "error"
                  ? errorMsg ?? "Something went wrong"
                  : phase === "processing"
                    ? "Got it, updating your order…"
                    : "What would you like?"}
              </h2>
            </div>
          </div>
          <button
            className="voice-close"
            onClick={handleDone}
            aria-label="Close voice assistant"
          >
            {phase === "recording" ? "Done" : "Close"}
          </button>
        </div>

        {phase === "recording" && (
          <div className="voice-wave">
            <span /><span /><span /><span /><span />
          </div>
        )}

        {phase === "recording" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {EXAMPLE_PROMPTS.map((cmd) => (
              <span
                key={cmd}
                className="ghost-pill"
                style={{ fontSize: 14, minHeight: 42, padding: "0 16px" }}
              >
                {cmd}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default ListeningScreen;
