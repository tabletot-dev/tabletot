interface OrderBarProps {
  itemCount: number;
  total: number;
  roundNumber: number;
  disabled?: boolean;
  onReview: () => void;
}

// Replaces MiniCartSidebar. The design is a single 800px column, so a right
// rail has nowhere to live — the cart becomes a docked bar above the voice
// dock. flex: none is set in CSS; this component must never grow.
export default function OrderBar({
  itemCount, total, roundNumber, disabled = false, onReview,
}: OrderBarProps) {
  if (itemCount === 0) return null;

  return (
    <div className="tt-orderbar">
      <div className="tt-orderbar-copy">
        <strong>
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </strong>
        <span>₹{total} + GST</span>
      </div>
      <button
        type="button"
        className="tt-btn--primary"
        onClick={onReview}
        disabled={disabled}
      >
        Review order
      </button>
    </div>
  );
}
