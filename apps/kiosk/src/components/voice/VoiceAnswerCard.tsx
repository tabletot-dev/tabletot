import DietMark from "@/components/DietMark";
import { itemImageBackground } from "@/lib/menuImages";
import type { MenuItem } from "@/data/menu";

interface VoiceAnswerCardProps {
  text: string;
  items: MenuItem[];
  getQuantity: (id: string) => number;
  onAddItem: (item: MenuItem) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onSelectItem: (item: MenuItem) => void;
}

export default function VoiceAnswerCard({
  text, items, getQuantity, onAddItem, onUpdateQuantity, onSelectItem,
}: VoiceAnswerCardProps) {
  const isRec = items.length > 0;
  return (
    <article className="tt-voice-answer">
      <header className="tt-voice-answer-head">
        <span className="tt-voice-answer-avatar" aria-hidden="true" />
        <p className="tt-voice-answer-head-text">{isRec ? text : "Tabletot answered"}</p>
      </header>
      <div className="tt-voice-answer-body">
        {isRec ? (
          items.slice(0, 3).map((it) => {
            const qty = getQuantity(it.id);
            return (
              <div className="tt-voice-answer-row" key={it.id}>
                <button
                  type="button"
                  className="tt-voice-answer-thumb"
                  style={{ background: itemImageBackground(it) }}
                  onClick={() => onSelectItem(it)}
                  aria-label={`View ${it.name}`}
                />
                <div className="tt-voice-answer-meta">
                  <p className="tt-voice-answer-name">
                    <DietMark isVeg={it.is_veg} compact /> {it.name}
                  </p>
                  <p className="tt-voice-answer-price">₹{it.price}</p>
                </div>
                {qty > 0 ? (
                  <div className="tt-voice-answer-stepper" aria-label={`${it.name} quantity`}>
                    <button type="button" onClick={() => onUpdateQuantity(it.id, -1)} aria-label={`Decrease ${it.name}`}>−</button>
                    <span>{qty}</span>
                    <button type="button" onClick={() => onUpdateQuantity(it.id, 1)} aria-label={`Increase ${it.name}`}>+</button>
                  </div>
                ) : (
                  <button type="button" className="tt-voice-answer-add" onClick={() => onAddItem(it)}>
                    Add
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <>
            <p className="tt-voice-answer-text">{text}</p>
            <p className="tt-voice-answer-foot">
              Kitchen estimate — ask a staff member for anything allergy-critical.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
