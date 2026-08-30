import { useState } from "react";
import type { OrderItem } from "@/data/menu";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import TabletotLogo from "@/components/TabletotLogo";
import { itemImageBackground } from "@/lib/menuImages";
import Stepper from "@/components/Stepper";
import { computeTotals } from "@/lib/pricing";
import { useRestaurant } from "@/lib/restaurantContext";
import { formatRupees } from "@/lib/formatCurrency";

const MAX_NAME_LENGTH = 24;

interface CartViewProps {
  order: OrderItem[];
  totalBill: number;
  previousOrders: OrderRound[];
  isSubmitting: boolean;
  showNameField?: boolean;
  onContinue: () => void;
  onConfirm: (displayName?: string) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  /** Clears the line in one (confirmed) tap; shown only at qty >= 2. */
  onClearItem?: (itemId: string) => void;
}

export default function CartView({
  order,
  totalBill,
  previousOrders,
  isSubmitting,
  showNameField = false,
  onContinue,
  onConfirm,
  onUpdateQuantity,
  onClearItem,
}: CartViewProps) {
  const { gstRatePercent } = useRestaurant();
  const { subtotal, tax, total } = computeTotals(totalBill, gstRatePercent);
  const [displayName, setDisplayName] = useState("");

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
              <Stepper
                qty={item.quantity}
                label={item.name}
                onDec={() => onUpdateQuantity(item.id, -1)}
                onInc={() => onUpdateQuantity(item.id, 1)}
                onClear={onClearItem ? () => onClearItem(item.id) : undefined}
              />
              <strong className="row-total">{formatRupees(item.price * item.quantity)}</strong>
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
              <strong>{formatRupees(round.total)}</strong>
            </div>
          ))}
        </div>
      )}

      {showNameField && (
        <label className="tt-cart-name-field">
          <span className="tt-badge">Name for this order</span>
          <input
            className="tt-field"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
            maxLength={MAX_NAME_LENGTH}
            aria-label="Name for this order"
          />
        </label>
      )}

      <div className="tt-cart-totals">
        <div className="summary-line">
          <span>Subtotal</span>
          <strong>{formatRupees(subtotal)}</strong>
        </div>
        <div className="summary-line">
          <span>GST ({gstRatePercent}%)</span>
          <strong>{formatRupees(tax)}</strong>
        </div>
        <div className="summary-line total-line">
          <span>Total</span>
          <strong>{formatRupees(total)}</strong>
        </div>
      </div>

      <div className="tt-cart-actions">
        <button
          className="tt-btn--primary"
          onClick={() => onConfirm(showNameField ? displayName.trim() || undefined : undefined)}
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
