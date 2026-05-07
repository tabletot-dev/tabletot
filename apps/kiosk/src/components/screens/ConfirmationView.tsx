import { useEffect } from "react";

interface ConfirmationViewProps {
  onReset: () => void;
}

export default function ConfirmationView({ onReset }: ConfirmationViewProps) {
  useEffect(() => {
    const id = setTimeout(onReset, 5000);
    return () => clearTimeout(id);
  }, [onReset]);

  return (
    <section className="view confirmation-view">
      <div className="confirmation-panel">
        <div className="success-mark">
          <svg viewBox="0 0 52 52" fill="none" aria-hidden="true" width="64" height="64">
            <polyline points="12,28 22,38 40,18" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="eyebrow">Order confirmed</p>
        <h1>Order sent to the kitchen.</h1>
        <p className="hero-sub">
          Your order has been placed successfully. This screen will switch to your table display
          in a moment.
        </p>
        <div className="confirmation-actions">
          <button className="primary-btn" onClick={onReset}>
            Go to Table Screen
          </button>
        </div>
      </div>
    </section>
  );
}
