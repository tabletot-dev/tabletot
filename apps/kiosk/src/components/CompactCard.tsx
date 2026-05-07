import { categoryGradient } from "@/lib/categoryGradients";
import type { MenuItem } from "@/data/menu";

interface CompactCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
}

export default function CompactCard({ item, onAdd }: CompactCardProps) {
  return (
    <article
      className="compact-card"
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.8)",
        border: "1px solid var(--line)",
      }}
    >
      <div
        className="compact-thumb"
        style={{ background: categoryGradient(item.category), borderRadius: 12, width: 72, height: 72 }}
      />
      <div className="compact-copy">
        <strong style={{ fontSize: 15, lineHeight: 1.2 }}>{item.name}</strong>
        <span style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, display: "block" }}>
          ₹{item.price}
        </span>
      </div>
      <button
        className="mini-plus"
        onClick={() => onAdd(item)}
        aria-label={`Add ${item.name}`}
        style={{
          minWidth: 44,
          height: 44,
          borderRadius: 999,
          background: "var(--panel-dark)",
          color: "#fff",
          fontSize: 22,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        +
      </button>
    </article>
  );
}
