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
  // Shared unmatched-chip fallback (review minor 11): append a visual user turn,
  // same as the dock's chips. "Back to the menu" / "Add both" stay special-cased.
  onChip: (text: string) => void;
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
  onChip,
}: VoiceConversationScreenProps) {
  const [expanded, setExpanded] = useState(false);

  // The tail is not guaranteed to be [user, ai] — a visual-only chip turn or a
  // no_speech press can leave it [..., ai, user]. Anchor on the last ai turn,
  // then the last user turn before it (review I5).
  const iAi = turns.map((t) => t.role).lastIndexOf("ai");
  const iUser = iAi < 0 ? -1 : turns.slice(0, iAi).map((t) => t.role).lastIndexOf("user");
  const lastAi = iAi >= 0 ? turns[iAi] : undefined;
  const lastUser = iUser >= 0 ? turns[iUser] : undefined;
  const earlier = turns.slice(0, iUser >= 0 ? iUser : iAi >= 0 ? iAi : turns.length);

  const itemsShown = (lastAi?.matchedItems ?? []).slice(0, 3);
  const isRec = itemsShown.length > 0;

  const chips = isRec
    ? [...(itemsShown.length === 2 ? ["Add both"] : []), "Show me more", "Something warmer"]
    : ["Show me lighter dishes", "Back to the menu"];

  const handleChip = (label: string) => {
    if (label === "Add both") {
      itemsShown.forEach((it) => onAddItem(it));
      return;
    }
    if (label === "Back to the menu") {
      onClose();
      return;
    }
    onChip(label);
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
            {turns.length} {turns.length === 1 ? "message" : "messages"} · kept until you leave the table
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
            <EarlierStrip
              turns={earlier}
              tone="light"
              onExpand={() => setExpanded(true)}
            />
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
