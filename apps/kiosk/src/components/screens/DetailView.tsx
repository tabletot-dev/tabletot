import { useMenu } from "@/lib/menuStore";
import type { MenuItem } from "@/data/menu";
import { categoryGradient } from "@/lib/categoryGradients";

interface DetailViewProps {
  item: MenuItem;
  onAdd: () => void;
  onBack: () => void;
  onSelectPairing?: (item: MenuItem) => void;
}

export default function DetailView({ item, onAdd, onBack, onSelectPairing }: DetailViewProps) {
  const { pairingsByItemId } = useMenu();
  const pairings = pairingsByItemId[item.id] ?? [];
  const bg = categoryGradient(item.category);

  return (
    <section className="view detail-view">
      <div className="detail-layout">
        {/* Left: photo panel — gradient placeholder */}
        {/* TODO: replace with background-image once image_url column is added to menu_items */}
        <div className="detail-photo" style={{ background: bg }} />

        {/* Right: detail panel */}
        <div className="detail-panel" style={{ padding: 28, gap: 20, display: "flex", flexDirection: "column" }}>
          <div>
            <p className="eyebrow">{item.category}</p>
            <h1 style={{ marginTop: 8 }}>{item.name}</h1>
          </div>

          {/* Facts grid */}
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
              <span>Price</span>
              <strong>₹{item.price}</strong>
            </div>
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="detail-chips">
              {item.tags.map((tag) => (
                <span key={tag} className="tag tag-light">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Pairings */}
          {pairings.length > 0 && (
            <div>
              <p className="eyebrow" style={{ marginBottom: 12 }}>Pairs well with</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pairings.slice(0, 2).map((p) => (
                  <button
                    key={p.id}
                    className="compact-card pairing-nav-card"
                    onClick={() => onSelectPairing?.(p)}
                    aria-label={`View ${p.name}`}
                  >
                    <div
                      className="compact-thumb"
                      style={{
                        background: categoryGradient(p.category),
                        height: 64,
                        borderRadius: 12,
                      }}
                    />
                    <div className="compact-copy">
                      <strong>{p.name}</strong>
                      <span style={{ color: "var(--muted)", fontSize: 14 }}>₹{p.price}</span>
                    </div>
                    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" stroke="var(--soft)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 4l6 6-6 6" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "auto" }}>
            <button className="primary-btn" style={{ width: "100%" }} onClick={onAdd}>
              Add to Order
            </button>
            <button
              className="back-link"
              onClick={onBack}
              aria-label="Go back to menu"
            >
              ← Back to menu
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
