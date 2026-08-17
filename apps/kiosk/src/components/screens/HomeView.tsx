import { useEffect, useState } from "react";
import { useMenu } from "@/lib/menuStore";
import type { AnchorItem } from "@/lib/menuStore";
import { useRestaurant } from "@/lib/restaurantContext";
import { itemImageBackground } from "@/lib/menuImages";

function heroGradient(item: AnchorItem) {
  return itemImageBackground(item);
}

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
  const { venueName } = useRestaurant();
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
    <section className="tt-home">
      <p className="tt-badge">Good evening{tableId ? `, Table ${tableId}` : ""}</p>
      <h1>Speak. Order. Served.</h1>
      <p className="tt-home-sub">
        Discover dishes, place orders instantly, and experience a new way to dine.
      </p>

      <button className="tt-btn--primary tt-home-cta" onClick={onStartOrdering}>
        Start Ordering
      </button>

      {loading || !heroItem ? (
        <div className="tt-home-spotlight" style={{ background: "var(--tt-skeleton-2)" }} />
      ) : (
        <button
          className="tt-home-spotlight"
          style={{ background: heroGradient(heroItem) }}
          onClick={() => onSelectItem?.(heroItem)}
          aria-label={`View ${heroItem.name}`}
        >
          <div className="tt-home-spotlight-overlay">
            {heroItem.tags.length > 0 && (
              <span className="tt-badge tt-home-spotlight-badge">{heroItem.tags[0]}</span>
            )}
            <div className="tt-home-spotlight-footer">
              <div>
                <p className="tt-home-spotlight-kicker">Chef sequence</p>
                <strong>{heroItem.name}</strong>
              </div>
              <span className="tt-home-spotlight-price">₹{heroItem.price}</span>
            </div>
            {chefPicks.length > 1 && (
              <div className="tt-home-dots">
                {chefPicks.map((_, i) => (
                  <span
                    key={i}
                    className={`tt-home-dot${i === heroIndex % chefPicks.length ? " active" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        </button>
      )}

      <div className="tt-home-info-grid">
        <button
          type="button"
          className="tt-home-info-card"
          onClick={() =>
            onInfoToast?.(
              "Please ask the team for allergen guidance, vegetarian recommendations, and ingredient details before confirming your order.",
            )
          }
        >
          <p className="tt-badge">Dietary Information</p>
          <strong>Prepared for every preference</strong>
          <span>Vegetarian options and allergen guidance are available on request.</span>
        </button>
        <button
          type="button"
          className="tt-home-info-card"
          onClick={() => onInfoToast?.("Please ask the team for the current Wi-Fi network name and password.")}
        >
          <p className="tt-badge">Wi-Fi</p>
          <strong>Stay connected at the table</strong>
          <span>Ask the team for today's network and password.</span>
        </button>
      </div>

      <div className="tt-home-about">
        <p className="tt-badge">About Us</p>
        <h2>{venueName || "Our restaurant"}</h2>
        <p>Carefully brewed coffee, generous breakfast plates, and a relaxed table-side experience.</p>
      </div>

      <div className="tt-home-info-grid">
        <div className="tt-home-info-card tt-home-info-card--static">
          <p className="tt-badge">Chef's Note</p>
          <strong>Fresh, simple, and made to linger over</strong>
          <span>Breakfast and brunch plates designed to pair naturally with specialty coffee.</span>
        </div>
        <div className="tt-home-info-card tt-home-info-card--static">
          <p className="tt-badge">Hours</p>
          <strong>Open daily</strong>
          <span>Monday to Thursday: 8:00 AM – 10:00 PM</span>
          <span>Friday to Sunday: 8:00 AM – 11:00 PM</span>
        </div>
      </div>
    </section>
  );
}
