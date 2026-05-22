
import { motion, AnimatePresence } from "framer-motion";
import type { PressStatus } from "./VoiceOrderButton";

interface ResolvedItem {
  name: string;
  applied: boolean;
}

interface VoiceModalProps {
  status: PressStatus;
  transcript: string;
  response: string;
  resolvedItems: ResolvedItem[];
  onDismiss: () => void;
}

export default function VoiceModal({
  status,
  transcript,
  response,
  resolvedItems,
  onDismiss,
}: VoiceModalProps) {
  const isActive = status === "recording" || status === "processing";
  const hasDoneResult = status === "idle" && (transcript || resolvedItems.length > 0);
  const visible = isActive || hasDoneResult;


  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="voice-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={hasDoneResult ? onDismiss : undefined}
        >
          <motion.div
            className="voice-modal-panel"
            initial={{ scale: 0.96, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Recording state */}
            {status === "recording" && (
              <div className="voice-modal-listening">
                <div className="voice-modal-orb">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.8" />
                    <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </div>
                <p className="voice-modal-status-text">Listening…</p>
                <div className="voice-modal-wave">
                  {[...Array(6)].map((_, i) => (
                    <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
                <p className="voice-modal-hint">Speak your order. Tap the mic again to stop.</p>
              </div>
            )}

            {/* Processing state */}
            {status === "processing" && (
              <div className="voice-modal-processing">
                <svg className="voice-modal-spinner" width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"
                    strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              </div>
            )}

            {/* Done state — results */}
            {hasDoneResult && (
              <div className="voice-modal-done">
                <div className="voice-modal-done-header">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="voice-modal-check-icon">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                    <polyline points="8 12 11 15 16 9" stroke="currentColor" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Order updated</span>
                </div>

                {transcript && (
                  <div className="voice-modal-transcript">
                    <p className="eyebrow">You said</p>
                    <p className="voice-modal-transcript-text">"{transcript}"</p>
                  </div>
                )}

                {resolvedItems.length > 0 && (
                  <div className="voice-modal-items">
                    {resolvedItems.map((item, i) => (
                      <div key={i} className={`voice-modal-item${item.applied ? "" : " unapplied"}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          {item.applied ? (
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5"
                              strokeLinecap="round" strokeLinejoin="round" />
                          ) : (
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2.5"
                              strokeLinecap="round" />
                          )}
                        </svg>
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {response && (
                  <p className="voice-modal-response">{response}</p>
                )}

                <button className="voice-modal-close" onClick={onDismiss}>
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
