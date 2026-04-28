import { OrderRound } from "@/hooks/useDeviceNavigation";

interface BillSummaryScreenProps {
  previousOrders: OrderRound[];
  sessionTotal: number;
  onClose: () => void;
}

const BillSummaryScreen = ({ previousOrders, sessionTotal, onClose }: BillSummaryScreenProps) => {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-display text-sm tracking-[0.2em] uppercase text-foreground">
          Your Bill
        </span>
        <span className="text-xs text-muted-foreground">
          {previousOrders.length} {previousOrders.length === 1 ? "order" : "orders"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {previousOrders.map((round, idx) => (
          <div key={idx}>
            <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
              <span className="font-display text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                Order #{idx + 1}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {round.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {round.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-10 h-10 object-cover border border-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-display text-xs font-semibold text-foreground truncate">
                    {item.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    ${item.price.toFixed(2)} × {item.quantity}
                  </p>
                </div>
                <span className="text-xs font-display font-semibold text-foreground">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-display">
                Subtotal
              </span>
              <span className="text-xs font-display font-bold text-foreground">
                ${round.total.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="px-4 py-4 border-t border-border flex items-center justify-between">
        <span className="font-display text-xs tracking-[0.2em] uppercase text-muted-foreground">
          Total
        </span>
        <span className="font-display text-2xl font-bold text-primary">
          ${sessionTotal.toFixed(2)}
        </span>
      </div>

      {/* Actions */}
      <div className="p-4 flex flex-col gap-2 border-t border-border">
        <button
          onClick={onClose}
          className="w-full py-4 bg-primary text-primary-foreground font-display text-sm font-semibold tracking-widest uppercase cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Request Server
        </button>
        <p className="text-[10px] text-center text-muted-foreground tracking-wider">
          A server will come to your table to process payment
        </p>
      </div>
    </div>
  );
};

export default BillSummaryScreen;
