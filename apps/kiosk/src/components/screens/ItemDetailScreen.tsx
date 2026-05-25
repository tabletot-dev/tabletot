import { MenuItem } from "@/data/menu";

interface ItemDetailScreenProps {
  item: MenuItem;
  onAdd: () => void;
  onBack: () => void;
}

const ItemDetailScreen = ({ item, onAdd, onBack }: ItemDetailScreenProps) => {
  return (
    <div className="flex flex-col h-full">
      {/* Back header */}
      <div className="flex items-center px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1 px-2 -ml-2 active:bg-muted"
        >
          ← Back
        </button>
      </div>

      {/* Details */}
      <div className="flex-1 px-4 py-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground tracking-wide leading-tight">
            {item.name}
          </h1>
          <span className="font-display text-xl font-bold text-primary flex-shrink-0">
            ₹{item.price}
          </span>
        </div>

        <span className="self-start text-xs tracking-widest uppercase border border-border px-2 py-1 text-muted-foreground">
          {item.category.replace(/_/g, ' ')}
        </span>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs border border-border px-2 py-1 text-muted-foreground tracking-wider"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-t border-border p-4">
        <button
          onClick={onAdd}
          className="w-full py-4 bg-primary text-primary-foreground font-display text-base font-semibold tracking-widest uppercase cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Add to Order
        </button>
      </div>
    </div>
  );
};

export default ItemDetailScreen;
