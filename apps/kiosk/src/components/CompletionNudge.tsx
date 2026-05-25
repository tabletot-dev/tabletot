import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MenuItem } from "@/data/menu";

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface CompletionNudgeProps {
  suggestionText: string;
  suggestedItemId: string;
  cartValueAtShow: number;
  onAdd: (item: MenuItem) => void;
  onSkip: () => void;
}

function getOrCreateSessionId(): string {
  const key = "tt_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

const CompletionNudge = ({
  suggestionText,
  suggestedItemId,
  cartValueAtShow,
  onAdd,
  onSkip,
}: CompletionNudgeProps) => {
  const [item, setItem] = useState<{ id: string; name: string; price: number } | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: itemData } = await supabase
        .from("menu_items")
        .select("id, name, price")
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("id", suggestedItemId)
        .eq("active", true)
        .single();

      if (!itemData) {
        // Suggested item not found or inactive — skip straight to order submission
        onSkip();
        return;
      }

      setItem(itemData as { id: string; name: string; price: number });

      const { data: inserted } = await supabase
        .from("recommendation_events")
        .insert({
          restaurant_id: RESTAURANT_ID,
          session_id: getOrCreateSessionId(),
          table_id: null as string | null,
          pattern_type: "completion_nudge",
          item_shown: itemData.id,
          item_accepted: false,
          cart_value_at_show: cartValueAtShow,
        })
        .select("id")
        .single();

      if (inserted) setEventId(inserted.id);
      setReady(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!item) return;
    if (eventId) {
      await supabase
        .from("recommendation_events")
        .update({ item_accepted: true })
        .eq("id", eventId);
    }
    onAdd({ id: item.id, name: item.name, price: item.price, category: "", tags: [] });
  };

  const handleSkip = () => {
    // item_accepted stays false — no update needed
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
