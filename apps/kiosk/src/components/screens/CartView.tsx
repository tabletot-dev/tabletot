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
  const itemCount = order.reduce((s, o) => s + o.quantity, 0);

  return (
    <section className="view cart-view">
      {isSubmitting && (
        <div className="order-boot-overlay" role="status" aria-live="polite">
          <TabletotLogo className="order-boot-mark" />
        </div>
      )}
      <div className="split-layout">
        {/* Left: order list */}
        <div className="panel scroll-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Current order</p>
              <h2>Review and adjust before sending</h2>
            </div>
          </div>

          <div className="order-list">
            {order.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 0", textAlign: "center" }}>
                Your order is empty. Tap dishes to add them.
              </div>
            ) : (
              order.map((item) => (
                <div key={item.id} className="order-row">
                  <div
                    className="order-thumb"
                    style={{ background: itemImageBackground(item) }}
                  />
                  <div className="order-copy">
                    <strong>{item.name}</strong>
                    <span>₹{item.price} each</span>
                  </div>
                  <div className="stepper" aria-label={`${item.name} quantity`}>
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

            {previousOrders.length > 0 && (
              <div className="previous-orders">
                <p className="eyebrow">Already sent</p>
                {previousOrders.map((round, idx) => (
                  <div key={idx} className="previous-round">
                    <span className="previous-round-label">Round {idx + 1}</span>
                    <span className="previous-round-items">
                      {round.items.map((i) => i.name).join(", ")}
                    </span>
                    <strong>₹{round.total.toFixed(0)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="panel summary-panel">
          <p className="eyebrow">Order summary</p>
          <h2>
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </h2>
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
          <p className="summary-note">
            Breakfast plates, coffees, and desserts can all be added together for a smooth cafe
            order flow.
          </p>
          <button
            className="primary-btn wide confirm-order-btn"
            onClick={onConfirm}
            disabled={order.length === 0 || isSubmitting}
            style={{ opacity: order.length === 0 || isSubmitting ? 0.45 : 1 }}
          >
            {isSubmitting ? "Sending…" : "Confirm Order"}
          </button>
          <button className="secondary-btn wide" onClick={onContinue} disabled={isSubmitting}>
            Continue Browsing
          </button>
        </aside>
      </div>
    </section>
  );
}
