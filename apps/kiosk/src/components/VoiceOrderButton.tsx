import { useCallback, useEffect, useRef, useState } from "react";
import { startSession, endSession } from "@/lib/voice/api";
import { openTtsClient, unlockAudioContext, type TtsClientHandle } from "@/lib/voice/ttsClient";
import { startSttPress, type SttPressHandle } from "@/lib/voice/sttClient";
import type { DoneMessage, SttMessage } from "@/lib/voice/types";

const RESTAURANT_ID = "roast-ccx-hyd";
const TABLE_ID = "T-01";

type BackendStatus = "starting" | "ready" | "error";
type PressStatus = "idle" | "recording" | "processing";

export interface VoiceOrderButtonProps {
  onDone: (msg: DoneMessage) => void;
}

const VoiceOrderButton = ({ onDone }: VoiceOrderButtonProps) => {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("starting");
  const [pressStatus, setPressStatus] = useState<PressStatus>("idle");

  const sessionIdRef = useRef<string | null>(null);
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
        const id = await startSession(TABLE_ID, RESTAURANT_ID);
        if (!mounted) return;
        sessionIdRef.current = id;
        ttsRef.current = openTtsClient(id, (msg) => {
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

  const startPress = useCallback(async () => {
    if (backendStatusRef.current !== "ready") return;
    if (pressStatusRef.current !== "idle") return;
    const id = sessionIdRef.current;
    if (!id) return;

    // Barge-in: cut any TTS audio before opening the mic
    ttsRef.current?.bargeIn();
    setPressStatus("recording");

    try {
      const handle = await startSttPress(id, handleSttMessage);
      sttRef.current = handle;
    } catch (err) {
      console.warn("STT start failed:", err);
      setPressStatus("idle");
    }
  }, [handleSttMessage]);

  const stopPress = useCallback(async () => {
    if (pressStatusRef.current !== "recording") return;
    setPressStatus("processing");
    try {
      await sttRef.current?.stop();
    } catch {
      setPressStatus("idle");
    }
  }, []);

  const disabled = backendStatus !== "ready" || pressStatus === "processing";

  const buttonLabel =
    pressStatus === "recording"
      ? "Listening…"
      : pressStatus === "processing"
        ? "Processing…"
        : backendStatus === "error"
          ? "Voice unavailable"
          : "Hold to order";

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
    <div className="flex items-center gap-2">
      {backendStatus === "ready" && pressStatus === "idle" && (
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
        onPointerDown={(e) => {
          e.preventDefault();
          void startPress();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          void stopPress();
        }}
        onPointerLeave={() => {
          void stopPress();
        }}
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
  );
};

export default VoiceOrderButton;
