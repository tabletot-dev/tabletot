import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

export type KotStatus = "accepted" | "preparing" | "ready" | "archived" | "cancelled";

export interface KotItem {
  id: string;
  name: string;
  qty: number;
}

export interface KotTicket {
  id: string;
  status: KotStatus;
  items: KotItem[];
  createdAt: string;
}

// The kitchen never reports a per-ticket "served" — that's a front-of-house
// action on the order as a whole (useKitchenStatus). Cooking is done once
// the ticket is ready or archived (settled).
export const KOT_ACTIVE: KotStatus[] = ["accepted", "preparing"];

function mapRow(row: {
  id: string;
  status: string;
  items: unknown;
  created_at: string;
}): KotTicket {
  const items = Array.isArray(row.items)
    ? (row.items as Array<{ id?: string; name?: string; qty?: number }>)
        .filter((i) => i && typeof i.id === "string" && typeof i.name === "string")
        .map((i) => ({ id: i.id as string, name: i.name as string, qty: i.qty ?? 1 }))
    : [];
  return { id: row.id, status: row.status as KotStatus, items, createdAt: row.created_at };
}

/**
 * Every kitchen ticket (one per "Order more" round) for the live order, in
 * the order they were sent — lets the Waiting screen show "1st order ·
 * Cooking / 2nd order · Received" instead of one blended item count
 * (2026-09-28 UX audit finding: "1 item vs 2 items" was confusing when two
 * rounds were at different stages).
 */
export function useKotTickets(orderId: string | null): KotTicket[] {
  const [tickets, setTickets] = useState<KotTicket[]>([]);

  useEffect(() => {
    if (!orderId || !hasSupabaseConfig) {
      setTickets([]);
      return;
    }
    let cancelled = false;

    const load = () => {
      supabase
        .from("kot_tickets")
        .select("id, status, items, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (!cancelled && data) setTickets(data.map(mapRow));
        });
    };
    load();

    // ponytail: reload the small per-order list on any change rather than
    // patch individual rows in place — a handful of tickets per table, and
    // a full refetch can't drift out of sync with a partial merge.
    const channel = supabase
      .channel(`kot-tickets-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kot_tickets", filter: `order_id=eq.${orderId}` },
        load,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  return tickets;
}
