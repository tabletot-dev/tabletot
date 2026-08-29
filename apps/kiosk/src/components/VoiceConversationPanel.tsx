import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import DietMark from "@/components/DietMark";
import { itemImageBackground } from "@/lib/menuImages";
import type { MenuItem } from "@/data/menu";
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
  getQuantity: (itemId: string) => number;
  onClose: () => void;
  onDone: (msg: DoneMessage) => void;
  onAddItem: (item: MenuItem) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onSelectItem: (item: MenuItem) => void;
  ttsHandle?: React.RefObject<TtsClientHandle | null>;
}

export default function VoiceConversationPanel({
  sessionId,
  turns,
  order,
  getQuantity,
  onClose,
  onDone,
  onAddItem,
  onUpdateQuantity,
  onSelectItem,
  ttsHandle,
}: VoiceConversationPanelProps) {
  const [pressStatus, setPressStatus] = useState<PressStatus>("idle");

  const sttRef = useRef<SttPressHandle | null>(null);
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const pressStatusRef = useRef<PressStatus>("idle");

  useEffect(() => {
    pressStatusRef.current = pressStatus;
  }, [pressStatus]);

  // Auto-scroll to bottom on new turns
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const handleSttMessage = useCallback(
    (msg: Parameters<Parameters<typeof startSttPress>[1]>[0]) => {
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

  const canSpeak = sessionId !== null && pressStatus !== "processing";

  const inputLabel =
    pressStatus === "recording"
      ? "Listening…"
      : pressStatus === "processing"
        ? "Processing…"
        : !sessionId
          ? "Connecting…"
          : "Tap to speak";

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        {/* Opaque backdrop + Radix focus trap / scroll lock make the menu
            behind genuinely inert — not just visually behind a z-index. */}
        <Dialog.Overlay className="voice-conversation-backdrop" />
        <Dialog.Content asChild aria-label="Voice conversation" aria-describedby={undefined}>
          <motion.section
            className="voice-conversation-panel"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="voice-conversation-head">
              <div>
                <p className="eyebrow">Voice channel</p>
                <Dialog.Title asChild>
                  <h2>Ask Tabletot</h2>
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="voice-conversation-close"
                  aria-label="Close voice conversation"
                >
                  X
                </button>
              </Dialog.Close>
            </div>

            <div className="voice-conversation-stream">
        {turns.length === 0 && (
          <>
            <div className="voice-chat-row ai">
              <div className="voice-chat-bubble">
                Tell me what you need. I can recommend meals by appetite, diet,
                group size, allergens, or pairings.
              </div>
            </div>
            <div className="voice-prompt-grid">
              <span>Suggest a post-gym meal</span>
              <span>Recommend for three people</span>
              <span>High calorie or light?</span>
              <span>One veg, one non-veg</span>
            </div>
          </>
        )}

        {turns.map((turn, i) => (
          <div key={i}>
            <div className={`voice-chat-row ${turn.role}`}>
              <div className="voice-chat-bubble">{turn.text}</div>
            </div>

            {turn.role === "ai" && turn.matchedItems && turn.matchedItems.length > 0 && (
              <div className="voice-recommendation-grid">
                {turn.matchedItems.slice(0, 2).map((item) => (
                  <article key={item.id} className="voice-recommendation-card">
                    <button
                      type="button"
                      className="voice-recommendation-media"
                      style={{ background: itemImageBackground(item) }}
                      onClick={() => onSelectItem(item)}
                      aria-label={`View ${item.name}`}
                    />
                    <div className="voice-recommendation-body">
                      <p className="eyebrow">Recommended</p>
                      <div className="voice-recommendation-title">
                        <DietMark isVeg={item.is_veg} compact />
                        <strong>{item.name}</strong>
                      </div>
                      <div className="voice-recommendation-action">
                        <span>₹{item.price}</span>
                        {getQuantity(item.id) > 0 ? (
                          <div
                            className="card-stepper voice-stepper"
                            aria-label={`${item.name} quantity`}
                          >
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.id, -1)}
                              aria-label={`Decrease ${item.name}`}
                            >
                              −
                            </button>
                            <span>{getQuantity(item.id)}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.id, 1)}
                              aria-label={`Increase ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => onAddItem(item)}>
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ))}

        <div ref={streamEndRef} />
      </div>

      <div className={`voice-conversation-input${pressStatus === "recording" ? " is-listening" : ""}`}>
        <div className="voice-input-status">
          <span className="voice-live-dot" aria-hidden="true" />
          <span>{inputLabel}</span>
        </div>
        <div className="voice-frequency-meter" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </div>
        <button
          type="button"
          className={`voice-stop-btn${pressStatus === "idle" ? "" : " muted"}`}
          onClick={() => void handleToggle()}
          disabled={!canSpeak}
          aria-label={pressStatus === "recording" ? "Stop recording" : "Start recording"}
        >
          {pressStatus === "processing" ? (
            <svg className="ptt-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="2"
                strokeDasharray="31.4" strokeDashoffset="10"
              />
            </svg>
          ) : pressStatus === "recording" ? (
            "Stop"
          ) : (
            "Speak"
          )}
        </button>
      </div>
          </motion.section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
