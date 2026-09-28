import { useMemo, useState, useEffect } from "react";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import { useKitchenStatus, STATUS_STAGE, STAGE_LABELS } from "@/hooks/useKitchenStatus";
import { useKotTickets, KOT_ACTIVE, type KotStatus } from "@/hooks/useKotTickets";
import { getDisplayName } from "@/lib/orderSubmission";
import { useRestaurant } from "@/lib/restaurantContext";
import { useMenu } from "@/lib/menuStore";

// "1st order", "2nd order"... — never the word "Round" to a customer
// (2026-09-28 UX audit).
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

const KOT_LABEL: Record<KotStatus, string> = {
  accepted: "Received",
  preparing: "Cooking",
  ready: "Ready",
  archived: "Ready",
  cancelled: "Cancelled",
};

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
  const { items: menuItems } = useMenu();
  const [promoIndex, setPromoIndex] = useState(0);
  const kitchenStatus = useKitchenStatus(currentRoundOrderId);
  const kotTickets = useKotTickets(currentRoundOrderId);

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

  // "1st order · Cooking / 2nd order · Received" instead of one blended
  // count — fixes the "1 item vs 2 items" mix-up when two rounds are at
  // different kitchen stages (2026-09-28 UX audit). Cancelled tickets never
  // reached the kitchen, so they're left out of what the guest sees.
  const orderedTickets = useMemo(
    () => kotTickets
      .filter((t) => t.status !== "cancelled")
      .map((t, i) => ({ ...t, position: i + 1 })),
    [kotTickets],
  );

  // Longest prep time among items still cooking, minus minutes already
  // elapsed on the oldest active ticket — never below 1. Hidden entirely if
  // no active item has a prep time set (menu_items.facts.prep_minutes).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const etaMinutes = useMemo(() => {
    const active = kotTickets.filter((t) => KOT_ACTIVE.includes(t.status));
    if (active.length === 0) return null;
    const prepById = new Map(menuItems.map((m) => [m.id, m.prepMinutes]));
    let maxRemaining: number | null = null;
    for (const ticket of active) {
      const longestItem = Math.max(
        0,
        ...ticket.items.map((i) => prepById.get(i.id) ?? 0).filter((m) => m > 0),
      );
      if (longestItem === 0) continue;
      const elapsedMin = (now - new Date(ticket.createdAt).getTime()) / 60_000;
      const remaining = Math.max(1, Math.round(longestItem - elapsedMin));
      maxRemaining = maxRemaining === null ? remaining : Math.max(maxRemaining, remaining);
    }
    return maxRemaining;
  }, [kotTickets, menuItems, now]);

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
        <div className="tt-status-head">
          <p className="eyebrow">Order status</p>
          {etaMinutes != null && kitchenStatus !== "served" && (
            <p className="tt-status-eta">
              <strong>~{etaMinutes} min</strong>
              <span>estimated</span>
            </p>
          )}
        </div>
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
        {orderedTickets.length > 0 ? (
          <div className="tt-status-summary" aria-label="Orders sent this session">
            {orderedTickets.map((ticket) => (
              <div key={ticket.id} className="tt-status-summary-row">
                <div>
                  <span className="tt-status-summary-ordinal">{ordinal(ticket.position)} order</span>
                  <span className="tt-status-summary-items">
                    {ticket.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                  </span>
                </div>
                <span className={`tt-status-summary-tag tt-status-summary-tag--${ticket.status}`}>
                  {KOT_LABEL[ticket.status]}
                </span>
              </div>
            ))}
          </div>
        ) : previousOrders.length > 0 ? (
          // Fallback while the kitchen-ticket fetch is still in flight (or
          // unavailable) — previousOrders is client state, always ready
          // instantly, so the guest is never left with a blank summary.
          <div className="tt-status-summary" aria-label="Already ordered items">
            <div className="tt-status-summary-head">
              <span>Already ordered</span>
              <strong>{itemCount} item{itemCount === 1 ? "" : "s"}</strong>
            </div>
            <div className="tt-status-summary-list">
              {previousOrders.flatMap((round) => round.items).slice(0, 4).map((item) => (
                <span key={item.id}>{item.quantity}x {item.name}</span>
              ))}
            </div>
          </div>
        ) : null}
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
