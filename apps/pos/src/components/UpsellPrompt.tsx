import { MenuItem } from "@/data/menu";
import { useEffect, useState } from "react";

interface UpsellPromptProps {
  addedItem: MenuItem;
  suggestedItem: MenuItem;
  onAdd: (item: MenuItem) => void;
  onDismiss: () => void;
}

const UpsellPrompt = ({ addedItem, suggestedItem, onAdd, onDismiss }: UpsellPromptProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss after 5s
    const timeout = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  const handleAdd = () => {
    onAdd(suggestedItem);
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
    >
      <div className="mx-3 mb-3 border border-primary/30 bg-card p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] tracking-[0.2em] uppercase text-primary font-display font-semibold">
            Customers also order
          </p>
          <button
            onClick={handleDismiss}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Added confirmation */}
        <p className="text-xs text-muted-foreground mb-2">
          ✓ <span className="text-foreground font-semibold">{addedItem.name}</span> added to cart
        </p>

        {/* Suggested item */}
        <div className="flex items-center gap-3">
          <img
            src={suggestedItem.image}
            alt={suggestedItem.name}
            className="w-12 h-12 object-cover border border-border flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-semibold text-foreground truncate">
              {suggestedItem.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {suggestedItem.description}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="font-display text-xs font-bold text-primary">
              ${suggestedItem.price.toFixed(2)}
            </span>
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 bg-primary text-primary-foreground font-display text-[10px] font-semibold tracking-widest uppercase cursor-pointer hover:opacity-90 active:scale-95 transition-all"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpsellPrompt;
