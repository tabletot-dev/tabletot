import { useMemo, useState, useCallback, type ReactNode } from "react";
import { useMenu } from "@/lib/menuStore";
import DishCard from "@/components/DishCard";
import DietMark from "@/components/DietMark";
import type { MenuItem, OrderItem } from "@/data/menu";
import type { Source } from "@/lib/eventBus";

interface MenuViewProps {
  onSelect: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem, source: Source) => void;
  onUpdateQuantity: (itemId: string, delta: number, source: Source) => void;
  order: OrderItem[];
  voiceDock?: ReactNode;
  voicePanel?: ReactNode;
}

type DietFilter = "all" | "veg" | "nonveg";

export default function MenuView({ onSelect, onAddToCart, onUpdateQuantity, order, voiceDock, voicePanel }: MenuViewProps) {
  const { categories, itemsByCategory, pairingsByItemId, loading, error, retry } = useMenu();
  const [activeCategory, setActiveCategory] = useState("");
  const [diet, setDiet] = useState<DietFilter>("all");

  // If activeCategory is stale after a menu refresh, fall back to the first valid category.
  const resolvedCategory = useMemo(
    () => (activeCategory && categories.includes(activeCategory) ? activeCategory : categories[0] ?? ""),
    [activeCategory, categories],
  );

  const filteredItems = useMemo(() => {
    const base = itemsByCategory[resolvedCategory] ?? [];
    if (diet === "veg") return base.filter((i) => i.is_veg);
    if (diet === "nonveg") return base.filter((i) => !i.is_veg);
    return base;
  }, [itemsByCategory, resolvedCategory, diet]);

  // O(1) quantity lookup instead of O(n) find per card render.
  const qtyMap = useMemo(() => new Map(order.map((o) => [o.id, o.quantity])), [order]);
  const getQty = useCallback((itemId: string) => qtyMap.get(itemId) ?? 0, [qtyMap]);

  const cartTotal = useMemo(() => order.reduce((s, o) => s + o.price * o.quantity, 0), [order]);

  const handleAddToCart = useCallback((i: MenuItem) => onAddToCart(i, "main_menu"), [onAddToCart]);
  const handleAddPairing = useCallback((i: MenuItem) => onAddToCart(i, "pairing_chip"), [onAddToCart]);

  if (loading) {
    return (
      <section className="tt-menu">
        <p className="tt-badge">Loading today's menu…</p>
        <div className="tt-skeleton-list" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tt-skeleton tt-skeleton--card" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="tt-menu tt-menu--centred">
        <h1>We've lost the kitchen for a moment</h1>
        <p>
          Your table's order is safe and the counter can see it. Live status will
          come back on its own — or ask a member of staff.
        </p>
        <button type="button" className="tt-btn--primary" onClick={retry}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="tt-menu">
      {/* Horizontal category bar */}
      <div className="tt-navbar">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`tt-chip${resolvedCategory === cat ? " active" : ""}`}
            onClick={() => setActiveCategory(cat)}
            aria-pressed={resolvedCategory === cat}
          >
            <span>{cat}</span>
          </button>
        ))}
      </div>

      <div className="tt-menu-header">
        <h1>{filteredItems.length} dishes</h1>
        <div className="tt-segmented">
          {(["all", "veg", "nonveg"] as DietFilter[]).map((d) => (
            <button
              key={d}
              className={`tt-segmented-option${diet === d ? " active" : ""}`}
              onClick={() => setDiet(d)}
              aria-pressed={diet === d}
            >
              {d === "veg" && <DietMark isVeg compact />}
              {d === "nonveg" && <DietMark isVeg={false} compact />}
              {d === "all" ? "All" : d === "veg" ? "Veg" : "Non-Veg"}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="tt-empty">
          <h2>Nothing matches that filter</h2>
          <p>Turn the filter off to see everything in {resolvedCategory}.</p>
          <button
            type="button"
            className="tt-btn--secondary"
            onClick={() => setDiet("all")}
          >
            Show all {resolvedCategory}
          </button>
        </div>
      ) : (
        <div className="tt-dish-list">
          {filteredItems.map((item) => (
            <DishCard
              key={item.id}
              item={item}
              qty={getQty(item.id)}
              pairings={pairingsByItemId[item.id] ?? []}
              cartTotal={cartTotal}
              onAddToCart={handleAddToCart}
              onUpdateQuantity={onUpdateQuantity}
              onSelect={onSelect}
              onAddPairing={handleAddPairing}
              getQuantity={getQty}
            />
          ))}
        </div>
      )}

      {voiceDock && <div className="tt-voicedock">{voiceDock}</div>}
      {voicePanel}
    </section>
  );
}
