import { useEffect, useMemo, useState } from "react";
import type { OrderRound } from "@/hooks/useDeviceNavigation";

interface WaitingViewProps {
  previousOrders: OrderRound[];
  onOrderMore: () => void;
  onRequestBill: () => void;
  onRequestWater?: () => void;
}

const PROMOS = [
  {
    id: "ad-travel",
    title: "Weekend Escape",
    copy: "Discover limited-time city breaks, spa stays, and last-minute travel offers.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
  },
  {
    id: "ad-audio",
    title: "Studio Sound",
    copy: "Wireless headphones, deep bass, and everyday listening made beautifully simple.",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1600&q=80",
  },
  {
    id: "ad-fashion",
    title: "New Season Edit",
    copy: "Lightweight essentials, clean tailoring, and fresh arrivals for the week ahead.",
    image:
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1600&q=80",
  },
  {
    id: "ad-wellness",
    title: "Reset & Recharge",
    copy: "Wellness offers, fitness plans, and recovery treatments curated for busy days.",
    image:
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1600&q=80",
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
  onOrderMore,
  onRequestBill,
  onRequestWater,
}: WaitingViewProps) {
  const [promoIndex, setPromoIndex] = useState(0);
  const [billRequested, setBillRequested] = useState(false);
  const [waterRequested, setWaterRequested] = useState(false);
  const [orderSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setPromoIndex((i) => (i + 1) % PROMOS.length), 4500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const promo = PROMOS[promoIndex];

  const itemCount = useMemo(() => {
    const last = previousOrders[previousOrders.length - 1];
    return last ? last.items.reduce((s, i) => s + i.quantity, 0) : 0;
  }, [previousOrders]);

  const { progress, stage } = useMemo(() => {
    const seconds = (now - orderSentAt) / 1000;
    const pct = Math.min(92, Math.round(28 + seconds / 20));
    const stageLabel = pct < 45 ? "Queued" : pct < 80 ? "Cooking" : "Plating";
    return { progress: pct, stage: stageLabel };
  }, [now, orderSentAt]);

  return (
    <section className="view idle-view">
      <div className="idle-slideshow panel">
        <div className="idle-slideshow-media" style={{ backgroundImage: `url('${promo.image}')` }} />
        <div className="idle-slideshow-copy">
          <p className="eyebrow">Now showing</p>
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
          <h2>Your order is being prepared</h2>
          <p className="hero-sub">
            {itemCount > 0
              ? `${itemCount} item${itemCount === 1 ? "" : "s"} in progress. `
              : ""}
            The kitchen is currently at the <strong>{stage.toLowerCase()}</strong> stage.
          </p>
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
        <button className="primary-btn" onClick={onOrderMore}>
          Order More
        </button>
        <button
          className="secondary-btn"
          onClick={() => {
            setBillRequested(true);
            onRequestBill();
          }}
        >
          {billRequested ? "Bill Requested" : "Request Bill"}
        </button>
        {onRequestWater && (
          <button
            className={`water-cta${waterRequested ? " active" : ""}`}
            onClick={() => {
              setWaterRequested(true);
              onRequestWater();
            }}
            aria-label="Request water"
          >
            <WaterIcon />
          </button>
        )}
      </div>
    </section>
  );
}
