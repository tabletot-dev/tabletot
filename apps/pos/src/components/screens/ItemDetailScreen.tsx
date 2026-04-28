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

      {/* Image */}
      <div className="relative">
        <img
          src={item.image}
          alt={item.name}
          className="w-full aspect-[4/3] object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, hsl(var(--background)), transparent 50%)",
          }}
        />
        <div className="absolute bottom-4 right-4 bg-primary px-3 py-1">
          <span className="font-display text-lg font-bold text-primary-foreground">
            ${item.price.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold text-foreground tracking-wide">
          {item.name}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {item.description}
        </p>
        <span className="self-start text-xs tracking-widest uppercase border border-border px-2 py-1 text-muted-foreground">
          {item.category}
        </span>
      </div>

      {/* Action bar - large touch target */}
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
