import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MenuItem } from "@/data/menu";
import type { OrderItem } from "@/data/menu";
import { useMenu } from "@/lib/menuStore";
import { track, type Source } from "@/lib/eventBus";
import DishCard from "@/components/DishCard";

// NOTE ON NAMING: user-facing label is "Popular". The file keeps the name
// FrequentlyOrderedView for now — the list is CURATED anchor_items sorted by
// priority, NOT order-frequency. Rename to PopularView (and drop this comment)
// when the popularity-ranked version lands over settled orders. See the plan's
// section 4 and NOT-in-scope.

interface FrequentlyOrderedViewProps {
  order: OrderItem[];
  onSelect: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem, source: Source) => void;
  onUpdateQuantity: (itemId: string, delta: number, source: Source) => void;
  onClearItem?: (itemId: string) => void;
  onBack: () => void;
}

export default function FrequentlyOrderedView({
  order,
  onSelect,
  onAddToCart,
  onUpdateQuantity,
  onClearItem,
  onBack,
}: FrequentlyOrderedViewProps) {
  const { anchors, pairingsByItemId } = useMenu();

  // C1: anchors, highest priority first. menuStore already orders them, we
  // re-sort defensively so the screen doesn't depend on fetch order.
  const ranked = useMemo(
    () => [...anchors].sort((a, b) => b.priority - a.priority),
    [anchors],
  );

  const qtyMap = useMemo(() => new Map(order.map((o) => [o.id, o.quantity])), [order]);
  const getQty = useCallback((id: string) => qtyMap.get(id) ?? 0, [qtyMap]);
  const cartTotal = useMemo(
    () => order.reduce((s, o) => s + o.price * o.quantity, 0),
    [order],
  );

  // One recommendation_shown per item per "screen visible" cycle — same
  // discovery-attribution pattern as the inline pairing panel.
  const shownIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    ranked.forEach((item) => {
      if (shownIds.current.has(item.id)) return;
      shownIds.current.add(item.id);
      track("recommendation_shown", { itemId: item.id, surface: "popular" });
    });
  }, [ranked]);

  const handleSelect = useCallback(
    (item: MenuItem) => {
      track("recommendation_tapped", { itemId: item.id, surface: "popular" });
      onSelect(item);
    },
    [onSelect],
  );

  return (
    <section className="tt-menu">
      <div className="tt-menu-header">
        <h1>Popular</h1>
        <button type="button" className="tt-btn--secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {ranked.length === 0 ? (
        <div className="tt-empty">
          <h2>Nothing here yet</h2>
          <p>Ask the team for today's picks.</p>
        </div>
      ) : (
        <div className="tt-dish-list">
          {ranked.map((item) => (
            <DishCard
              key={item.id}
              item={item}
              qty={getQty(item.id)}
              pairings={pairingsByItemId[item.id] ?? []}
              cartTotal={cartTotal}
              onAddToCart={(i) => onAddToCart(i, "main_menu")}
              onUpdateQuantity={onUpdateQuantity}
              onSelect={handleSelect}
              onAddPairing={(i) => onAddToCart(i, "pairing_chip")}
              getQuantity={getQty}
              onClearItem={onClearItem}
            />
          ))}
        </div>
      )}
    </section>
  );
}
