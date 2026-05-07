import { useEffect, useState } from "react";
import { useMenu } from "@/lib/menuStore";
import type { AnchorItem } from "@/lib/menuStore";
import { categoryGradient } from "@/lib/categoryGradients";

function heroGradient(item: AnchorItem) {
  return categoryGradient(item.category);
}

const TAG_CLASS: Record<string, string> = {
  "Chef's Pick": "tag-dark",
  "Best Seller": "tag-accent",
  "Signature": "tag-light",
  "New": "tag-green",
};

interface HomeViewProps {
  onStartOrdering: () => void;
  onSelectItem?: (item: AnchorItem) => void;
}

export default function HomeView({ onStartOrdering, onSelectItem }: HomeViewProps) {
  const { anchors, loading } = useMenu();
  const [heroIndex, setHeroIndex] = useState(0);

  const chefPicks = anchors.filter((a) => a.anchorType === "chef_pick");
  const heroItem = chefPicks[heroIndex % Math.max(chefPicks.length, 1)];

  useEffect(() => {
    if (chefPicks.length <= 1) return;
    const id = setInterval(() => {
      setHeroIndex((i) => (i + 1) % chefPicks.length);
    }, 2000);
    return () => clearInterval(id);
  }, [chefPicks.length]);

  return (
    <section className="view home-view">
      <div className="hero-panel">
        {/* Left: copy + CTA */}
        <div className="hero-copy">
          <p className="eyebrow">Welcome</p>
          <h1>Order beautifully. Without waiting.</h1>
          <p className="hero-sub">
            Browse our full menu, add items to your cart, and we'll bring it to you.
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={onStartOrdering}>
              Start Ordering
            </button>
          </div>
        </div>

        {/* Right: rotating hero feature card */}
        {loading || !heroItem ? (
          <div
            style={{
              borderRadius: "var(--radius-xl)",
              background: "linear-gradient(135deg, #f5e6d8, #e8c9a8)",
              minHeight: 320,
            }}
          />
        ) : (
          <button
            className="hero-feature"
            style={{ background: heroGradient(heroItem), minHeight: 320 }}
            onClick={() => onSelectItem?.(heroItem)}
            aria-label={`View ${heroItem.name}`}
          >
            <div className="feature-overlay">
              {heroItem.tags.length > 0 && (
                <div className="hero-tags">
                  {heroItem.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className={`tag ${TAG_CLASS[tag] ?? "tag-light"}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="feature-kicker" style={{ marginTop: "auto" }}>
                Tonight's highlight
              </p>
              <h2>{heroItem.name}</h2>
              <div className="feature-footer">
                <strong>₹{heroItem.price}</strong>
                <span className="ghost-pill">View Dish</span>
              </div>
              {chefPicks.length > 1 && (
                <div className="hero-dots">
                  {chefPicks.map((_, i) => (
                    <span
                      key={i}
                      className={`hero-dot${i === heroIndex % chefPicks.length ? " active" : ""}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Utility section */}
      <div className="utility-layout">
        <div className="utility-row utility-row-two">
          <div className="utility-card utility-card-static">
            <p className="eyebrow">Dietary Information</p>
            <strong>Prepared for every preference</strong>
            <span>
              Vegetarian-friendly dishes, egg-based breakfast options, and support for allergen
              questions are available on request.
            </span>
          </div>
          <div className="utility-card utility-card-static">
            <p className="eyebrow">Wi-Fi</p>
            <strong>Stay connected at the table</strong>
            <span>Ask the team for today's network and password.</span>
          </div>
        </div>

        <div className="panel utility-about-panel" style={{ padding: 28 }}>
          <p className="eyebrow">About Us</p>
          <h2 style={{ marginTop: 8, marginBottom: 12 }}>Silver Specialty Coffee</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 16 }}>
            Silver Specialty Coffee is a bright all-day café built around carefully brewed coffee,
            generous breakfast plates, sweet comforts, and a relaxed table-side experience. The
            space is designed for slow mornings, casual meetings, and easy catch-ups.
          </p>
        </div>

        <div className="utility-row utility-row-two">
          <div className="utility-card utility-card-static">
            <p className="eyebrow">Chef's Note</p>
            <strong>Fresh, simple, and made to linger over</strong>
            <span>
              Our kitchen focuses on approachable breakfast and brunch plates with clean flavors and
              seasonal touches.
            </span>
          </div>
          <div className="utility-card utility-card-static">
            <p className="eyebrow">Hours</p>
            <strong>Open daily</strong>
            <span>Monday to Thursday: 8:00 AM – 10:00 PM</span>
            <span>Friday to Sunday: 8:00 AM – 11:00 PM</span>
          </div>
        </div>
      </div>
    </section>
  );
}
