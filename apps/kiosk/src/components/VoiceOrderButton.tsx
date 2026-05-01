import { useCallback, useEffect, useRef, useState } from "react";
import { startSession, endSession } from "@/lib/voice/api";
import { openTtsClient, unlockAudioContext, type TtsClientHandle } from "@/lib/voice/ttsClient";
import { startSttPress, MicPermissionDeniedError, type SttPressHandle } from "@/lib/voice/sttClient";
import type { DoneMessage, SttMessage } from "@/lib/voice/types";

type BackendStatus = "starting" | "ready" | "error";
type PressStatus = "idle" | "recording" | "processing";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface VoiceOrderButtonProps {
  onDone: (msg: DoneMessage) => void;
  order: CartItem[];
  restaurantId: string;
  tableId: string;
}

const VoiceOrderButton = ({ onDone, order, restaurantId, tableId }: VoiceOrderButtonProps) => {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("starting");
  const [pressStatus, setPressStatus] = useState<PressStatus>("idle");
  const [micBlocked, setMicBlocked] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const clientSessionIdRef = useRef<string | null>(null);
  const ttsRef = useRef<TtsClientHandle | null>(null);
  const sttRef = useRef<SttPressHandle | null>(null);
  // Ref mirrors to avoid stale closure captures in callbacks
  const pressStatusRef = useRef<PressStatus>("idle");
  const backendStatusRef = useRef<BackendStatus>("starting");

  useEffect(() => { pressStatusRef.current = pressStatus; }, [pressStatus]);
  useEffect(() => { backendStatusRef.current = backendStatus; }, [backendStatus]);

  // Start backend session and open TTS WebSocket on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await unlockAudioContext();
        const { voiceSessionId, clientSessionId } = await startSession(tableId, restaurantId);
        if (!mounted) return;
        sessionIdRef.current = voiceSessionId;
        clientSessionIdRef.current = clientSessionId;
        ttsRef.current = openTtsClient(voiceSessionId, (msg) => {
          if (msg.type === "error") {
            console.warn("TTS error:", msg.message);
          }
        });
        setBackendStatus("ready");
      } catch (err) {
        if (!mounted) return;
        console.warn("Voice backend unavailable:", err);
        setBackendStatus("error");
      }
    })();

    return () => {
      mounted = false;
      sttRef.current?.stop();
      ttsRef.current?.close();
      sttRef.current = null;
      ttsRef.current = null;
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  // restaurantId and tableId are deployment constants; no need to re-run on change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSttMessage = useCallback(
    (msg: SttMessage) => {
      switch (msg.type) {
        case "done":
          setPressStatus("idle");
          onDone(msg);
          break;
        case "no_speech":
          setPressStatus("idle");
          break;
        case "error":
          console.warn("STT error:", msg.message);
          setPressStatus("idle");
          break;
        // interim / speech_start / speech_end / final — no visual update needed
      }
    },
    [onDone],
  );

  const handleToggle = useCallback(async () => {
    if (backendStatusRef.current !== "ready") return;
    if (micBlocked) return;

    if (pressStatusRef.current === "recording") {
      // Second click — stop recording, let backend process
      setPressStatus("processing");
      try {
        await sttRef.current?.stop();
      } catch {
        setPressStatus("idle");
      }
    } else if (pressStatusRef.current === "idle") {
      // First click — start session and recording
      const id = sessionIdRef.current;
      if (!id) return;

      // Barge-in: cut any TTS audio before opening the mic
      ttsRef.current?.bargeIn();
      setPressStatus("recording");

      try {
        const cartItems = order.map((item) => ({
          id: item.id,
          name: item.name,
          qty: item.quantity,
          price: item.price,
        }));
        const handle = await startSttPress(id, handleSttMessage, cartItems);
        sttRef.current = handle;
      } catch (err) {
        if (err instanceof MicPermissionDeniedError) {
          setMicBlocked(true);
        } else {
          console.warn("STT start failed:", err);
        }
        setPressStatus("idle");
      }
    }
  }, [handleSttMessage, order, micBlocked]);

  const disabled = backendStatus !== "ready" || pressStatus === "processing";

  const buttonLabel =
    pressStatus === "recording"
      ? "Tap to stop"
      : pressStatus === "processing"
        ? "Processing…"
        : backendStatus === "error"
          ? "Voice unavailable"
          : "Tap to speak";

  const ringColor =
    pressStatus === "recording"
      ? "border-red-500 bg-red-500/20"
      : pressStatus === "processing"
        ? "border-muted bg-muted/20"
        : backendStatus === "error"
          ? "border-muted bg-muted/10"
          : "border-secondary bg-secondary/10";

  const glowStyle =
    pressStatus === "recording"
      ? { boxShadow: "0 0 20px rgba(239,68,68,0.5), 0 0 8px rgba(239,68,68,0.3)" }
      : backendStatus === "ready"
        ? { boxShadow: "0 0 16px hsl(var(--tt-orange) / 0.4), 0 0 6px hsl(var(--tt-orange) / 0.2)" }
        : undefined;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Mic permission blocked banner — shown above the button, touch is unaffected */}
      {micBlocked && (
        <div className="bg-muted border border-border px-3 py-2 text-[10px] text-muted-foreground font-display leading-tight max-w-[180px] text-right">
          Microphone needed for voice ordering. Allow mic in browser settings.
        </div>
      )}

      <div className="flex items-center gap-2">
        {backendStatus === "ready" && pressStatus === "idle" && !micBlocked && (
          <div
            className="bg-secondary/10 border border-secondary/30 px-3 py-1.5"
            style={{ boxShadow: "0 0 12px hsl(var(--tt-orange) / 0.3), 0 0 4px hsl(var(--tt-orange) / 0.15)" }}
          >
            <span
              className="text-[10px] tracking-wider text-secondary font-display font-semibold whitespace-nowrap"
              style={{ textShadow: "0 0 8px hsl(var(--tt-orange) / 0.6)" }}
            >
              {buttonLabel}
            </span>
          </div>
        )}
        {pressStatus !== "idle" && (
          <div className="bg-muted/80 border border-border px-3 py-1.5">
            <span className="text-[10px] tracking-wider text-foreground font-display font-semibold whitespace-nowrap">
              {buttonLabel}
            </span>
          </div>
        )}
        <button
          disabled={disabled}
          onClick={() => void handleToggle()}
          className={`w-12 h-12 border flex items-center justify-center cursor-pointer transition-all active:scale-95 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${ringColor} ${
            pressStatus === "recording" ? "animate-mic-pulse-glow" : ""
          }`}
          style={glowStyle}
          aria-label={buttonLabel}
        >
          {pressStatus === "processing" ? (
            <svg
              className="animate-spin text-muted-foreground"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="31.4"
                strokeDashoffset="10"
              />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className={
                pressStatus === "recording"
                  ? "text-red-500"
                  : backendStatus === "error"
                    ? "text-muted-foreground"
                    : "text-secondary"
              }
              style={
                backendStatus === "ready" && pressStatus === "idle"
                  ? { filter: "drop-shadow(0 0 4px hsl(var(--tt-orange) / 0.6))" }
                  : undefined
              }
            >
              <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default VoiceOrderButton;
