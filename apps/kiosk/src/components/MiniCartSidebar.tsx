import { motion, AnimatePresence } from "framer-motion";
import type { OrderItem } from "@/data/menu";
import { useMenu } from "@/lib/menuStore";
import { categoryGradient } from "@/lib/categoryGradients";

interface MiniCartSidebarProps {
  order: OrderItem[];
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onGoToCart: () => void;
}

export default function MiniCartSidebar({ order, onUpdateQuantity, onGoToCart }: MiniCartSidebarProps) {
  const { anchors } = useMenu();
  const isEmpty = order.length === 0;
  const total = order.reduce((s, o) => s + o.price * o.quantity, 0);
  const itemCount = order.reduce((s, o) => s + o.quantity, 0);
  const chefPick = anchors.find((a) => a.anchorType === "chef_pick");

  return (
    <aside className="mini-cart">
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
            {chefPick ? (
              <>
                <p className="mini-cart-empty-hint">Nothing added yet</p>
                <div className="mini-pick-card">
                  <div
                    className="mini-pick-thumb"
                    style={{ background: categoryGradient(chefPick.category) }}
                  />
                  <div className="mini-pick-copy">
                    <p className="eyebrow">Chef's Pick</p>
                    <strong>{chefPick.name}</strong>
                    <span>₹{chefPick.price}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="mini-cart-empty-hint">Add items from the menu</p>
            )}
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
                      <span className="mini-cart-row-name">{item.name}</span>
                      <span className="mini-cart-row-price">₹{item.price * item.quantity}</span>
                    </div>
                    <div className="mini-cart-qty">
                      <button
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
              <button className="primary-btn wide" onClick={onGoToCart}>
                Place Order
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
