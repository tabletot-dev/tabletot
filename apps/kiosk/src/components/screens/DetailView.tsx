import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";
import { itemImageBackground } from "@/lib/menuImages";
import { track, type Source } from "@/lib/eventBus";
import DietMark from "@/components/DietMark";
import { Mic, X } from "lucide-react";

// See DishCard: pairing chips fly in a beat after the panel appears.
// transform + opacity only; prefers-reduced-motion → no transform.
const PAIRING_LIST_VARIANTS = {
  hidden: {},
  visible: { transition: { delayChildren: 0.35, staggerChildren: 0.09 } },
};

interface DetailViewProps {
  item: MenuItem;
  pairings: PairedItem[];
  onAdd: () => void;
  onAddItem?: (item: MenuItem) => void;
  onUpdateQuantity?: (itemId: string, delta: number, source?: Source) => void;
  getQuantity?: (itemId: string) => number;
  onBack: () => void;
  onSelectPairing?: (item: MenuItem) => void;
  onOpenVoice?: () => void;
}

export default function DetailView({
  item,
  pairings,
  onAdd,
  onAddItem,
  onUpdateQuantity,
  getQuantity,
  onBack,
  onSelectPairing,
  onOpenVoice,
}: DetailViewProps) {
  const bg = itemImageBackground(item);
  const visiblePairings = pairings.slice(0, 4);
  const itemQty = getQuantity?.(item.id) ?? 0;

  const reduceMotion = useReducedMotion();
  const pairingRowVariants = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
    visible: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, transition: { duration: 0.28 } },
  };

  // Same pattern as DishCard's inline pairing panel: log one shown event per
  // pairing per "panel visible" cycle. Previously this panel fired no
  // recommendation_shown/tapped at all (audit M6) — acceptance rate for the
  // grid-card pairing chip existed, but this surface was invisible to it.
  const shownPairingIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (visiblePairings.length === 0) {
      shownPairingIds.current.clear();
      return;
    }
    visiblePairings.forEach((p) => {
      if (shownPairingIds.current.has(p.id)) return;
      shownPairingIds.current.add(p.id);
      track("recommendation_shown", { itemId: p.id, surface: "inline_pairing" });
    });
  }, [visiblePairings]);

  const handleAddPairing = (p: MenuItem) => {
    track("recommendation_tapped", { itemId: p.id, surface: "inline_pairing" });
    // item_added itself is fired by the cart hook when the parent calls
    // addToOrder(p, "pairing_chip") via onAddItem — single emitter, no
    // double-counting.
    onAddItem?.(p);
  };

  return (
    <section className="tt-detail">
      <div className="tt-detail-photo" style={{ background: bg }} />

      <button className="tt-detail-close" type="button" onClick={onBack} aria-label="Close product details">
        <X size={20} strokeWidth={2.4} />
      </button>

      <div className="tt-detail-body">
        <p className="tt-badge">{item.category}</p>
        <div className="tt-detail-title-row">
          <h1>{item.name}</h1>
          <DietMark isVeg={item.is_veg} label />
        </div>
        {item.tags.length > 0 && (
          <div className="tt-tag-row">
            {item.tags.map((tag) => (
              <span key={tag} className="tt-badge">
                {tag}
              </span>
            ))}
          </div>
        )}
        {item.description && (
          <p className="tt-detail-copy">{item.description}</p>
        )}

        {visiblePairings.length > 0 && (
          <div className="tt-pairing-panel">
            <p className="eyebrow">Goes well with</p>
            <motion.div
              className="tt-pairing-list"
              variants={PAIRING_LIST_VARIANTS}
              initial="hidden"
              animate="visible"
            >
              {visiblePairings.map((p) => {
                const pairingQty = getQuantity?.(p.id) ?? 0;

                return (
                  <motion.div key={p.id} className="tt-pairing-row" variants={pairingRowVariants}>
                    <button
                      type="button"
                      className="tt-pairing-thumb"
                      style={{ background: itemImageBackground(p) }}
                      onClick={() => onSelectPairing?.(p)}
                      aria-label={`View ${p.name}`}
                    />
                    <span className="tt-pairing-info">
                      <span className="tt-pairing-name">
                        <DietMark isVeg={p.is_veg} compact />
                        {p.name}
                      </span>
                      <span className="tt-pairing-price">₹{p.price}</span>
                    </span>
                    {pairingQty > 0 ? (
                      <span className="tt-stepper" aria-label={`${p.name} quantity`}>
                        <button
                          type="button"
                          className={pairingQty === 1 ? "tt-stepper-minus--floor" : undefined}
                          onClick={() => onUpdateQuantity?.(p.id, -1, "pairing_chip")}
                          aria-label={`Decrease ${p.name}`}
                        >
                          −
                        </button>
                        <span>{pairingQty}</span>
                        <button type="button" onClick={() => onUpdateQuantity?.(p.id, 1, "pairing_chip")} aria-label={`Increase ${p.name}`}>
                          +
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="tt-pairing-add"
                        onClick={() => handleAddPairing(p)}
                        aria-label={`Add ${p.name}`}
                      >
                        +
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        )}

        {onOpenVoice && (
          <div className="detail-mic-dock">
            <div className="detail-mic-bubbles" aria-hidden="true">
              <span>Ingredients?</span>
              <span>Pairing?</span>
              <span>Make it lighter?</span>
            </div>
            <button
              type="button"
              className="detail-mic-btn"
              onClick={onOpenVoice}
              aria-label={`Ask about ${item.name} with voice`}
            >
              <Mic size={34} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      <div className="tt-detail-footer">
        <div>
          <p className="eyebrow">Item price</p>
          <strong className="tt-detail-price">
            ₹{item.price}
            {item.prepMinutes != null && <span className="tt-dishcard-prep"> · {item.prepMinutes} min</span>}
          </strong>
        </div>
        {itemQty > 0 ? (
          <div className="tt-stepper" aria-label={`${item.name} quantity`}>
            <button
              type="button"
              className={itemQty === 1 ? "tt-stepper-minus--floor" : undefined}
              onClick={() => onUpdateQuantity?.(item.id, -1)}
              aria-label={`Decrease ${item.name}`}
            >
              −
            </button>
            <span>{itemQty}</span>
            <button type="button" onClick={() => onUpdateQuantity?.(item.id, 1)} aria-label={`Increase ${item.name}`}>
              +
            </button>
          </div>
        ) : (
          <button type="button" className="tt-btn--primary" onClick={onAdd}>
            Add to Order
          </button>
        )}
      </div>
    </section>
  );
}
