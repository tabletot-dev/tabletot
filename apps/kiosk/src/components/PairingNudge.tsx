import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MenuItem } from "@/data/menu";

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface PairedItem {
  id: string;
  name: string;
  price: number;
}

interface PairingNudgeProps {
  addedItemId: string;
  addedItemName: string;
  cartValueAtShow: number;
  onAddPairing: (item: MenuItem) => void;
  onDismiss: () => void;
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

const NUDGE_TTL_MS = 8000;

const PairingNudge = ({
  addedItemId,
  addedItemName,
  cartValueAtShow,
  onAddPairing,
  onDismiss,
}: PairingNudgeProps) => {
  const [pairing, setPairing] = useState<PairedItem | null | undefined>(undefined);
  // undefined = loading, null = no pairings found, PairedItem = show nudge
  const eventIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPairing(undefined);
    eventIdRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);

    supabase
      .from("item_pairings")
      .select("priority, menu_items!item_pairings_paired_item_id_fkey(id, name, price)")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("source_item_id", addedItemId)
      .eq("menu_items.active", true)
      .order("priority", { ascending: false })
      .limit(2)
      .then(async ({ data }) => {
        if (!data || data.length === 0) {
          setPairing(null);
          return;
        }

        // Take highest-priority row that has a valid joined menu_item
        const row = data.find((r) => r.menu_items !== null);
        if (!row || !row.menu_items) {
          setPairing(null);
          return;
        }

        const mi = row.menu_items as { id: string; name: string; price: number };
        const pick: PairedItem = { id: mi.id, name: mi.name, price: mi.price };
        setPairing(pick);

        // Log impression event
        const { data: inserted } = await supabase
          .from("recommendation_events")
          .insert({
            restaurant_id: RESTAURANT_ID,
            session_id: getOrCreateSessionId(),
            table_id: null as string | null,
            pattern_type: "post_add_pairing",
            item_shown: pick.id,
            item_accepted: false,
            cart_value_at_show: cartValueAtShow,
          })
          .select("id")
          .single();

        if (inserted) {
          eventIdRef.current = inserted.id;
        }

        // Auto-dismiss after TTL
        timerRef.current = setTimeout(() => {
          onDismiss();
        }, NUDGE_TTL_MS);
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedItemId]);

  if (pairing === undefined || pairing === null) return null;

  const handleAdd = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (eventIdRef.current) {
      await supabase
        .from("recommendation_events")
        .update({ item_accepted: true })
        .eq("id", eventIdRef.current);
    }
    onAddPairing({
      id: pairing.id,
      name: pairing.name,
      price: pairing.price,
      category: "",
      tags: [],
    });
  };

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // event already logged as item_accepted=false on insert; no update needed
    onDismiss();
  };

  return (
    <div className="mx-3 mb-2 flex items-center justify-between gap-2 px-3 py-2 border border-primary/30 bg-primary/5">
      <p className="font-display text-[11px] text-foreground flex-1 min-w-0 truncate">
        <span className="text-muted-foreground">Goes well with </span>
        <span className="font-semibold">{pairing.name}</span>
      </p>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={handleAdd}
          className="px-2.5 py-1 border border-primary/50 text-primary font-display text-[10px] font-semibold tracking-widest uppercase cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all"
        >
          Add ₹{pairing.price}
        </button>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default PairingNudge;
