import { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

export type KitchenStatus = "new" | "preparing" | "ready" | "served" | "unknown";

export interface KitchenStage {
  label: string;
  index: number;
}

// Index into the four-stage strip (Received · Cooking · Ready · Served).
export const STATUS_STAGE: Record<KitchenStatus, KitchenStage> = {
  new:       { label: "Received", index: 0 },
  preparing: { label: "Cooking",  index: 1 },
  ready:     { label: "Ready",    index: 2 },
  served:    { label: "Served",   index: 3 },
  unknown:   { label: "Received", index: 0 },
};

export const STAGE_LABELS = ["Received", "Cooking", "Ready", "Served"];

/**
 * Subscribes to `orders.status` for the live order and returns the current
 * kitchen stage. Extracted from WaitingView so ScreensaverOverlay can watch
 * the same signal (to auto-dismiss on Ready and show a status strip) without
 * a second, drifting copy of the subscription.
 */
export function useKitchenStatus(orderId: string | null): KitchenStatus {
  const [status, setStatus] = useState<KitchenStatus>("unknown");

  useEffect(() => {
    if (!orderId || !hasSupabaseConfig) return;

    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          const next = (payload.new as { status?: string }).status;
          if (next && next in STATUS_STAGE) setStatus(next as KitchenStatus);
        },
      )
      .subscribe();

    supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single()
      .then(({ data }) => {
        if (data?.status && data.status in STATUS_STAGE) setStatus(data.status as KitchenStatus);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  return status;
}
