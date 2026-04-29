import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MenuItem, OrderItem } from "@/data/menu";

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

const ChefsPicks = ({ order, onAddToCart }: ChefsPicksProps) => {
  const [picks, setPicks] = useState<ChefsPickRow[]>([]);

  useEffect(() => {
    supabase
      .from("anchor_items")
      .select("priority, menu_items!inner(id, name, price)")
      .eq("anchor_type", "chef_pick")
      .eq("active", true)
      .order("priority", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!data) return;
        setPicks(
          data.map((row) => {
            const mi = row.menu_items as { id: string; name: string; price: number };
            return { priority: row.priority, id: mi.id, name: mi.name, price: mi.price };
          })
        );
      });
  }, []);

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
              onClick={() =>
                onAddToCart({
                  id: pick.id,
                  name: pick.name,
                  price: pick.price,
                  description: "",
                  image: "",
                  category: "",
                })
              }
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
