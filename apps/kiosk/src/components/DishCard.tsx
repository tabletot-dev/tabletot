import { useEffect, useRef, memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";
import { itemImageBackground } from "@/lib/menuImages";
import { track, type Source } from "@/lib/eventBus";
import DietMark from "@/components/DietMark";
import Stepper from "@/components/Stepper";

// Pairing chips fly in a beat after the panel opens — long enough that the
// eye has landed on the just-added item first (personas 01, 06). transform +
// opacity only (Lenovo K9 perf budget). prefers-reduced-motion → no transform.
const PAIRING_LIST_VARIANTS = {
  hidden: {},
  visible: { transition: { delayChildren: 0.35, staggerChildren: 0.09 } },
};

interface DishCardProps {
  item: MenuItem;
  qty: number;
  pairings: PairedItem[];
  cartTotal: number;
  onAddToCart: (item: MenuItem) => void;
  onUpdateQuantity: (itemId: string, delta: number, source: Source) => void;
  onSelect: (item: MenuItem) => void;
  onAddPairing: (item: MenuItem) => void;
  getQuantity?: (itemId: string) => number;
  /** Clears the line in one (confirmed) tap; shown only at qty >= 2. */
  onClearItem?: (itemId: string) => void;
}

function DishCard({
  item,
  qty,
  pairings,
  onAddToCart,
  onUpdateQuantity,
  onSelect,
  onAddPairing,
  getQuantity,
  onClearItem,
}: DishCardProps) {
  const hasPairings = pairings.length > 0;
  const showPairingPanel = qty > 0 && hasPairings;

  const reduceMotion = useReducedMotion();
  const pairingRowVariants = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
    visible: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, transition: { duration: 0.28 } },
  };

  // Track which pairing items we've already logged a shown event for, scoped
  // to the current "panel open" cycle. Cleared when the panel closes (qty
  // returns to zero) so a re-open re-logs.
  const shownPairingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!showPairingPanel) {
      shownPairingIds.current.clear();
      return;
    }
    const visible = pairings.slice(0, 2);
    visible.forEach((paired) => {
      if (shownPairingIds.current.has(paired.id)) return;
      shownPairingIds.current.add(paired.id);
      track("recommendation_shown", {
        itemId: paired.id,
        surface: "inline_pairing",
      });
    });
  }, [showPairingPanel, pairings]);

  const handleAddPairing = (paired: PairedItem) => {
    track("recommendation_tapped", {
      itemId: paired.id,
      surface: "inline_pairing",
    });
    // The actual item_added event is fired by the cart hook when the parent
    // calls addToOrder(paired, "pairing_chip"). Keeping a single emitter for
    // item_added avoids double-counting in attribution.
    onAddPairing(paired);
  };

  const bg = itemImageBackground(item);

  return (
    <article className={`tt-dishcard${showPairingPanel ? " has-inline-pairing" : ""}${qty > 0 ? " in-cart" : ""}`}>
      <div className="tt-dishcard-row">
        <div
          className="tt-dishcard-media"
          style={{ background: bg, cursor: "pointer" }}
          onClick={() => onSelect(item)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
          aria-label={`View ${item.name} details`}
        />

        <div className="tt-dishcard-body">
          <div
            className="tt-dishcard-name"
            onClick={() => onSelect(item)}
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
          >
            <DietMark isVeg={item.is_veg} compact />
            <h3>{item.name}</h3>
          </div>
          {item.description && <p className="tt-dishcard-desc">{item.description}</p>}
          <strong className="tt-dishcard-price">₹{item.price}</strong>
        </div>

        <div className="tt-dishcard-action">
          {qty > 0 ? (
            <Stepper
              qty={qty}
              label={item.name}
              onDec={() => onUpdateQuantity(item.id, -1, "main_menu")}
              onInc={() => onUpdateQuantity(item.id, 1, "main_menu")}
              onClear={onClearItem ? () => onClearItem(item.id) : undefined}
            />
          ) : (
            <button className="tt-btn--accent" onClick={() => onAddToCart(item)}>
              Add
            </button>
          )}
        </div>
      </div>

      {showPairingPanel && (
        <div className="tt-pairing-panel">
          <p className="eyebrow">Goes well with</p>
          <motion.div
            className="tt-pairing-list"
            variants={PAIRING_LIST_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            {pairings.slice(0, 2).map((paired) => (
              <motion.div key={paired.id} className="tt-pairing-row" variants={pairingRowVariants}>
                <span
                  className="tt-pairing-thumb"
                  style={{ background: itemImageBackground(paired) }}
                />
                <span className="tt-pairing-info">
                  <span className="tt-pairing-name">
                    <DietMark isVeg={paired.is_veg} compact />
                    {paired.name}
                  </span>
                  <span className="tt-pairing-price">₹{paired.price}</span>
                </span>
                {(getQuantity?.(paired.id) ?? 0) > 0 ? (
                  <Stepper
                    qty={getQuantity?.(paired.id) ?? 0}
                    label={paired.name}
                    onDec={() => onUpdateQuantity(paired.id, -1, "pairing_chip")}
                    onInc={() => onUpdateQuantity(paired.id, 1, "pairing_chip")}
                  />
                ) : (
                  <button
                    type="button"
                    className="tt-pairing-add"
                    onClick={() => handleAddPairing(paired)}
                    aria-label={`Add ${paired.name} — ₹${paired.price}`}
                  >
                    +
                  </button>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </article>
  );
}

export default memo(DishCard);
