import type { OrderItem } from "@/data/menu";
import { computeTotals } from "@/lib/pricing";

interface SentViewProps {
  items: OrderItem[];
  roundNumber: number;
  secondsLeft: number;
  onEdit: () => void;
  onCancel: () => void;
  onSendNow: () => void;
  onOrderMore: () => void;
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SentView({
  items, roundNumber, secondsLeft, onEdit, onCancel, onSendNow, onOrderMore,
}: SentViewProps) {
  const subtotalRaw = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const { total } = computeTotals(subtotalRaw);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <section className="tt-sent">
      <p className="tt-badge">Round {roundNumber}</p>
      <h1>Going to the kitchen in {mmss(secondsLeft)}</h1>
      <p className="tt-sent-sub">
        {count} item{count === 1 ? "" : "s"} · ₹{total.toFixed(0)} · added to your table bill
      </p>
      <p className="tt-sent-note">
        You can still change this round. After that it's on the pass.
      </p>

      <div className="tt-sent-actions">
        <button type="button" className="tt-btn--primary" onClick={onSendNow}>
          Send now
        </button>
        <button type="button" className="tt-btn--secondary" onClick={onEdit}>
          Edit round
        </button>
        <button type="button" className="tt-btn--tertiary" onClick={onCancel}>
          Cancel round
        </button>
      </div>

      <button type="button" className="tt-btn--tertiary" onClick={onOrderMore}>
        Order more
      </button>
    </section>
  );
}
