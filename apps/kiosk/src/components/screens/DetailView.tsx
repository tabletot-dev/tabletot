import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";
import { itemImageBackground } from "@/lib/menuImages";
import DietMark from "@/components/DietMark";
import { Mic, X } from "lucide-react";

interface DetailViewProps {
  item: MenuItem;
  pairings: PairedItem[];
  onAdd: () => void;
  onAddItem?: (item: MenuItem) => void;
  onUpdateQuantity?: (itemId: string, delta: number) => void;
  getQuantity?: (itemId: string) => number;
  onBack: () => void;
  onSelectPairing?: (item: MenuItem) => void;
  onOpenVoice?: () => void;
}

const TAG_CLASS: Record<string, string> = {
  "Chef's Pick": "tag-dark",
  "Best Seller": "tag-accent",
  "Signature": "tag-light",
  "New": "tag-green",
};

function dishType(category: string): string {
  if (/coffee|tea|chocolate/i.test(category)) return "Beverage";
  if (/dessert|pancake|smoothie/i.test(category)) return "Dessert";
  return "Food";
}

function productDescription(item: MenuItem): string {
  const type = dishType(item.category).toLowerCase();
  const diet = item.is_veg ? "vegetarian" : "non-vegetarian";
  if (/coffee|tea|chocolate/i.test(item.category)) {
    return `${item.name} is prepared as a ${diet} beverage with a focused cafe profile, suitable for quick table-side ordering.`;
  }
  if (/dessert|pancake|smoothie/i.test(item.category)) {
    return `${item.name} is a ${diet} ${type} built for a clean finish, balanced sweetness, and service-ready presentation.`;
  }
  return `${item.name} is a ${diet} ${type} from ${item.category}, designed for a clean plate profile and fast kitchen execution.`;
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

  return (
    <section className="view detail-view">
      <div className="detail-layout">
        <div className="detail-photo" style={{ background: bg }} />

        <div className="detail-panel">
          <button className="detail-close-btn" type="button" onClick={onBack} aria-label="Close product details">
            <X size={20} strokeWidth={2.4} />
          </button>

          <div>
            <p className="eyebrow">{item.category}</p>
            <div className="detail-title-row">
              <h1>{item.name}</h1>
            </div>
            {item.tags.length > 0 && (
              <div className="hero-tags" style={{ marginTop: 14 }}>
                {item.tags.map((tag) => (
                  <span key={tag} className={`tag ${TAG_CLASS[tag] ?? "tag-light"}`}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <p className="detail-copy detail-product-copy">{productDescription(item)}</p>
          </div>

          <div className="detail-facts">
            <div>
              <span>Category</span>
              <strong>{item.category}</strong>
            </div>
            <div>
              <span>Diet</span>
              <strong className="diet-fact">
                <DietMark isVeg={item.is_veg} label />
              </strong>
            </div>
            <div>
              <span>Type</span>
              <strong>{dishType(item.category)}</strong>
            </div>
          </div>

          {visiblePairings.length > 0 && (
            <div className="pairing-block detail-pairing-block">
              <div className="section-title inline">
                <div>
                  <p className="eyebrow">Pairs well with</p>
                  <h2>Complete the order elegantly</h2>
                </div>
              </div>
              <div className="compact-grid">
                {visiblePairings.map((p) => {
                  const pairingQty = getQuantity?.(p.id) ?? 0;

                  return (
                    <article key={p.id} className="compact-card">
                      <button
                        type="button"
                        className="compact-thumb"
                        style={{ background: itemImageBackground(p) }}
                        onClick={() => onSelectPairing?.(p)}
                        aria-label={`View ${p.name}`}
                      />
                      <div className="compact-copy">
                        <strong>
                          <DietMark isVeg={p.is_veg} compact />
                          {p.name}
                        </strong>
                        <span>₹{p.price}</span>
                      </div>
                      {pairingQty > 0 ? (
                        <div className="card-stepper compact-stepper" aria-label={`${p.name} quantity`}>
                          <button type="button" onClick={() => onUpdateQuantity?.(p.id, -1)} aria-label={`Decrease ${p.name}`}>
                            −
                          </button>
                          <span>{pairingQty}</span>
                          <button type="button" onClick={() => onUpdateQuantity?.(p.id, 1)} aria-label={`Increase ${p.name}`}>
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="mini-plus"
                          onClick={() => onAddItem?.(p)}
                          aria-label={`Add ${p.name}`}
                        >
                          +
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <div className="detail-footer">
            <div>
              <p className="eyebrow">Item price</p>
              <strong className="price">₹{item.price}</strong>
            </div>
            {itemQty > 0 ? (
              <div className="card-stepper detail-stepper" aria-label={`${item.name} quantity`}>
                <button type="button" onClick={() => onUpdateQuantity?.(item.id, -1)} aria-label={`Decrease ${item.name}`}>
                  −
                </button>
                <span>{itemQty}</span>
                <button type="button" onClick={() => onUpdateQuantity?.(item.id, 1)} aria-label={`Increase ${item.name}`}>
                  +
                </button>
              </div>
            ) : (
              <button type="button" className="primary-btn wide" onClick={onAdd}>
                Add to Order
              </button>
            )}
          </div>

        </div>
      </div>

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
    </section>
  );
}
