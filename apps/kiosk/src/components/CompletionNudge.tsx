import { useEffect } from "react";
import { MenuItem } from "@/data/menu";
import { track } from "@/lib/eventBus";

interface CompletionNudgeProps {
  suggestionText: string;
  suggestedItemId: string;
  cartValueAtShow: number;
  menuItems: MenuItem[];
  onAdd: (item: MenuItem) => void;
  onSkip: () => void;
}

const CompletionNudge = ({
  suggestionText,
  suggestedItemId,
  menuItems,
  onAdd,
  onSkip,
}: CompletionNudgeProps) => {
  // Looked up from the already-hydrated menu (same source DishCard reads)
  // instead of a separate fetch — that fetch used to omit image_url, which
  // is why items added here showed a gray placeholder in the cart.
  const item = menuItems.find((i) => i.id === suggestedItemId) ?? null;

  useEffect(() => {
    if (!item) {
      // Suggested item not found or inactive — skip straight to order submission
      onSkip();
      return;
    }
    track("recommendation_shown", {
      itemId: item.id,
      surface: "completion_nudge",
    });
    // Only re-fire when the suggested item actually changes, not on every
    // menuItems re-render (menuStore returns a fresh array reference often).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedItemId]);

  const handleAdd = () => {
    if (!item) return;
    track("recommendation_tapped", {
      itemId: item.id,
      surface: "completion_nudge",
    });
    // item_added is emitted by the cart hook when the parent calls
    // addToOrder(item, "completion_nudge") via the onAdd callback.
    onAdd(item);
  };

  const handleSkip = () => {
    // Absence of recommendation_tapped is the signal — no event fired here.
    onSkip();
  };

  if (!item) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 bg-background border border-border p-5 flex flex-col gap-4 w-full max-w-[300px]">
        <p className="font-display text-sm font-semibold text-foreground leading-snug">
          {suggestionText}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleAdd}
            className="w-full py-3 bg-primary text-primary-foreground font-display text-xs font-semibold tracking-widest uppercase cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Add {item.name} ₹{item.price}
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-2.5 border border-border text-muted-foreground font-display text-xs font-semibold tracking-widest uppercase cursor-pointer hover:border-primary/40 hover:text-foreground active:bg-muted transition-all"
          >
            No thanks, place order
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompletionNudge;
