import { motion, AnimatePresence } from "framer-motion";
import type { PressStatus } from "./VoiceOrderButton";

interface VoiceBannerProps {
  status: PressStatus;
  lastAdded: string[];
}

export default function VoiceBanner({ status, lastAdded }: VoiceBannerProps) {
  const isActive = status === "recording" || status === "processing";
  const hasResult = status === "idle" && lastAdded.length > 0;
  const visible = isActive || hasResult;

  const text =
    status === "recording" ? "Listening…"
    : status === "processing" ? "Processing your order…"
    : lastAdded.length > 0 ? `Added: ${lastAdded.join(", ")}`
    : "";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`voice-banner${status === "recording" ? " voice-banner-live" : ""}`}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {status === "recording" && (
            <span className="voice-banner-dot" aria-hidden="true" />
          )}
          {status === "processing" && (
            <svg className="voice-banner-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"
                strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
          )}
          {hasResult && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="voice-banner-check">
              <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span className="voice-banner-text">{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
