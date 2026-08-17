import { useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import { getDisplayName } from "@/lib/orderSubmission";
import { categoryGradient } from "@/lib/categoryGradients";
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

type KitchenStatus = "new" | "preparing" | "ready" | "served" | "unknown";

// Index into the four-stage strip (Queued · Cooking · Plating · Served).
const STATUS_STAGE: Record<KitchenStatus, { label: string; index: number }> = {
  new:       { label: "Queued",  index: 0 },
  preparing: { label: "Cooking", index: 1 },
  ready:     { label: "Plating", index: 2 },
  served:    { label: "Served",  index: 3 },
  unknown:   { label: "Queued",  index: 0 },
};

const STAGES = ["Queued", "Cooking", "Plating", "Served"];

// Zero-network-dependency gradients to sit behind whatever promo copy the
// restaurant configures — no real creative assets exist per-restaurant yet.
const PROMO_GRADIENTS = [
  categoryGradient("Hot Coffee"),
  categoryGradient("Desserts"),
  categoryGradient("Signature Coffee"),
];

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
  const { promos } = useRestaurant();
  const [promoIndex, setPromoIndex] = useState(0);
  const [kitchenStatus, setKitchenStatus] = useState<KitchenStatus>("unknown");

  useEffect(() => {
    if (promos.length === 0) return;
    const id = setInterval(() => setPromoIndex((i) => (i + 1) % promos.length), 4500);
    return () => clearInterval(id);
  }, [promos.length]);

  useEffect(() => {
    if (!currentRoundOrderId || !hasSupabaseConfig) return;

    const channel = supabase
      .channel(`order-status-${currentRoundOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${currentRoundOrderId}`,
        },
        (payload) => {
          const status = (payload.new as { status?: string }).status;
          if (status && status in STATUS_STAGE) {
            setKitchenStatus(status as KitchenStatus);
          }
        },
      )
      .subscribe();

    supabase
      .from("orders")
      .select("status")
      .eq("id", currentRoundOrderId)
      .single()
      .then(({ data }) => {
        if (data?.status && data.status in STATUS_STAGE) {
          setKitchenStatus(data.status as KitchenStatus);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoundOrderId]);

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

  const promo = promos[promoIndex];

  return (
    <section className="tt-status">
      {promo && (
        <div className="tt-status-promo">
          <div
            className="tt-status-promo-media"
            style={{ background: PROMO_GRADIENTS[promoIndex % PROMO_GRADIENTS.length] }}
          />
          <div className="tt-status-promo-copy">
            <p className="tt-badge">While you wait</p>
            <strong>{promo.title}</strong>
            <span>{promo.copy}</span>
            <div className="tt-status-promo-dots">
              {promos.map((p, i) => (
                <span key={p.id} className={`tt-status-promo-dot${i === promoIndex ? " active" : ""}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="tt-status-card">
        <p className="tt-badge">Order Status</p>
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
        <p className="tt-status-sub">
          {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} in progress. ` : ""}
          {kitchenStatus === "served"
            ? "Enjoy your meal!"
            : `The kitchen is currently at the `}
          {kitchenStatus !== "served" && <strong>{stage.toLowerCase()}</strong>}
          {kitchenStatus !== "served" && " stage."}
        </p>
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
          {STAGES.map((label, i) => (
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
        <button
          className="tt-btn--primary"
          onClick={onOrderMore}
          disabled={billRequested}
          title={billRequested ? "Bill requested — ask staff to reopen ordering" : undefined}
        >
          Order More
        </button>
        <div className="tt-status-actions-row">
          <button className="tt-btn--secondary" onClick={onGames}>
            Games
          </button>
          <button className="tt-btn--secondary" onClick={onConversationStarters}>
            Conversation Starters
          </button>
        </div>
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
      </div>
    </section>
  );
}
