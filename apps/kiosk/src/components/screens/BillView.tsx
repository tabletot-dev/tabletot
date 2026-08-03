import { useState } from "react";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import TabletotLogo from "@/components/TabletotLogo";
import { supabase } from "@/integrations/supabase/client";
import { resolveTableId } from "@/lib/orderSubmission";
import { appendEvent } from "@/lib/ledger";

const TAX_RATE = 0.05;

interface BillViewProps {
  previousOrders: OrderRound[];
  sessionTotal: number;
  alreadyRequested?: boolean;
  onClose: () => void;
  onBillSubmitted?: () => void;
  onContinueOrdering?: () => void;
  onBackToStatus?: () => void;
}

export default function BillView({
  previousOrders,
  sessionTotal,
  alreadyRequested = false,
  onClose,
  onBillSubmitted,
  onContinueOrdering,
  onBackToStatus,
}: BillViewProps) {
  const [stage, setStage] = useState<"summary" | "phone" | "loading" | "sent">(
    alreadyRequested ? "sent" : "summary"
  );
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const subtotal = sessionTotal;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const sanitizedPhone = phone.replace(/[^\d+]/g, "");
  // Indian mobile convention: 10 digits, starting 6-9 (project-wide rule, see
  // CLAUDE.md). Previously accepted any 10+ digit string. Strips an optional
  // country code (+91/91) before checking the local number.
  const digitsOnly = sanitizedPhone.replace(/\D/g, "");
  const localDigits = digitsOnly.length > 10 && digitsOnly.startsWith("91")
    ? digitsOnly.slice(2)
    : digitsOnly;
  const canSubmitPhone = /^[6-9]\d{9}$/.test(localDigits);

  const submitBillRequest = async () => {
    if (!canSubmitPhone) return;
    setError(null);
    setStage("loading");

    // The ledger event is the source of truth: it flips table_state + the
    // sessions row to bill_requested server-side. If it fails, surface the
    // failure instead of a false "bill coming your way" (audit M2).
    try {
      await appendEvent("bill_requested");
    } catch (err) {
      console.error("bill_requested failed:", err);
      setError("Couldn't reach the kitchen. Please try again or call a server.");
      setStage("phone");
      return;
    }

    // Phone capture is best-effort — the bill request already succeeded above.
    try {
      const tableUuid = await resolveTableId();
      const latestOrderId = previousOrders.length > 0
        ? previousOrders[previousOrders.length - 1].orderId
        : null;
      await supabase.from("bill_requests").insert({
        table_id: tableUuid,
        order_id: latestOrderId ?? null,
        phone: sanitizedPhone,
        status: "pending",
      });
    } catch {
      // non-blocking — staff already have the ledger signal
    }

    setStage("sent");
    onBillSubmitted?.();
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
          A server will bring the bill to your table.
        </p>
        {onBackToStatus && (
          <button className="secondary-btn" onClick={onBackToStatus}>
            Back to my order
          </button>
        )}
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
            {error && (
              <p role="alert" style={{ color: "var(--color-danger, #c0392b)", fontWeight: 600 }}>
                {error}
              </p>
            )}
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
