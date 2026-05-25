import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MenuItem, OrderItem } from "@/data/menu";

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface ChefsPickRow {
  priority: number;
  id: string;
  name: string;
  price: number;
}

interface ChefsPicksProps {
  order: OrderItem[];
  onAddToCart: (item: MenuItem) => void;
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

const ChefsPicks = ({ order, onAddToCart }: ChefsPicksProps) => {
  const [picks, setPicks] = useState<ChefsPickRow[]>([]);
  // Maps item.id → recommendation_events.id so we can flip item_accepted on Add
  const eventIds = useRef<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from("anchor_items")
      .select("priority, menu_items!inner(id, name, price)")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("anchor_type", "chef_pick")
      .eq("active", true)
      .order("priority", { ascending: false })
      .limit(5)
      .then(async ({ data }) => {
        if (!data) return;
        const rows: ChefsPickRow[] = data.map((row) => {
          const mi = row.menu_items as { id: string; name: string; price: number };
          return { priority: row.priority, id: mi.id, name: mi.name, price: mi.price };
        });
        setPicks(rows);

        // Log one impression event per item shown
        const sessionId = getOrCreateSessionId();
        const cartValue = order.reduce((s, o) => s + o.price * o.quantity, 0);
        const inserts = rows.map((pick) => ({
          restaurant_id: RESTAURANT_ID,
          session_id: sessionId,
          table_id: null as string | null,
          pattern_type: "anchor_on_empty",
          item_shown: pick.id,
          item_accepted: false,
          cart_value_at_show: cartValue,
        }));

        const { data: inserted } = await supabase
          .from("recommendation_events")
          .insert(inserts)
          .select("id, item_shown");

        if (inserted) {
          const map: Record<string, string> = {};
          for (const ev of inserted) {
            if (ev.item_shown) map[ev.item_shown] = ev.id;
          }
          eventIds.current = map;
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (pick: ChefsPickRow) => {
    const evId = eventIds.current[pick.id];
    if (evId) {
      await supabase
        .from("recommendation_events")
        .update({ item_accepted: true })
        .eq("id", evId);
    }
    onAddToCart({
      id: pick.id,
      name: pick.name,
      price: pick.price,
      category: "",
      tags: [],
    });
  };

  if (order.length > 0 || picks.length === 0) return null;

  return (
    <div className="px-3 pt-3 pb-1">
      <p className="font-display text-[10px] tracking-[0.25em] uppercase text-primary font-semibold mb-2">
        Chef's Picks
      </p>
      <div className="flex flex-col gap-2">
        {picks.map((pick) => (
          <div
            key={pick.id}
            className="flex items-center justify-between px-3 py-2.5 border border-border bg-card"
          >
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold text-foreground truncate">
                {pick.name}
              </p>
              <p className="font-display text-xs font-bold text-primary mt-0.5">
                ₹{pick.price}
              </p>
            </div>
            <button
              onClick={() => handleAdd(pick)}
              className="flex-shrink-0 px-3 py-1.5 border border-primary/40 text-primary font-display text-[10px] font-semibold tracking-widest uppercase cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all"
            >
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChefsPicks;
