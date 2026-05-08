import { useEffect } from "react";

interface ConfirmationViewProps {
  onReset: () => void;
  onOrderMore?: () => void;
}

export default function ConfirmationView({ onReset, onOrderMore }: ConfirmationViewProps) {
  useEffect(() => {
    const id = setTimeout(onReset, 5000);
    return () => clearTimeout(id);
  }, [onReset]);

  return (
    <section className="view confirmation-view">
      <div className="confirmation-panel">
        <div className="success-mark">✓</div>
        <p className="eyebrow">Order confirmed</p>
        <h1>Order sent to the kitchen.</h1>
        <p className="hero-sub">
          Your order has been placed successfully. This screen will switch to your table display in
          5 seconds.
        </p>
        <div className="confirmation-actions">
          <button className="primary-btn" onClick={onReset}>
            Go to Table Screen
          </button>
          {onOrderMore && (
            <button className="secondary-btn" onClick={onOrderMore}>
              Order More
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
