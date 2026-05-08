import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MenuItem, OrderItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";

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

// Category → background gradient for dish-media placeholder (no image_url in schema yet)
// TODO: image_url missing from schema — replace with background-image once column is added
const CATEGORY_GRADIENTS: Record<string, string> = {
  "All Day Breakfast": "linear-gradient(135deg, #f8c58d, #f4956a)",
  "Silver Breakfast": "linear-gradient(135deg, #f0d89a, #e8a55c)",
  "Smoothie Bowls": "linear-gradient(135deg, #a8e6cf, #56c596)",
  "Pancakes": "linear-gradient(135deg, #fde68a, #f59e0b)",
  "Fries": "linear-gradient(135deg, #fcd34d, #f59e0b)",
  "Sandwiches": "linear-gradient(135deg, #d4a574, #b8845a)",
  "Focaccia": "linear-gradient(135deg, #deb887, #c4975a)",
  "Burgers": "linear-gradient(135deg, #e8a87c, #d4624a)",
  "Pastas": "linear-gradient(135deg, #f9c78c, #e8926a)",
  "Hot Coffee": "linear-gradient(135deg, #c8a97e, #8b5e3c)",
  "Signature Coffee": "linear-gradient(135deg, #b8956a, #7a4e2a)",
  "Iced Coffee": "linear-gradient(135deg, #a8d8ea, #5ba4cf)",
  "Tea & Chocolate": "linear-gradient(135deg, #c8b5a0, #8b7355)",
  "Desserts": "linear-gradient(135deg, #f9d4d4, #e8a0b0)",
};

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
}: DishCardProps) {
  const hasPairings = pairings.length > 0;
  const showPairingPanel = qty > 0 && hasPairings;

  // Track prior qty to detect the 0 → 1 transition (first add)
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

    // Reset so we log again if item is removed and re-added
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

  const bg = CATEGORY_GRADIENTS[item.category] ?? "linear-gradient(135deg, #e8d5c4, #c4a882)";
  const displayTags = item.tags.slice(0, 2);

  return (
    <article className="dish-card">
      {/* Dish media — color gradient placeholder until image_url is added to schema */}
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
                <button
                  key={paired.id}
                  className="pairing-chip"
                  onClick={() => handleAddPairing(paired)}
                  aria-label={`Add ${paired.name} — ₹${paired.price}`}
                >
                  <span
                    className="pairing-thumb"
                    style={{
                      background: CATEGORY_GRADIENTS[paired.category] ?? "linear-gradient(135deg, #e8d5c4, #c4a882)",
                    }}
                  />
                  <span className="pairing-info">
                    <span className="pairing-topline">
                      <span className="pairing-name">{paired.name}</span>
                      <small>₹{paired.price}</small>
                    </span>
                    <span className="pairing-add">Add</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
