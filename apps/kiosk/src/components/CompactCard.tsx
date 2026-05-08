import { categoryGradient } from "@/lib/categoryGradients";
import type { MenuItem } from "@/data/menu";

interface CompactCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
}

export default function CompactCard({ item, onAdd }: CompactCardProps) {
  return (
    <article className="compact-card">
      <div className="compact-thumb" style={{ background: categoryGradient(item.category) }} />
      <div className="compact-copy">
        <strong>{item.name}</strong>
        <span>₹{item.price}</span>
      </div>
      <button className="mini-plus" onClick={() => onAdd(item)} aria-label={`Add ${item.name}`}>
        +
      </button>
    </article>
  );
}
