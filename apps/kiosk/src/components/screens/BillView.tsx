import { useState } from "react";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import TabletotLogo from "@/components/TabletotLogo";
import { supabase } from "@/integrations/supabase/client";
import { resolveTableId } from "@/lib/orderSubmission";
import { appendEvent } from "@/lib/ledger";
import { computeTotals } from "@/lib/pricing";
import { useRestaurant } from "@/lib/restaurantContext";
import { formatRupees } from "@/lib/formatCurrency";

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
  const { gstRatePercent } = useRestaurant();
  const { subtotal, tax, total } = computeTotals(sessionTotal, gstRatePercent);
  // Indian mobile convention: 10 digits, starting 6-9 (project-wide rule, see
  // CLAUDE.md). Previously accepted any 10+ digit string. Strips an optional
  // country code (+91/91) before checking the local number.
  const localDigitsOf = (raw: string) => {
    const digitsOnly = raw.replace(/[^\d+]/g, "").replace(/\D/g, "");
    return digitsOnly.length > 10 && digitsOnly.startsWith("91") ? digitsOnly.slice(2) : digitsOnly;
  };
  const isValidLocalPhone = (digits: string) => /^[6-9]\d{9}$/.test(digits);
  const localDigits = localDigitsOf(phone);
  const isValidPhone = isValidLocalPhone(localDigits);
  // Phone is optional — a blank field is fine, but a partially-typed number
  // shouldn't silently submit as garbage. Only a non-empty, invalid number blocks.
  const canSubmitPhone = localDigits.length === 0 || isValidPhone;

  // phoneOverride lets "Skip" submit without a number regardless of whatever
  // partial text is still sitting in the input, without racing setState.
  const submitBillRequest = async (phoneOverride?: string) => {
    const effectivePhone = phoneOverride ?? phone;
    const effectiveLocalDigits = localDigitsOf(effectivePhone);
    const effectiveIsValid = isValidLocalPhone(effectiveLocalDigits);
    if (effectiveLocalDigits.length > 0 && !effectiveIsValid) return;
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
    if (effectiveIsValid) {
      try {
        const tableUuid = await resolveTableId();
        const latestOrderId = previousOrders.length > 0
          ? previousOrders[previousOrders.length - 1].orderId
          : null;
        await supabase.from("bill_requests").insert({
          table_id: tableUuid,
          order_id: latestOrderId ?? null,
          phone: effectivePhone.replace(/[^\d+]/g, ""),
          status: "pending",
        });
      } catch {
        // non-blocking — staff already have the ledger signal
      }
    }

    setStage("sent");
    onBillSubmitted?.();
  };

  if (stage === "loading") {
    return (
      <section className="tt-bill-flow" role="status" aria-live="polite">
        <TabletotLogo className="tt-bill-flow-logo" />
      </section>
    );
  }

  if (stage === "sent") {
    return (
      <section className="tt-bill-flow" role="status" aria-live="polite">
        <TabletotLogo className="tt-bill-flow-logo" />
        <p className="tt-badge">Bill Requested</p>
        <h1>Bill coming your way.</h1>
        <p className="tt-bill-flow-copy">
          A server will bring the bill to your table.
        </p>
        {onBackToStatus && (
          <button className="tt-btn--secondary" onClick={onBackToStatus}>
            Back to my order
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="tt-bill">
      <p className="tt-badge">Itemized bill</p>
      <h1>Review before asking to settle</h1>

      {previousOrders.length === 0 ? (
        <div className="tt-empty">No orders yet this session.</div>
      ) : (
        <div className="tt-bill-rounds">
          {previousOrders.map((round, roundIdx) => (
            <div key={roundIdx} className="tt-bill-round">
              <p className="tt-bill-round-label">Round {roundIdx + 1} · Sent</p>
              {round.items.map((item) => (
                <div key={item.id} className="bill-row">
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <strong>{formatRupees(item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
          ))}

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
        </div>
      )}

      <div className="tt-bill-settle">
        <p className="tt-badge">Settle up</p>
        <h2>Choose the next step</h2>
        <button className="tt-btn--primary" onClick={() => setStage("phone")}>
          Request Bill at Table
        </button>
        {onContinueOrdering && (
          <button className="tt-btn--secondary" onClick={onContinueOrdering}>
            Continue Ordering
          </button>
        )}
        <p className="tt-bill-note">
          Once requested, a server brings the card reader directly to your table.
        </p>
      </div>

      {stage === "phone" && (
        <div className="tt-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="bill-phone-title">
          <form
            className="tt-modal"
            onSubmit={(event) => {
              event.preventDefault();
              submitBillRequest();
            }}
          >
            <p className="tt-badge">Guest record</p>
            <h2 id="bill-phone-title">A server is bringing the card reader over</h2>
            <p>
              Optional — a phone number lets us link this request to your visit if there's a mix-up.
            </p>
            <label>
              <span className="tt-badge">Phone number (optional)</span>
              <input
                className="tt-field"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                autoFocus
              />
            </label>
            {error && (
              <p role="alert" className="tt-field-error">
                {error}
              </p>
            )}
            <div className="tt-modal-actions">
              <button type="submit" className="tt-btn--primary" disabled={!canSubmitPhone}>
                Submit
              </button>
              <button type="button" className="tt-btn--secondary" onClick={() => submitBillRequest("")}>
                Skip — request without a number
              </button>
              <button type="button" className="tt-btn--secondary" onClick={() => setStage("summary")}>
                Back
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
