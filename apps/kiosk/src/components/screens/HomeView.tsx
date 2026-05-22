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
  onInfoToast?: (message: string) => void;
  tableId?: string;
}

export default function HomeView({
  onStartOrdering,
  onSelectItem,
  onInfoToast,
  tableId,
}: HomeViewProps) {
  const { anchors, loading } = useMenu();
  const [heroIndex, setHeroIndex] = useState(0);

  const chefPicks = anchors.filter((a) => a.anchorType === "chef_pick");
  const heroItem = chefPicks[heroIndex % Math.max(chefPicks.length, 1)];

  useEffect(() => {
    if (chefPicks.length <= 1) return;
    const id = setInterval(() => {
      setHeroIndex((i) => (i + 1) % chefPicks.length);
    }, 4000);
    return () => clearInterval(id);
  }, [chefPicks.length]);

  return (
    <section className="view home-view">
      <div className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Good evening{tableId ? `, Table ${tableId}` : ""}</p>
          <h1>Order beautifully. Without waiting.</h1>
          <div className="hero-actions">
            <button className="primary-btn" onClick={onStartOrdering}>
              Start Ordering
            </button>
          </div>
        </div>

        {loading || !heroItem ? (
          <div
            className="hero-feature"
            style={{ background: "linear-gradient(135deg, #f5e6d8, #e8c9a8)" }}
          />
        ) : (
          <button
            className="hero-feature"
            style={{ background: heroGradient(heroItem) }}
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

      <div className="utility-layout">
        <div className="utility-row utility-row-two">
          <button
            className="utility-card"
            onClick={() =>
              onInfoToast?.(
                "Please ask the team for allergen guidance, vegetarian recommendations, and ingredient details before confirming your order.",
              )
            }
          >
            <p className="eyebrow">Dietary Information</p>
            <strong>Prepared for every preference</strong>
            <span>
              Vegetarian-friendly dishes, egg-based breakfast options, and support for allergen
              questions are available on request.
            </span>
          </button>
          <button
            className="utility-card"
            onClick={() => onInfoToast?.("Please ask the team for the current Wi-Fi network name and password.")}
          >
            <p className="eyebrow">Wi-Fi</p>
            <strong>Stay connected at the table</strong>
            <span>
              Ask the team for today's network and password if you'd like to work, browse, or stay
              online while you dine.
            </span>
          </button>
        </div>

        <div className="panel utility-about-panel">
          <p className="eyebrow">About Us</p>
          <h2>Silver Specialty Coffee</h2>
          <p className="hero-sub">
            Silver Specialty Coffee is a bright all-day cafe built around carefully brewed coffee,
            generous breakfast plates, sweet comforts, and a relaxed table-side experience. The
            space is designed for slow mornings, casual meetings, and easy catch-ups, with a menu
            that balances comfort classics and signature house favorites.
          </p>
        </div>

        <div className="utility-row utility-row-two">
          <div className="utility-card utility-card-static">
            <p className="eyebrow">Chef's Note</p>
            <strong>Fresh, simple, and made to linger over</strong>
            <span>
              Our kitchen focuses on approachable breakfast and brunch plates with clean flavors,
              seasonal touches, and dishes that pair naturally with specialty coffee.
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
