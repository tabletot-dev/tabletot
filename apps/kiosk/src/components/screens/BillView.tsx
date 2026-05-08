import type { OrderRound } from "@/hooks/useDeviceNavigation";

const TAX_RATE = 0.05;

interface BillViewProps {
  previousOrders: OrderRound[];
  sessionTotal: number;
  onClose: () => void;
  onContinueOrdering?: () => void;
}

export default function BillView({
  previousOrders,
  sessionTotal,
  onClose,
  onContinueOrdering,
}: BillViewProps) {
  const subtotal = sessionTotal;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  return (
    <section className="view bill-view">
      <div className="split-layout">
        <div className="panel scroll-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Itemized bill</p>
              <h2>Review before asking to settle</h2>
            </div>
          </div>

          <div className="bill-list">
            {previousOrders.length === 0 ? (
              <div className="empty-state" style={{ textAlign: "center" }}>
                No orders yet this session.
              </div>
            ) : (
              previousOrders.flatMap((round, roundIdx) =>
                round.items.map((item) => (
                  <div key={`${roundIdx}-${item.id}`} className="bill-row">
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <strong>₹{item.price * item.quantity}</strong>
                  </div>
                )),
              )
            )}

            {previousOrders.length > 0 && (
              <>
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
              </>
            )}
          </div>
        </div>

        <aside className="panel summary-panel">
          <p className="eyebrow">Settle up</p>
          <h2>Choose the next step</h2>
          <button className="primary-btn wide" onClick={onClose}>
            Request Bill at Table
          </button>
          <button className="secondary-btn wide" onClick={onClose}>
            Request Server
          </button>
          {onContinueOrdering && (
            <button className="secondary-btn wide" onClick={onContinueOrdering}>
              Continue Ordering
            </button>
          )}
          <p className="summary-note">
            Once requested, a server brings the card reader directly to your table.
          </p>
        </aside>
      </div>
    </section>
  );
}
