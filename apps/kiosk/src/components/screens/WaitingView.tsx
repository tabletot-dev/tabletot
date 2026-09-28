import { useMemo, useState, useEffect } from "react";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import { useKitchenStatus, STATUS_STAGE, STAGE_LABELS } from "@/hooks/useKitchenStatus";
import { getDisplayName } from "@/lib/orderSubmission";
import { useRestaurant } from "@/lib/restaurantContext";

interface WaitingViewProps {
  previousOrders: OrderRound[];
  currentRoundOrderId: string | null;
  billRequested: boolean;
  onOrderMore: () => void;
  onRequestBill: () => void;
  onGames: () => void;
  onConversationStarters: () => void;
  onRequestWater?: () => void;
  onCallStaff?: () => void;
}

function WaterIcon() {
  return (
    <svg className="water-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5c2.4 3 5 6 5 9a5 5 0 1 1-10 0c0-3 2.6-6 5-9Z" />
    </svg>
  );
}

export default function WaitingView({
  previousOrders,
  currentRoundOrderId,
  billRequested,
  onOrderMore,
  onRequestBill,
  onGames,
  onConversationStarters,
  onRequestWater,
  onCallStaff,
}: WaitingViewProps) {
  const { ads } = useRestaurant();
  const [promoIndex, setPromoIndex] = useState(0);
  const kitchenStatus = useKitchenStatus(currentRoundOrderId);

  useEffect(() => {
    if (ads.length === 0) return;
    const id = setInterval(() => setPromoIndex((i) => (i + 1) % ads.length), 4500);
    return () => clearInterval(id);
  }, [ads.length]);

  const { label: stage, index: stageIndex } = STATUS_STAGE[kitchenStatus];

  const itemCount = useMemo(() => {
    const last = previousOrders[previousOrders.length - 1];
    return last ? last.items.reduce((s, i) => s + i.quantity, 0) : 0;
  }, [previousOrders]);

  const sentItems = useMemo(
    () => previousOrders.flatMap((round, roundIdx) =>
      round.items.map((item) => ({
        ...item,
        roundNumber: roundIdx + 1,
      })),
    ),
    [previousOrders],
  );

  const ad = ads[promoIndex];

  return (
    <section className="tt-status">
      {ad && (
        <div className="tt-status-promo">
          <div
            className="tt-status-promo-media"
            style={{ backgroundImage: `url(${ad.image_url})` }}
          />
          {(ad.title || ads.length > 1) && (
            <div className="tt-status-promo-copy">
              <p className="eyebrow">While you wait</p>
              {ad.title && <strong>{ad.title}</strong>}
              {ads.length > 1 && (
                <div className="tt-status-promo-dots">
                  {ads.map((a, i) => (
                    <span key={a.id} className={`tt-status-promo-dot${i === promoIndex ? " active" : ""}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="tt-status-card">
        <p className="eyebrow">Order status</p>
        <h2>
          {(() => {
            const name = getDisplayName();
            if (kitchenStatus === "served") {
              return name ? `Your order has arrived, ${name}!` : "Your order has arrived!";
            }
            return name
              ? `Your order is being prepared, ${name}`
              : "Your order is being prepared";
          })()}
        </h2>
        {(itemCount > 0 || kitchenStatus === "served") && (
          <p className="tt-status-sub">
            {kitchenStatus === "served"
              ? "Enjoy your meal!"
              : `${itemCount} item${itemCount === 1 ? "" : "s"} in progress.`}
          </p>
        )}
        {sentItems.length > 0 && (
          <div className="tt-status-summary" aria-label="Already ordered items">
            <div className="tt-status-summary-head">
              <span>Already ordered</span>
              <strong>{sentItems.length} item{sentItems.length === 1 ? "" : "s"}</strong>
            </div>
            <div className="tt-status-summary-list">
              {sentItems.slice(0, 4).map((item) => (
                <span key={`${item.roundNumber}-${item.id}`}>
                  {item.quantity}x {item.name}
                </span>
              ))}
              {sentItems.length > 4 && <span>+{sentItems.length - 4} more</span>}
            </div>
          </div>
        )}
        <div className="tt-stages" aria-label={`Kitchen stage: ${stage}`}>
          {STAGE_LABELS.map((label, i) => (
            <div
              key={label}
              className={`tt-stages-step${
                i === stageIndex ? " active" : i < stageIndex ? " done" : ""
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="tt-status-actions">
        <button className="tt-btn--primary" onClick={onOrderMore} disabled={billRequested}>
          Order More
        </button>
        {/* A disabled button's `title` tooltip never shows on a touchscreen —
            the reason has to be visible text, not a hover-only hint. */}
        {billRequested && (
          <p className="tt-status-note">Bill requested — ask staff to add more.</p>
        )}
        <div className="tt-status-actions-row">
          {onRequestWater && (
            <button
              className="tt-btn--secondary"
              onClick={onRequestWater}
              aria-label="Request for water"
            >
              <span>Water</span>
              <WaterIcon />
            </button>
          )}
          {onCallStaff && (
            <button className="tt-btn--secondary" onClick={onCallStaff}>
              Call Staff
            </button>
          )}
          <button
            className="tt-btn--secondary"
            onClick={onRequestBill}
          >
            {billRequested ? "Bill Requested" : "Bill"}
          </button>
        </div>
        <div className="tt-status-actions-row">
          <button className="tt-btn--secondary" onClick={onGames}>
            Games
          </button>
          <button className="tt-btn--secondary" onClick={onConversationStarters}>
            Conversation Starters
          </button>
        </div>
      </div>
    </section>
  );
}
