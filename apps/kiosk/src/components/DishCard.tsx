import { useEffect, useRef, memo } from "react";
import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";
import { itemImageBackground } from "@/lib/menuImages";
import { track, type Source } from "@/lib/eventBus";
import DietMark from "@/components/DietMark";

const TAG_CLASS: Record<string, string> = {
  "Chef's Pick": "tag-dark",
  "Best Seller": "tag-accent",
  "Signature": "tag-light",
  "New": "tag-green",
  "Pairs Well": "tag-light",
  "Quick Add": "tag-light",
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
}: DishCardProps) {
  const hasPairings = pairings.length > 0;
  const showPairingPanel = qty > 0 && hasPairings;

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
  const displayTags = item.tags.slice(0, 2);

  return (
    <article className={`dish-card${showPairingPanel ? " has-inline-pairing" : ""}`}>
      <div
        className="dish-media"
        style={{ background: bg, cursor: "pointer" }}
        onClick={() => onSelect(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
        aria-label={`View ${item.name} details`}
      >
        {displayTags.length > 0 && (
          <div className="dish-tags">
            {displayTags.map((tag) => (
              <span key={tag} className={`tag ${TAG_CLASS[tag] ?? "tag-light"}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="dish-body">
        <div
          className="dish-text"
          onClick={() => onSelect(item)}
          style={{ cursor: "pointer" }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
        >
          <DietMark isVeg={item.is_veg} compact />
          <h3>{item.name}</h3>
        </div>

        <div className="dish-meta">
          <strong>₹{item.price}</strong>
          {qty > 0 ? (
            <div className="card-stepper" aria-label={`${item.name} quantity`}>
              <button
                onClick={() => onUpdateQuantity(item.id, -1, "main_menu")}
                aria-label={`Decrease ${item.name}`}
              >
                −
              </button>
              <span>{qty}</span>
              <button
                onClick={() => onUpdateQuantity(item.id, 1, "main_menu")}
                aria-label={`Increase ${item.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <button className="chip-action" onClick={() => onAddToCart(item)}>
              Add
            </button>
          )}
        </div>

        {showPairingPanel && (
          <div className="card-pairing-panel">
            <div>
              <p className="eyebrow">Pairs well with</p>
              <strong>Complete your order</strong>
            </div>
            <div className="card-pairing-list">
              {pairings.slice(0, 2).map((paired) => (
                <div
                  key={paired.id}
                  className="pairing-chip"
                >
                  <span
                    className="pairing-thumb"
                    style={{
                      background: itemImageBackground(paired),
                    }}
                  />
                  <span className="pairing-info">
                    <span className="pairing-topline">
                      <span className="pairing-name">
                        <DietMark isVeg={paired.is_veg} compact />
                        {paired.name}
                      </span>
                      <small>₹{paired.price}</small>
                    </span>
                    {(getQuantity?.(paired.id) ?? 0) > 0 ? (
                      <span className="card-stepper pairing-stepper" aria-label={`${paired.name} quantity`}>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(paired.id, -1, "pairing_chip")}
                          aria-label={`Decrease ${paired.name}`}
                        >
                          −
                        </button>
                        <span>{getQuantity?.(paired.id) ?? 0}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(paired.id, 1, "pairing_chip")}
                          aria-label={`Increase ${paired.name}`}
                        >
                          +
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="pairing-add"
                        onClick={() => handleAddPairing(paired)}
                        aria-label={`Add ${paired.name} — ₹${paired.price}`}
                      >
                        Add
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(DishCard);
