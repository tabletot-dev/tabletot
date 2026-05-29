import { motion, AnimatePresence } from "framer-motion";
import type { MenuItem, OrderItem } from "@/data/menu";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import { useMenu } from "@/lib/menuStore";
import { useRestaurant } from "@/lib/restaurantContext";
import { itemImageBackground } from "@/lib/menuImages";
import DietMark from "@/components/DietMark";

interface MiniCartSidebarProps {
  order: OrderItem[];
  previousOrders?: OrderRound[];
  onAddToCart: (item: MenuItem) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onSelect: (item: MenuItem) => void;
  onGoToCart: () => void;
}

const ANCHOR_LABELS = {
  chef_pick: "Chef's Pick",
  bestseller: "Best Seller",
  signature: "Signature",
  new: "New",
} as const;

export default function MiniCartSidebar({
  order,
  previousOrders = [],
  onAddToCart,
  onUpdateQuantity,
  onSelect,
  onGoToCart,
}: MiniCartSidebarProps) {
  const { anchors } = useMenu();
  const { isTreatment } = useRestaurant();
  const isEmpty = order.length === 0;
  const total = order.reduce((s, o) => s + o.price * o.quantity, 0);
  const itemCount = order.reduce((s, o) => s + o.quantity, 0);
  const qtyById = new Map(order.map((item) => [item.id, item.quantity]));
  const sentItems = previousOrders.flatMap((round, roundIdx) =>
    round.items.map((item) => ({ ...item, roundNumber: roundIdx + 1 })),
  );
  const signalItems = anchors
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 4);

  return (
    <aside className="order-rail">
      <section className="mini-cart">
        <div className="mini-cart-header">
          <p className="eyebrow">Your Order</p>
          <AnimatePresence>
            {!isEmpty && (
              <motion.span
                className="mini-cart-count"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18 }}
              >
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {isEmpty ? (
            <motion.div
              key="empty"
              className="mini-cart-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <p className="mini-cart-empty-hint">Nothing added yet</p>
            </motion.div>
          ) : (
            <motion.div
              key="filled"
              className="mini-cart-filled"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="mini-cart-list">
                <AnimatePresence initial={false}>
                  {order.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="mini-cart-row"
                    >
                      <div className="mini-cart-row-info">
                        <span className="mini-cart-row-name">
                          <DietMark isVeg={item.is_veg} compact />
                          {item.name}
                        </span>
                        <span className="mini-cart-row-price">₹{item.price * item.quantity}</span>
                      </div>
                      <div className="mini-cart-qty">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => onUpdateQuantity(item.id, -1)}
                          aria-label={`Decrease ${item.name}`}
                        >
                          −
                        </button>
                        <motion.span
                          key={item.quantity}
                          initial={{ scale: 1.3 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 20 }}
                          className="qty-val"
                        >
                          {item.quantity}
                        </motion.span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => onUpdateQuantity(item.id, +1)}
                          aria-label={`Increase ${item.name}`}
                        >
                          +
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="mini-cart-footer">
                <div className="mini-cart-total">
                  <span>Total</span>
                  <motion.strong
                    key={total}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  >
                    ₹{total}
                  </motion.strong>
                </div>
                <button type="button" className="primary-btn wide" onClick={onGoToCart}>
                  Place Order
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {sentItems.length > 0 && (
          <div className="mini-sent-orders" aria-label="Already ordered items">
            <div className="mini-sent-header">
              <p className="eyebrow">Already Ordered</p>
              <span>{sentItems.length}</span>
            </div>
            <div className="mini-sent-list">
              {sentItems.slice(0, 4).map((item) => (
                <div key={`${item.roundNumber}-${item.id}`} className="mini-sent-row">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <strong>₹{item.price * item.quantity}</strong>
                </div>
              ))}
              {sentItems.length > 4 && (
                <div className="mini-sent-row muted">
                  <span>More items sent</span>
                  <strong>+{sentItems.length - 4}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {isTreatment && signalItems.length > 0 && (
        <section className="order-signals">
          <div className="order-signals-header">
            <p className="eyebrow">House Specials</p>
            <span>Curated</span>
          </div>
          <div className="order-signal-list">
            {signalItems.map((item) => {
              const qty = qtyById.get(item.id) ?? 0;

              return (
                <article key={`${item.anchorType}-${item.id}`} className="order-signal-card">
                  <button
                    type="button"
                    className="order-signal-thumb"
                    style={{ background: itemImageBackground(item) }}
                    onClick={() => onSelect(item)}
                    aria-label={`View ${item.name}`}
                  />
                  <div className="order-signal-copy">
                    <span>{ANCHOR_LABELS[item.anchorType]}</span>
                    <strong>
                      <DietMark isVeg={item.is_veg} compact />
                      {item.name}
                    </strong>
                    <small>₹{item.price}</small>
                  </div>
                  {qty > 0 ? (
                    <div className="order-signal-stepper" aria-label={`${item.name} quantity`}>
                      <button type="button" onClick={() => onUpdateQuantity(item.id, -1)} aria-label={`Decrease ${item.name}`}>
                        −
                      </button>
                      <span>{qty}</span>
                      <button type="button" onClick={() => onUpdateQuantity(item.id, 1)} aria-label={`Increase ${item.name}`}>
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="order-signal-add"
                      onClick={() => onAddToCart(item)}
                      aria-label={`Add ${item.name}`}
                    >
                      Add
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}
