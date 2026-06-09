import { useMemo, useState, useCallback, type ReactNode } from "react";
import { useMenu } from "@/lib/menuStore";
import DishCard from "@/components/DishCard";
import CategoryIcon from "@/components/CategoryIcon";
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
      <div className="view menu-view" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ width: 32, height: 32, border: "3px solid var(--brand)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p>Loading menu…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view menu-view" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
          <p style={{ color: "var(--text)", fontWeight: 700, marginBottom: 8 }}>Menu unavailable</p>
          <p style={{ marginBottom: 20 }}>Please ask staff for assistance</p>
          <button className="secondary-btn" onClick={retry}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <section className="view menu-view">
      {/* Horizontal category bar */}
      <div className="menu-cat-bar">
        <div className="menu-cat-scroll">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`menu-cat-pill${resolvedCategory === cat ? " active" : ""}`}
              onClick={() => setActiveCategory(cat)}
              aria-pressed={resolvedCategory === cat}
            >
              <span className="menu-cat-pill-icon">
                <CategoryIcon category={cat} />
              </span>
              <span>{cat}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable canvas */}
      <div className={`menu-canvas${voiceDock ? " has-voice-dock" : ""}`}>
        <div className="menu-canvas-header">
          <div>
            <p className="eyebrow">Now browsing</p>
            <h1>{resolvedCategory}</h1>
          </div>
          <div className="menu-toolbar-inline">
            <div className="diet-row">
              {(["all", "veg", "nonveg"] as DietFilter[]).map((d) => (
                <button
                  key={d}
                  className={`diet-pill${diet === d ? " active" : ""}`}
                  onClick={() => setDiet(d)}
                  aria-pressed={diet === d}
                >
                  {d === "all" ? "All" : d === "veg" ? "Veg" : "Non-Veg"}
                </button>
              ))}
            </div>
            <span className="menu-item-count">{filteredItems.length} items</span>
          </div>
        </div>

        <div className="menu-product-scaffold">
          <div className="menu-product-grid">
            {filteredItems.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: "1 / -1", padding: "32px", color: "var(--muted)", textAlign: "center" }}>
                No dishes match that filter.
              </div>
            ) : (
              filteredItems.map((item) => (
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
              ))
            )}
          </div>
        </div>
        {voiceDock && (
          <div className="menu-voice-section">
            {voiceDock}
          </div>
        )}
        {voicePanel}
      </div>
    </section>
  );
}
