import type { MenuItem } from "@/data/menu";
import type { PairedItem } from "@/lib/menuStore";
import { categoryGradient } from "@/lib/categoryGradients";

interface DetailViewProps {
  item: MenuItem;
  pairings: PairedItem[];
  onAdd: () => void;
  onBack: () => void;
  onSelectPairing?: (item: MenuItem) => void;
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

export default function DetailView({ item, pairings, onAdd, onBack, onSelectPairing }: DetailViewProps) {
  const bg = categoryGradient(item.category);
  const visiblePairings = pairings.slice(0, 4);

  return (
    <section className="view detail-view">
      <div className="detail-layout">
        <div className="detail-photo" style={{ background: bg }} />

        <div className="detail-panel">
          <div>
            <p className="eyebrow">{item.category}</p>
            <h1>{item.name}</h1>
            {item.tags.length > 0 && (
              <div className="hero-tags" style={{ marginTop: 14 }}>
                {item.tags.map((tag) => (
                  <span key={tag} className={`tag ${TAG_CLASS[tag] ?? "tag-light"}`}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="detail-facts">
            <div>
              <span>Category</span>
              <strong>{item.category}</strong>
            </div>
            <div>
              <span>Diet</span>
              <strong>{item.is_veg ? "Vegetarian" : "Non-Veg"}</strong>
            </div>
            <div>
              <span>Type</span>
              <strong>{dishType(item.category)}</strong>
            </div>
            <div>
              <span>Price</span>
              <strong>₹{item.price}</strong>
            </div>
          </div>

          {visiblePairings.length > 0 && (
            <div className="pairing-block">
              <div className="section-title inline">
                <div>
                  <p className="eyebrow">Pairs well with</p>
                  <h2>Complete the order elegantly</h2>
                </div>
              </div>
              <div className="compact-grid">
                {visiblePairings.map((p) => (
                  <button
                    key={p.id}
                    className="compact-card"
                    onClick={() => onSelectPairing?.(p)}
                    aria-label={`View ${p.name}`}
                  >
                    <div
                      className="compact-thumb"
                      style={{ background: categoryGradient(p.category) }}
                    />
                    <div className="compact-copy">
                      <strong>{p.name}</strong>
                      <span>₹{p.price}</span>
                    </div>
                    <button
                      className="mini-plus"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPairing?.(p);
                      }}
                      aria-label={`Open ${p.name}`}
                    >
                      +
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="detail-footer">
            <div>
              <p className="eyebrow">Price</p>
              <strong className="price">₹{item.price}</strong>
            </div>
            <button className="primary-btn wide" onClick={onAdd}>
              Add to Order
            </button>
          </div>

          <button
            type="button"
            onClick={onBack}
            aria-label="Go back to menu"
            style={{
              alignSelf: "center",
              marginTop: 4,
              minHeight: 40,
              padding: "0 16px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--muted)",
              background: "transparent",
            }}
          >
            ← Back to menu
          </button>
        </div>
      </div>
    </section>
  );
}
