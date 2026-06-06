import { useMemo, useState, useCallback, type ReactNode } from "react";
import { useMenu } from "@/lib/menuStore";
import DishCard from "@/components/DishCard";
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

// Category → SVG icon (ported from prototype)
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, JSX.Element> = {
    "All Day Breakfast": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 15h16" /><path d="M6 15a6 6 0 1 1 12 0" /><path d="M8 19h8" />
      </svg>
    ),
    "Silver Breakfast": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="9" cy="12" r="4.5" /><path d="M15 7h5v10h-5" />
      </svg>
    ),
    "Smoothie Bowls": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M5 9h14" /><path d="M6 9a6 6 0 0 0 12 0" /><path d="M9 4v3M12 3v4M15 4v3" />
      </svg>
    ),
    "Pancakes": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6 16h12M5 12h14M7 8h10" />
      </svg>
    ),
    "Fries": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7 5h10l-1 14H8L7 5Z" /><path d="M9 5V3M12 5V2.5M15 5V3" />
      </svg>
    ),
    "Sandwiches": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M5 9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4" /><path d="M5 9h14v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z" />
      </svg>
    ),
    "Focaccia": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 15 12 5l8 10Z" /><path d="M8 12h.01M12 10h.01M15 13h.01" />
      </svg>
    ),
    "Burgers": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M5 10a7 7 0 0 1 14 0M4 12h16M6 16h12" />
      </svg>
    ),
    "Pastas": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M5 8h14M6 8a6 6 0 0 0 12 0M9 4c0 1 0 2-1 3M12 4c0 1 0 2-1 3M15 4c0 1 0 2-1 3" />
      </svg>
    ),
    "Hot Coffee": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6 8h9v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8Z" /><path d="M15 9h1.5a2.5 2.5 0 0 1 0 5H15" /><path d="M8 4c0 1-.5 1.5-.5 2.5M11 4c0 1-.5 1.5-.5 2.5" />
      </svg>
    ),
    "Signature Coffee": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7 7h10M8 7v8a4 4 0 0 0 8 0V7M12 3v2M9 19h6" />
      </svg>
    ),
    "Iced Coffee": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 5h8M7 8h10l-1 10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L7 8Z" /><path d="M10 10l1 2M14 10l-1 2" />
      </svg>
    ),
    "Tea & Chocolate": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6 8h8v5a4 4 0 0 1-4 4 4 4 0 0 1-4-4V8Z" /><path d="M14 9h2a2 2 0 0 1 0 4h-2M9 4c0 1-.5 1.5-.5 2.5" />
      </svg>
    ),
    "Desserts": (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6 18h12M8 18v-4a4 4 0 0 1 8 0v4M12 6a2.5 2.5 0 0 1 2.5 2.5c0 1.6-2.5 3.5-2.5 3.5S9.5 10.1 9.5 8.5A2.5 2.5 0 0 1 12 6Z" />
      </svg>
    ),
  };

  const fallback = (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );

  return icons[category] ?? fallback;
}

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
                  onAddToCart={(i) => onAddToCart(i, "main_menu")}
                  onUpdateQuantity={onUpdateQuantity}
                  onSelect={onSelect}
                  onAddPairing={(i) => onAddToCart(i, "pairing_chip")}
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
