import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { startSession, endSession } from "@/lib/voice/api";
import { openTtsClient, unlockAudioContext, type TtsClientHandle } from "@/lib/voice/ttsClient";
import { startSttPress, MicPermissionDeniedError, type SttPressHandle } from "@/lib/voice/sttClient";
import type { DoneMessage, SttMessage } from "@/lib/voice/types";

type BackendStatus = "starting" | "ready" | "error";
export type PressStatus = "idle" | "recording" | "processing";

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
  onStatusChange?: (status: PressStatus) => void;
  onOpenConversation?: () => void;
  onSessionReady?: (sessionId: string) => void;
  onTtsReady?: (handle: TtsClientHandle) => void;
}

const VoiceOrderButton = ({ onDone, order, restaurantId, tableId, onStatusChange, onOpenConversation, onSessionReady, onTtsReady }: VoiceOrderButtonProps) => {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("starting");
  const [pressStatus, setPressStatus] = useState<PressStatus>("idle");
  const [micBlocked, setMicBlocked] = useState(false);
  const conversationMode = Boolean(onOpenConversation);

  const sessionIdRef = useRef<string | null>(null);
  const clientSessionIdRef = useRef<string | null>(null);
  const ttsRef = useRef<TtsClientHandle | null>(null);
  const sttRef = useRef<SttPressHandle | null>(null);
  const pressStatusRef = useRef<PressStatus>("idle");
  const backendStatusRef = useRef<BackendStatus>("starting");

  // Stable ref used by handleSttMessage (useCallback) to call doRestart()
  // from inside the useEffect without a stale-closure problem.
  const restartSessionRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    pressStatusRef.current = pressStatus;
    onStatusChange?.(pressStatus);
  }, [pressStatus, onStatusChange]);

  useEffect(() => { backendStatusRef.current = backendStatus; }, [backendStatus]);

  useEffect(() => {
    let mounted = true;
    let restartInProgress = false;

    // Opens a new voice session and TTS client.
    // Called on first mount and after a 4004 session-not-found error.
    async function initSession(): Promise<void> {
      const { voiceSessionId, clientSessionId } = await startSession(tableId, restaurantId);
      if (!mounted) return;
      sessionIdRef.current = voiceSessionId;
      clientSessionIdRef.current = clientSessionId;
      ttsRef.current = openTtsClient(voiceSessionId, (msg) => {
        if (msg.type === "error") {
          if (msg.message === "Session not found") {
            // Backend session was lost (restart). Recover transparently.
            void restartSessionRef.current();
          } else {
            console.warn("TTS error:", msg.message);
          }
        }
      });
      onSessionReady?.(voiceSessionId);
      onTtsReady?.(ttsRef.current);
      setBackendStatus("ready");
    }

    // Tears down the current TTS connection and re-establishes the session.
    // Guarded against concurrent calls and unmounted components.
    async function doRestart(): Promise<void> {
      if (restartInProgress || !mounted) return;
      restartInProgress = true;
      setBackendStatus("starting");
      ttsRef.current?.close();
      ttsRef.current = null;
      sessionIdRef.current = null;
      try {
        await initSession();
      } catch (err) {
        if (!mounted) return;
        console.warn("Voice session restart failed:", err);
        setBackendStatus("error");
      } finally {
        restartInProgress = false;
      }
    }

    // Expose doRestart to handleSttMessage (defined outside this effect).
    restartSessionRef.current = doRestart;

    (async () => {
      try {
        await unlockAudioContext();
        await initSession();
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
          if (msg.message === "Session not found") {
            // Backend session was lost (restart). Recover transparently.
            void restartSessionRef.current();
          } else {
            console.warn("STT error:", msg.message);
          }
          setPressStatus("idle");
          break;
      }
    },
    [onDone],
  );

  const handleToggle = useCallback(async () => {
    if (conversationMode) {
      onOpenConversation?.();
      return;
    }

    if (backendStatusRef.current !== "ready") return;
    if (micBlocked) return;

    if (pressStatusRef.current === "recording") {
      setPressStatus("processing");
      try {
        await sttRef.current?.stop();
      } catch {
        setPressStatus("idle");
      }
    } else if (pressStatusRef.current === "idle") {
      const id = sessionIdRef.current;
      if (!id) return;
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
  }, [conversationMode, onOpenConversation, handleSttMessage, order, micBlocked]);

  const disabled = !conversationMode && (backendStatus !== "ready" || pressStatus === "processing");

  const label =
    conversationMode ? "Open voice conversation"
    : pressStatus === "recording" ? "Tap to stop"
    : pressStatus === "processing" ? "Processing…"
    : backendStatus === "error" ? "Voice unavailable"
    : "Tap to speak";

  const btnClass = [
    "tt-voice-ptt-btn",
    pressStatus === "recording" ? "tt-voice-ptt-recording" : "",
    pressStatus === "processing" ? "tt-voice-ptt-processing" : "",
    !conversationMode && (backendStatus === "error" || micBlocked) ? "tt-voice-ptt-error" : "",
    !conversationMode && backendStatus === "starting" ? "tt-voice-ptt-starting" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="tt-voice-ptt-wrap">
      {micBlocked && (
        <div className="tt-voice-ptt-blocked-msg">
          Allow microphone access in browser settings to use voice ordering.
        </div>
      )}
      <div className="tt-voice-ptt-bubbles" aria-hidden="true">
        <span>Suggest a meal?</span>
        <span>For three people?</span>
        <span>Post-gym?</span>
      </div>
      <button
        disabled={disabled}
        onClick={() => void handleToggle()}
        className={btnClass}
        aria-label={label}
        title={label}
      >
        {pressStatus === "processing" ? (
          <svg className="tt-voice-ptt-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"
              strokeDasharray="31.4" strokeDashoffset="10" />
          </svg>
        ) : (
          // Same glyph as everywhere else a mic appears (DetailView's
          // detail-mic-btn) — was a one-off hand-drawn path here, which read
          // as a different icon depending which screen you were on
          // (2026-09-29 UX audit). Visual only: no change to state, classes,
          // or handlers below.
          <Mic size={20} strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
};

export default VoiceOrderButton;
