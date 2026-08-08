import type { OrderItem } from "@/data/menu";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import TabletotLogo from "@/components/TabletotLogo";
import { itemImageBackground } from "@/lib/menuImages";
import { computeTotals } from "@/lib/pricing";

interface CartViewProps {
  order: OrderItem[];
  totalBill: number;
  previousOrders: OrderRound[];
  isSubmitting: boolean;
  onContinue: () => void;
  onConfirm: () => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
}

export default function CartView({
  order,
  totalBill,
  previousOrders,
  isSubmitting,
  onContinue,
  onConfirm,
  onUpdateQuantity,
}: CartViewProps) {
  const { subtotal, tax, total } = computeTotals(totalBill);

  return (
    <section className="tt-cart">
      {isSubmitting && (
        <div className="order-boot-overlay" role="status" aria-live="polite">
          <TabletotLogo className="order-boot-mark" />
        </div>
      )}

      <p className="tt-badge">Current order</p>
      <h1>Review and adjust before sending</h1>

      <div className="tt-cart-list">
        {order.length === 0 ? (
          <div className="tt-empty">Your order is empty. Tap dishes to add them.</div>
        ) : (
          order.map((item) => (
            <div key={item.id} className="tt-cart-row">
              <div
                className="order-thumb"
                style={{ background: itemImageBackground(item) }}
              />
              <div className="order-copy">
                <strong>{item.name}</strong>
                <span>₹{item.price} each</span>
              </div>
              <div className="tt-stepper" aria-label={`${item.name} quantity`}>
                <button
                  onClick={() => onUpdateQuantity(item.id, -1)}
                  aria-label={`Decrease ${item.name}`}
                >
                  −
                </button>
                <span>{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.id, 1)}
                  aria-label={`Increase ${item.name}`}
                >
                  +
                </button>
              </div>
              <strong className="row-total">₹{item.price * item.quantity}</strong>
            </div>
          ))
        )}
      </div>

      {previousOrders.length > 0 && (
        <div className="tt-cart-sent">
          <p className="tt-badge">Already sent</p>
          {previousOrders.map((round, idx) => (
            <div key={idx} className="tt-cart-sent-row">
              <span className="tt-cart-sent-label">Round {idx + 1} · Sent</span>
              <span className="tt-cart-sent-items">
                {round.items.map((i) => i.name).join(", ")}
              </span>
              <strong>₹{round.total.toFixed(0)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="tt-cart-totals">
        <div className="summary-line">
          <span>Subtotal</span>
          <strong>₹{subtotal.toFixed(0)}</strong>
        </div>
        <div className="summary-line">
          <span>GST (5%)</span>
          <strong>₹{tax.toFixed(0)}</strong>
        </div>
        <div className="summary-line total-line">
          <span>Total</span>
          <strong>₹{total.toFixed(0)}</strong>
        </div>
      </div>

      <div className="tt-cart-actions">
        <button
          className="tt-btn--primary"
          onClick={onConfirm}
          disabled={order.length === 0 || isSubmitting}
        >
          {isSubmitting ? "Sending…" : "Send to kitchen"}
        </button>
        <button className="tt-btn--secondary" onClick={onContinue} disabled={isSubmitting}>
          Continue Browsing
        </button>
      </div>
    </section>
  );
}
