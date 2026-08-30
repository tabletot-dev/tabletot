import { useCallback, useEffect, useRef, useState } from "react";
import VoiceDockPanel from "@/components/voice/VoiceDockPanel";
import type { DoneMessage, Turn } from "@/lib/voice/types";
import { startSttPress, type SttPressHandle } from "@/lib/voice/sttClient";
import type { TtsClientHandle } from "@/lib/voice/ttsClient";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

type PressStatus = "idle" | "recording" | "processing";

interface VoiceConversationPanelProps {
  sessionId: string | null;
  // The conversation thread is owned by Index.tsx so it persists across the
  // modal closing — see docs/notes/voice-conversation-continuity.md.
  turns: Turn[];
  order: CartItem[];
  onClose: () => void;
  onDone: (msg: DoneMessage) => void;
  ttsHandle?: React.RefObject<TtsClientHandle | null>;
  // ── Redesign wiring (additive). The host keeps the frozen STT/TTS machine
  //    below and only reshapes what it renders: the 06 dock overlay, or
  //    nothing when the full-screen answer view (07/08) has taken over.
  voicePhase: "dock" | "answer" | "closed";
  onPressStatusChange: (s: "recording" | "processing" | "idle" | "error") => void;
  onToggleReady: (toggle: () => void) => void;
  onExpandHistory: () => void;
  onChip: (text: string) => void;
}

export default function VoiceConversationPanel({
  sessionId,
  turns,
  order,
  onClose,
  onDone,
  ttsHandle,
  voicePhase,
  onPressStatusChange,
  onToggleReady,
  onExpandHistory,
  onChip,
}: VoiceConversationPanelProps) {
  const [pressStatus, setPressStatus] = useState<PressStatus>("idle");
  // Live STT text for the dock. Read off the existing `interim`/`final`
  // messages — no change to the STT call sequence.
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState(false);

  const sttRef = useRef<SttPressHandle | null>(null);
  const pressStatusRef = useRef<PressStatus>("idle");

  useEffect(() => {
    pressStatusRef.current = pressStatus;
  }, [pressStatus]);

  // Clear the last press's transcript when a new capture starts, so stale
  // final text doesn't linger into the next press. (handleToggle is frozen —
  // this render-only effect stays out of it.)
  useEffect(() => {
    if (pressStatus === "recording") {
      setTranscript("");
      setInterim(false);
    }
  }, [pressStatus]);

  const handleSttMessage = useCallback(
    (msg: Parameters<Parameters<typeof startSttPress>[1]>[0]) => {
      if (msg.type === "interim" || msg.type === "final") {
        setTranscript(msg.text);
        setInterim(msg.type === "interim");
        return;
      }
      if (msg.type === "done") {
        // Index.tsx appends this exchange to the persistent thread.
        onDone(msg);
        setPressStatus("idle");
      } else if (msg.type === "no_speech" || msg.type === "error") {
        setPressStatus("idle");
      }
    },
    [onDone],
  );

  const handleToggle = useCallback(async () => {
    if (!sessionId) return;

    if (pressStatusRef.current === "recording") {
      setPressStatus("processing");
      try {
        await sttRef.current?.stop();
      } catch {
        setPressStatus("idle");
      }
    } else if (pressStatusRef.current === "idle") {
      ttsHandle?.current?.bargeIn();
      setPressStatus("recording");
      try {
        const cartItems = order.map((item) => ({
          id: item.id,
          name: item.name,
          qty: item.quantity,
          price: item.price,
        }));
        const handle = await startSttPress(sessionId, handleSttMessage, cartItems);
        sttRef.current = handle;
      } catch {
        setPressStatus("idle");
      }
    }
  }, [sessionId, order, handleSttMessage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      sttRef.current?.stop().catch(() => {});
    };
  }, []);

  // ── Lift the frozen toggle + expose derived press status to Index.tsx.
  //    These read existing state; they do not touch the STT/TTS sequence.
  useEffect(() => {
    onToggleReady(handleToggle);
  }, [handleToggle, onToggleReady]);

  useEffect(() => {
    onPressStatusChange(pressStatus);
  }, [pressStatus, onPressStatusChange]);

  if (voicePhase !== "dock") return null;

  return (
    <VoiceDockPanel
      status={pressStatus === "processing" ? "processing" : "recording"}
      transcript={transcript}
      interim={interim}
      turns={turns}
      onToggle={() => void handleToggle()}
      onClose={onClose}
      onExpandHistory={onExpandHistory}
      onChip={onChip}
    />
  );
}
