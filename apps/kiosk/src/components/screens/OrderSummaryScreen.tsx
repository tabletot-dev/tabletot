import { OrderItem } from "@/data/menu";
import { OrderRound } from "@/hooks/useDeviceNavigation";

interface OrderSummaryScreenProps {
  order: OrderItem[];
  totalBill: number;
  previousOrders: OrderRound[];
  sessionTotal: number;
  onContinue: () => void;
  onConfirm: () => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
}

const OrderSummaryScreen = ({
  order,
  totalBill,
  previousOrders,
  sessionTotal,
  onContinue,
  onConfirm,
  onUpdateQuantity,
  onRemoveItem,
}: OrderSummaryScreenProps) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-display text-sm tracking-[0.2em] uppercase text-foreground">
          Your Order
        </span>
        <span className="text-xs text-muted-foreground">
          {order.length} new {order.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Current order items */}
        {order.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-primary/5 border-b border-border">
              <span className="font-display text-[10px] tracking-[0.2em] uppercase text-primary font-semibold">
                Current Order
              </span>
            </div>
            {order.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-semibold text-foreground truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${item.price.toFixed(2)} each
                  </p>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-0">
                  <button
                    onClick={() => onUpdateQuantity(item.id, -1)}
                    className="w-9 h-9 flex items-center justify-center border border-border text-foreground cursor-pointer hover:bg-muted active:bg-primary/10 text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="w-9 h-9 flex items-center justify-center border-y border-border font-display text-sm font-bold text-foreground">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, 1)}
                    className="w-9 h-9 flex items-center justify-center border border-border text-foreground cursor-pointer hover:bg-muted active:bg-primary/10 text-lg font-bold"
                  >
                    +
                  </button>
                </div>

                {/* Remove */}
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-primary cursor-pointer active:bg-muted"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {order.length === 0 && previousOrders.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Your cart is empty
          </div>
        )}

        {order.length === 0 && previousOrders.length > 0 && (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            No new items — add more from the menu
          </div>
        )}

        {/* Previous orders */}
        {previousOrders.map((round, idx) => (
          <div key={idx}>
            <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
              <span className="font-display text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                Order #{idx + 1} · Sent to Kitchen
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                ${round.total.toFixed(2)}
              </span>
            </div>
            {round.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-display text-xs font-semibold text-foreground truncate">
                    {item.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    ${item.price.toFixed(2)} × {item.quantity}
                  </p>
                </div>
                <span className="text-xs font-display text-muted-foreground">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="px-4 py-3 border-t border-border">
        {order.length > 0 && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-display">
              This order
            </span>
            <span className="font-display text-sm font-bold text-foreground">
              ${totalBill.toFixed(2)}
            </span>
          </div>
        )}
        {previousOrders.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-display">
              Session Total
            </span>
            <span className="font-display text-xl font-bold text-primary">
              ${sessionTotal.toFixed(2)}
            </span>
          </div>
        )}
        {previousOrders.length === 0 && (
          <div className="flex items-center justify-between">
            <span className="font-display text-xs tracking-[0.2em] uppercase text-muted-foreground">
              Total
            </span>
            <span className="font-display text-xl font-bold text-primary">
              ${totalBill.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-4 flex flex-col gap-2 border-t border-border">
        <button
          onClick={onContinue}
          className="w-full py-3.5 font-display text-sm font-semibold tracking-widest uppercase cursor-pointer transition-all bg-muted text-foreground border border-border hover:border-primary/50 active:bg-primary/10"
        >
          Continue Ordering
        </button>
        <button
          onClick={onConfirm}
          disabled={order.length === 0}
          className="w-full py-3.5 font-display text-sm font-semibold tracking-widest uppercase cursor-pointer transition-all bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm Order
        </button>
      </div>
    </div>
  );
};

export default OrderSummaryScreen;
