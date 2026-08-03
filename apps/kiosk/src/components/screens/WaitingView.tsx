import { useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import { getDisplayName } from "@/lib/orderSubmission";
import { categoryGradient } from "@/lib/categoryGradients";

interface WaitingViewProps {
  previousOrders: OrderRound[];
  currentRoundOrderId: string | null;
  billRequested: boolean;
  onOrderMore: () => void;
  onRequestBill: () => void;
  onGames: () => void;
  onConversationStarters: () => void;
  onRequestWater?: () => void;
}

type KitchenStatus = "new" | "preparing" | "ready" | "served" | "unknown";

const STATUS_STAGE: Record<KitchenStatus, { label: string; pct: number }> = {
  new:       { label: "Queued",    pct: 28 },
  preparing: { label: "Cooking",   pct: 60 },
  ready:     { label: "Plating",   pct: 85 },
  served:    { label: "Done",      pct: 100 },
  unknown:   { label: "Queued",    pct: 28 },
};

// Previously hotlinked four Unsplash images with fashion/travel/audio copy —
// unrelated to the restaurant and broken on Wi-Fi without internet (flagged
// highest-severity in the UX audit: "reads as broken or unfinished"). No real
// restaurant marketing assets exist to swap in, so this uses the same
// category-gradient palette already established for dish-image fallbacks
// (`categoryGradients.ts`) instead of fabricating more off-brand content —
// zero network dependency, and generic enough to fit any restaurant on
// Tabletot rather than hardcoding one pilot's branding into shared kiosk code.
const PROMOS = [
  {
    id: "promo-fresh",
    title: "Freshly made, just for you",
    copy: "Every order is prepared after you send it — good things are worth the short wait.",
    gradient: categoryGradient("Hot Coffee"),
  },
  {
    id: "promo-ask",
    title: "Got a craving?",
    copy: "Tap Order More any time — round two is just as easy as round one.",
    gradient: categoryGradient("Desserts"),
  },
  {
    id: "promo-allergy",
    title: "Allergies or preferences?",
    copy: "Flag anything you need when you request the bill, and a server will take care of it.",
    gradient: categoryGradient("Signature Coffee"),
  },
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
}: WaitingViewProps) {
  const [promoIndex, setPromoIndex] = useState(0);
  const [kitchenStatus, setKitchenStatus] = useState<KitchenStatus>("unknown");

  useEffect(() => {
    const id = setInterval(() => setPromoIndex((i) => (i + 1) % PROMOS.length), 4500);
    return () => clearInterval(id);
  }, []);

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

  const { label: stage, pct: progress } = STATUS_STAGE[kitchenStatus];

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

  const promo = PROMOS[promoIndex];

  return (
    <section className="view idle-view">
      <div className="idle-slideshow panel">
        <div className="idle-slideshow-media" style={{ background: promo.gradient }} />
        <div className="idle-slideshow-copy">
          <p className="eyebrow">While you wait</p>
          <strong>{promo.title}</strong>
          <span>{promo.copy}</span>
          <div className="idle-dots">
            {PROMOS.map((p, i) => (
              <span key={p.id} className={`idle-dot${i === promoIndex ? " active" : ""}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="idle-status panel">
        <div className="idle-status-copy">
          <p className="eyebrow">Order Status</p>
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
          <p className="hero-sub">
            {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} in progress. ` : ""}
            {kitchenStatus === "served"
              ? "Enjoy your meal!"
              : `The kitchen is currently at the `}
            {kitchenStatus !== "served" && <strong>{stage.toLowerCase()}</strong>}
            {kitchenStatus !== "served" && " stage."}
          </p>
          {sentItems.length > 0 && (
            <div className="status-order-summary" aria-label="Already ordered items">
              <div>
                <span>Already ordered</span>
                <strong>{sentItems.length} item{sentItems.length === 1 ? "" : "s"}</strong>
              </div>
              <div className="status-order-list">
                {sentItems.slice(0, 4).map((item) => (
                  <span key={`${item.roundNumber}-${item.id}`}>
                    {item.quantity}x {item.name}
                  </span>
                ))}
                {sentItems.length > 4 && <span>+{sentItems.length - 4} more</span>}
              </div>
            </div>
          )}
        </div>
        <div className="idle-progress-box">
          <div className="progress-meta">
            <span>{stage}</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="idle-cta-row">
        <button
          className="primary-btn"
          onClick={onOrderMore}
          disabled={billRequested}
          title={billRequested ? "Bill requested — ask staff to reopen ordering" : undefined}
        >
          Order More
        </button>
        <button
          className="secondary-btn"
          onClick={onRequestBill}
        >
          {billRequested ? "Bill Requested" : "Request Bill"}
        </button>
        {onRequestWater && (
          <button
            className="water-cta"
            onClick={onRequestWater}
            aria-label="Request for water"
          >
            <span className="water-cta-label">Request for water</span>
            <WaterIcon />
          </button>
        )}

        <div className="idle-feature-actions" aria-label="Table entertainment">
          <button className="idle-feature-btn" onClick={onGames}>
            <span>Games</span>
          </button>
          <button className="idle-feature-btn" onClick={onConversationStarters}>
            <span>Conversation Starters</span>
          </button>
        </div>
      </div>
    </section>
  );
}
