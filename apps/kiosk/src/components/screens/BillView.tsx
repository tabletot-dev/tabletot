import { useEffect, useState } from "react";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import TabletotLogo from "@/components/TabletotLogo";

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
  const [stage, setStage] = useState<"summary" | "phone" | "loading" | "sent">("summary");
  const [phone, setPhone] = useState("");
  const subtotal = sessionTotal;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const sanitizedPhone = phone.replace(/[^\d+]/g, "");
  const canSubmitPhone = sanitizedPhone.replace(/\D/g, "").length >= 10;

  useEffect(() => {
    if (stage !== "sent") return undefined;
    const id = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(id);
  }, [stage, onClose]);

  const submitBillRequest = () => {
    if (!canSubmitPhone) return;

    const billRequest = {
      id: crypto.randomUUID(),
      phone: sanitizedPhone,
      total: Math.round(total),
      orderIds: previousOrders.map((round) => round.orderId),
      createdAt: new Date().toISOString(),
    };

    try {
      const existing = JSON.parse(localStorage.getItem("tt_bill_requests") ?? "[]") as unknown[];
      localStorage.setItem("tt_bill_requests", JSON.stringify([...existing, billRequest]));
    } catch {
      localStorage.setItem("tt_bill_requests", JSON.stringify([billRequest]));
    }

    setStage("loading");
    window.setTimeout(() => setStage("sent"), 1300);
  };

  if (stage === "loading") {
    return (
      <section className="view bill-view bill-flow-state" role="status" aria-live="polite">
        <TabletotLogo className="bill-flow-boot" />
      </section>
    );
  }

  if (stage === "sent") {
    return (
      <section className="view bill-view bill-flow-state" role="status" aria-live="polite">
        <div className="bill-success-mark">
          <TabletotLogo className="bill-flow-boot compact" />
        </div>
        <p className="eyebrow">Bill Requested</p>
        <h1>Bill coming your way.</h1>
        <p className="bill-flow-copy">
          A server will bring the bill to your table. This screen will reset shortly.
        </p>
      </section>
    );
  }

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
          <button className="primary-btn wide" onClick={() => setStage("phone")}>
            Request Bill at Table
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

      {stage === "phone" && (
        <div className="bill-phone-backdrop" role="dialog" aria-modal="true" aria-labelledby="bill-phone-title">
          <form
            className="bill-phone-panel"
            onSubmit={(event) => {
              event.preventDefault();
              submitBillRequest();
            }}
          >
            <p className="eyebrow">Guest record</p>
            <h2 id="bill-phone-title">Where should we attach this bill request?</h2>
            <p>
              Enter a phone number so the table request can be linked to this visit.
            </p>
            <label className="bill-phone-field">
              <span>Phone number</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                autoFocus
              />
            </label>
            <div className="bill-phone-actions">
              <button type="button" className="secondary-btn" onClick={() => setStage("summary")}>
                Back
              </button>
              <button type="submit" className="primary-btn" disabled={!canSubmitPhone}>
                Submit
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
