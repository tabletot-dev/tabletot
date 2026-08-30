import { useState } from "react";
import EarlierStrip from "@/components/voice/EarlierStrip";
import VoiceAnswerCard from "@/components/voice/VoiceAnswerCard";
import type { MenuItem } from "@/data/menu";
import type { Turn } from "@/lib/voice/types";

interface VoiceConversationScreenProps {
  turns: Turn[];
  getQuantity: (id: string) => number;
  onAddItem: (item: MenuItem) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onSelectItem: (item: MenuItem) => void;
  onClose: () => void;
  onRequestSpeak: () => void;
}

function SaidCard({ text }: { text: string }) {
  return (
    <div className="tt-voice-said">
      <p className="tt-voice-said-label">You said</p>
      <p className="tt-voice-said-text">{text}</p>
    </div>
  );
}

export default function VoiceConversationScreen({
  turns,
  getQuantity,
  onAddItem,
  onUpdateQuantity,
  onSelectItem,
  onClose,
  onRequestSpeak,
}: VoiceConversationScreenProps) {
  const [expanded, setExpanded] = useState(false);

  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const lastAi = [...turns].reverse().find((t) => t.role === "ai");
  const earlier = turns.slice(0, -2);
  const isRec = (lastAi?.matchedItems?.length ?? 0) > 0;

  const chips = isRec
    ? ["Add both", "Show me more", "Something warmer"]
    : ["Show me lighter dishes", "Back to the menu"];

  const handleChip = (label: string) => {
    if (label === "Add both") {
      lastAi?.matchedItems?.forEach((it) => onAddItem(it));
      return;
    }
    if (label === "Back to the menu") {
      onClose();
      return;
    }
    onRequestSpeak();
  };

  const renderAnswer = (turn: Turn, key?: string | number) => (
    <VoiceAnswerCard
      key={key}
      text={turn.text}
      items={turn.matchedItems ?? []}
      getQuantity={getQuantity}
      onAddItem={onAddItem}
      onUpdateQuantity={onUpdateQuantity}
      onSelectItem={onSelectItem}
    />
  );

  return (
    <div className="tt-voice-convo">
      <div className="tt-voice-convo-head">
        <div>
          <h1>Your conversation</h1>
          <p className="tt-voice-convo-sub">
            {turns.length} messages · kept until you leave the table
          </p>
        </div>
        <button type="button" className="tt-voice-convo-close" onClick={onClose}>
          Close ✕
        </button>
      </div>

      {expanded ? (
        <>
          <button
            type="button"
            className="tt-voice-convo-chip"
            onClick={() => setExpanded(false)}
          >
            Show recent
          </button>
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <SaidCard key={i} text={turn.text} />
            ) : (
              renderAnswer(turn, i)
            ),
          )}
        </>
      ) : (
        <>
          {earlier.length > 0 && (
            <>
              <EarlierStrip
                turns={earlier}
                tone="light"
                onExpand={() => setExpanded(true)}
              />
              <button
                type="button"
                className="tt-voice-convo-chip"
                onClick={() => setExpanded(true)}
              >
                Show all
              </button>
            </>
          )}
          {lastUser && <SaidCard text={lastUser.text} />}
          {lastAi && renderAnswer(lastAi)}
        </>
      )}

      <div className="tt-voice-convo-chips">
        {chips.map((label) => (
          <button
            key={label}
            type="button"
            className="tt-voice-convo-chip"
            onClick={() => handleChip(label)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="tt-voice-speakdock"
        onClick={onRequestSpeak}
      >
        <span className="tt-voice-speakdock-mark" aria-hidden="true" />
        <span className="tt-voice-speakdock-lines">
          <span className="tt-voice-speakdock-line">Tap the mark to speak</span>
          <span className="tt-voice-speakdock-line tt-voice-speakdock-line--sub">
            Tap it again to stop · this conversation is kept
          </span>
        </span>
      </button>
    </div>
  );
}
