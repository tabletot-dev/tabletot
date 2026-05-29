import { useEffect, useState } from "react";
import { useMenu } from "@/lib/menuStore";
import type { AnchorItem } from "@/lib/menuStore";
import { useRestaurant } from "@/lib/restaurantContext";
import { itemImageBackground } from "@/lib/menuImages";

function heroGradient(item: AnchorItem) {
  return itemImageBackground(item);
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
  const { isTreatment } = useRestaurant();
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
    <section className="view home-view home-sun-view">
      <div className="home-command-grid">
        <div className="home-launch-panel">
          <div className="home-hero-block">
            <p className="eyebrow">Good evening{tableId ? `, Table ${tableId}` : ""}</p>
            <div className="home-hero-row">
              <h1 className="home-brand-headline" aria-label="Speak. Order. Served.">
                <span className="headline-speak">Speak.</span>
                <span className="headline-order">Order.</span>
                <span className="headline-served">Served.</span>
              </h1>
              <p className="hero-sub hero-system-copy">
                Discover dishes, place orders instantly, and experience a new way to dine.
                <span>Ordering, reimagined for the modern table.</span>
              </p>
            </div>
          </div>

          <button className="primary-btn home-start-cta" onClick={onStartOrdering}>
            <span>Start Ordering</span>
            <small>Tap to begin</small>
          </button>

          <div className="hero-machine-strip" aria-label="Kiosk status">
            <span>Table OS</span>
            <span>Kitchen Sync</span>
            <span>Voice Ready</span>
          </div>
        </div>

        <div className="home-spotlight-stack">
          {!isTreatment || loading || !heroItem ? (
            <div
              className="hero-feature home-spotlight"
              style={{ background: "linear-gradient(135deg, #f5e6d8, #e8c9a8)" }}
            />
          ) : (
            <button
              className="hero-feature home-spotlight"
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
                  Chef sequence
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

          <div className="home-quick-actions">
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
                Vegetarian options and allergen guidance are available on request.
              </span>
            </button>
            <button
              className="utility-card"
              onClick={() => onInfoToast?.("Please ask the team for the current Wi-Fi network name and password.")}
            >
              <p className="eyebrow">Wi-Fi</p>
              <strong>Stay connected at the table</strong>
              <span>
                Ask the team for today's network and password.
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="utility-layout home-info-layout">
        <div className="panel utility-about-panel">
          <p className="eyebrow">About Us</p>
          <h2>Silver Specialty Coffee</h2>
          <p className="hero-sub">
            Carefully brewed coffee, generous breakfast plates, and a relaxed table-side
            experience.
          </p>
        </div>

        <div className="utility-row utility-row-two">
          <div className="utility-card utility-card-static">
            <p className="eyebrow">Chef's Note</p>
            <strong>Fresh, simple, and made to linger over</strong>
            <span>
              Breakfast and brunch plates designed to pair naturally with specialty coffee.
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
