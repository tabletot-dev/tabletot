import { itemImageBackground } from "@/lib/menuImages";
import type { MenuItem } from "@/data/menu";
import DietMark from "@/components/DietMark";

interface CompactCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
}

export default function CompactCard({ item, onAdd }: CompactCardProps) {
  return (
    <article className="compact-card">
      <div className="compact-thumb" style={{ background: itemImageBackground(item) }} />
      <div className="compact-copy">
        <strong>
          <DietMark isVeg={item.is_veg} compact />
          {item.name}
        </strong>
        <span>₹{item.price}</span>
      </div>
      <button className="mini-plus" onClick={() => onAdd(item)} aria-label={`Add ${item.name}`}>
        +
      </button>
    </article>
  );
}
