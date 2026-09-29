interface CancelConfirmProps {
  itemCount: number;
  hasCookingRounds: boolean;
  onKeep: () => void;
  onCancel: () => void;
}

export default function CancelConfirm({
  itemCount, hasCookingRounds, onKeep, onCancel,
}: CancelConfirmProps) {
  return (
    <div className="tt-modal-scrim" role="dialog" aria-modal="true" onClick={onKeep}>
      <div className="tt-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cancel this order?</h2>
        <p>
          Your {itemCount} item{itemCount === 1 ? "" : "s"} will be removed.
          {hasCookingRounds && " Your earlier order is already cooking and is not affected."}
        </p>
        <div className="tt-modal-actions">
          <button type="button" className="tt-btn--primary" onClick={onKeep}>
            Keep it
          </button>
          <button type="button" className="tt-btn--secondary" onClick={onCancel}>
            Cancel order
          </button>
        </div>
      </div>
    </div>
  );
}
