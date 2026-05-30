import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MenuItem, OrderItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";
import { itemImageBackground } from "@/lib/menuImages";
import DietMark from "@/components/DietMark";
import { useRestaurant } from "@/lib/restaurantContext";

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

function getSessionId(): string {
  const key = "tt_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

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
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onSelect: (item: MenuItem) => void;
  onAddPairing: (item: MenuItem) => void;
  getQuantity?: (itemId: string) => number;
}

export default function DishCard({
  item,
  qty,
  pairings,
  cartTotal,
  onAddToCart,
  onUpdateQuantity,
  onSelect,
  onAddPairing,
  getQuantity,
}: DishCardProps) {
  const { isTreatment } = useRestaurant();
  const hasPairings = pairings.length > 0;
  const showPairingPanel = isTreatment && qty > 0 && hasPairings;

  const prevQtyRef = useRef(qty);
  const loggedShowRef = useRef(false);

  useEffect(() => {
    const wasZero = prevQtyRef.current === 0;
    prevQtyRef.current = qty;

    if (showPairingPanel && wasZero && !loggedShowRef.current) {
      loggedShowRef.current = true;
      supabase.from("recommendation_events").insert({
        restaurant_id: RESTAURANT_ID,
        session_id: getSessionId(),
        table_id: null as string | null,
        pattern_type: "inline_pairing_shown",
        item_shown: pairings[0].id,
        item_accepted: false,
        cart_value_at_show: cartTotal,
      });
    }

    if (qty === 0) loggedShowRef.current = false;
  }, [qty, showPairingPanel, pairings, cartTotal]);

  const handleAddPairing = (paired: PairedItem) => {
    supabase.from("recommendation_events").insert({
      restaurant_id: RESTAURANT_ID,
      session_id: getSessionId(),
      table_id: null as string | null,
      pattern_type: "inline_pairing_accepted",
      item_shown: paired.id,
      item_accepted: true,
      cart_value_at_show: cartTotal,
    });
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
                onClick={() => onUpdateQuantity(item.id, -1)}
                aria-label={`Decrease ${item.name}`}
              >
                −
              </button>
              <span>{qty}</span>
              <button
                onClick={() => onUpdateQuantity(item.id, 1)}
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
                          onClick={() => onUpdateQuantity(paired.id, -1)}
                          aria-label={`Decrease ${paired.name}`}
                        >
                          −
                        </button>
                        <span>{getQuantity?.(paired.id) ?? 0}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(paired.id, 1)}
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
