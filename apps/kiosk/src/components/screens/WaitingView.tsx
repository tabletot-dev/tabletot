import { useMenu } from "@/lib/menuStore";
import type { MenuItem } from "@/data/menu";
import type { OrderRound } from "@/hooks/useDeviceNavigation";
import CompactCard from "@/components/CompactCard";

const DESSERT_CATEGORIES = ["Desserts", "Tea & Chocolate", "Smoothie Bowls"];
const DRINK_CATEGORIES = ["Hot Coffee", "Signature Coffee", "Iced Coffee"];

interface WaitingViewProps {
  previousOrders: OrderRound[];
  onOrderMore: () => void;
  onRequestBill: () => void;
  onAddToCart: (item: MenuItem) => void;
}

export default function WaitingView({
  previousOrders,
  onOrderMore,
  onRequestBill,
  onAddToCart,
}: WaitingViewProps) {
  const { items } = useMenu();

  const desserts = items.filter((i) => DESSERT_CATEGORIES.includes(i.category)).slice(0, 3);
  const drinks = items.filter((i) => DRINK_CATEGORIES.includes(i.category)).slice(0, 3);

  const lastOrder = previousOrders[previousOrders.length - 1];
  const itemCount = lastOrder
    ? lastOrder.items.reduce((s, i) => s + i.quantity, 0)
    : 0;

  return (
    <section className="view waiting-view">
      {/* Dark status hero */}
      <div className="status-hero">
        <div className="status-copy">
          <p className="eyebrow light-text">Order in progress</p>
          <h1>Your meal is on the way.</h1>
          <p className="hero-sub light-text">
            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? "s" : ""} sent.` : ""} Use the
            table screen for desserts, drinks, or a service request while you wait.
          </p>
        </div>
        <div className="progress-box">
          <div className="progress-meta">
            <span>Preparing</span>
            <strong>40%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: "40%" }} />
          </div>
        </div>
      </div>

      {/* Waiting grid: service | desserts | drinks */}
      <div className="waiting-grid">
        {/* Service actions */}
        <div className="panel">
          <div className="section-title inline">
            <div>
              <p className="eyebrow">Need anything else?</p>
              <h2>Service</h2>
            </div>
          </div>
          <div className="action-stack" style={{ marginTop: 16 }}>
            <button className="secondary-btn wide" onClick={onOrderMore}>
              Order More
            </button>
            <button className="secondary-btn wide" onClick={onRequestBill}>
              View Bill
            </button>
          </div>
        </div>

        {/* Dessert suggestions */}
        <div className="panel">
          <div className="section-title inline">
            <div>
              <p className="eyebrow">Dessert suggestions</p>
              <h2>Save room</h2>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {desserts.map((item) => (
              <CompactCard key={item.id} item={item} onAdd={onAddToCart} />
            ))}
          </div>
        </div>

        {/* Drink suggestions */}
        <div className="panel">
          <div className="section-title inline">
            <div>
              <p className="eyebrow">Drink suggestions</p>
              <h2>Something to sip</h2>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {drinks.map((item) => (
              <CompactCard key={item.id} item={item} onAdd={onAddToCart} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
