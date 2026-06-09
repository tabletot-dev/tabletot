import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MenuItem } from "@/data/menu";
import { track } from "@/lib/eventBus";
import { RESTAURANT_ID } from "@/lib/config";

interface CompletionNudgeProps {
  suggestionText: string;
  suggestedItemId: string;
  cartValueAtShow: number;
  onAdd: (item: MenuItem) => void;
  onSkip: () => void;
}

const CompletionNudge = ({
  suggestionText,
  suggestedItemId,
  onAdd,
  onSkip,
}: CompletionNudgeProps) => {
  const [item, setItem] = useState<{ id: string; name: string; price: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: itemData } = await supabase
        .from("menu_items")
        .select("id, name, price")
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("id", suggestedItemId)
        .eq("active", true)
        .single();

      if (!mounted) return;

      if (!itemData) {
        // Suggested item not found or inactive — skip straight to order submission
        onSkip();
        return;
      }

      setItem(itemData as { id: string; name: string; price: number });
      track("recommendation_shown", {
        itemId: itemData.id,
        surface: "completion_nudge",
      });
      setReady(true);
    })();
    return () => { mounted = false; };
  }, [suggestedItemId, onSkip]);

  const handleAdd = () => {
    if (!item) return;
    track("recommendation_tapped", {
      itemId: item.id,
      surface: "completion_nudge",
    });
    // item_added is emitted by the cart hook when the parent calls
    // addToOrder(item, "completion_nudge") via the onAdd callback.
    onAdd({ id: item.id, name: item.name, price: item.price, category: "", tags: [] });
  };

  const handleSkip = () => {
    // Absence of recommendation_tapped is the signal — no event fired here.
    onSkip();
  };

  if (!ready || !item) return null;

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
