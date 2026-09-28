import type { MenuItem } from "@/data/menu";

interface DetailFooterProps {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onUpdateQuantity?: (itemId: string, delta: number) => void;
}

// Rendered through AppShell's orderBar slot (docked, outside the scroll
// region) rather than inside DetailView's own scrolling content. It used to
// live there as a `position: sticky` element, which doesn't reserve space
// in the flow — it just floats over whatever content is currently scrolled
// underneath it, so it was permanently covering the mic-dock chips and
// button on any dish with enough facts to make the page taller than one
// screen (2026-09-29 UX audit, found by scroll-testing after the Details
// section was added). Every other screen's bottom bar (OrderBar, StatusStrip,
// the voice dock) already uses this same docked mechanism — this just
// brings DetailView in line with it.
export default function DetailFooter({ item, quantity, onAdd, onUpdateQuantity }: DetailFooterProps) {
  return (
    <div className="tt-detail-footer">
      <div>
        <p className="eyebrow">Item price</p>
        <strong className="tt-detail-price">₹{item.price}</strong>
      </div>
      {quantity > 0 ? (
        <div className="tt-stepper" aria-label={`${item.name} quantity`}>
          <button
            type="button"
            className={quantity === 1 ? "tt-stepper-minus--floor" : undefined}
            onClick={() => onUpdateQuantity?.(item.id, -1)}
            aria-label={`Decrease ${item.name}`}
          >
            −
          </button>
          <span>{quantity}</span>
          <button type="button" onClick={() => onUpdateQuantity?.(item.id, 1)} aria-label={`Increase ${item.name}`}>
            +
          </button>
        </div>
      ) : (
        <button type="button" className="tt-btn--primary" onClick={onAdd}>
          Add to Order
        </button>
      )}
    </div>
  );
}
