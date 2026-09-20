import { createContext, useContext, useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import { DEFAULT_GST_RATE_PERCENT } from "@/lib/pricing";

export type Ad = { id: string; image_url: string; title: string | null };

interface RestaurantCtx {
  restaurantId: string;
  tableId: string;
  voiceEnabled: boolean;
  promptForIdentity: boolean;
  venueName: string;
  ads: Ad[];
  hours: string;
  chefName: string;
  chefNote: string;
  gstRatePercent: number;
}

const RestaurantContext = createContext<RestaurantCtx>({
  restaurantId: "",
  tableId: "",
  voiceEnabled: true,
  promptForIdentity: false,
  venueName: "",
  ads: [],
  hours: "",
  chefName: "",
  chefNote: "",
  gstRatePercent: DEFAULT_GST_RATE_PERCENT,
});

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const restaurantId = import.meta.env.VITE_RESTAURANT_ID as string;
  const tableId = import.meta.env.VITE_TABLE_ID as string;

  // voiceEnabled defaults true to avoid flash of no-voice before flag loads.
  // promptForIdentity defaults false — restaurants without the flag set
  // should go straight to menu, same as before this feature existed.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [promptForIdentity, setPromptForIdentity] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [ads, setAds] = useState<Ad[]>([]);
  const [hours, setHours] = useState("");
  const [chefName, setChefName] = useState("");
  const [chefNote, setChefNote] = useState("");
  // Defaults to DEFAULT_GST_RATE_PERCENT (5) to avoid a flash of 0% tax
  // before the fetch resolves, same reasoning as voiceEnabled above — not
  // a fallback path, just the pre-load display value.
  const [gstRatePercent, setGstRatePercent] = useState(DEFAULT_GST_RATE_PERCENT);

  useEffect(() => {
    if (!restaurantId || !hasSupabaseConfig) return;

    supabase
      .from("restaurants")
      .select("name, config")
      .eq("id", restaurantId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("[RestaurantProvider] Failed to load restaurant config:", error.message);
          return;
        }
        if (data?.name) {
          setVenueName(data.name);
        }
        if (data?.config && typeof data.config === "object") {
          const cfg = data.config as Record<string, unknown>;
          if ("voice_enabled" in cfg) {
            setVoiceEnabled(Boolean(cfg.voice_enabled));
          }
          if ("prompt_for_identity" in cfg) {
            setPromptForIdentity(Boolean(cfg.prompt_for_identity));
          }
          if (typeof cfg.hours === "string") setHours(cfg.hours);
          if (typeof cfg.chef_name === "string") setChefName(cfg.chef_name);
          if (typeof cfg.chef_note === "string") setChefNote(cfg.chef_note);
        }
      });

    supabase
      .from("ads")
      .select("id, image_url, title")
      .eq("restaurant_id", restaurantId)
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) {
          console.error("[RestaurantProvider] Failed to load ads:", error.message);
          return;
        }
        if (data) setAds(data);
      });

    // restaurant_settings supports a per-restaurant override alongside a
    // global default (restaurant_id IS NULL) — see migration 0017's own
    // comment. Ordering by restaurant_id with nulls last picks the
    // override when one exists, the global default otherwise; matches
    // append_event's read of the same table (migration 0069) and
    // apps/pos's Billing.tsx display.
    supabase
      .from("restaurant_settings")
      .select("value")
      .eq("key", "gst_rate")
      .or(`restaurant_id.eq.${restaurantId},restaurant_id.is.null`)
      .order("restaurant_id", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[RestaurantProvider] Failed to load gst_rate:", error.message);
          return;
        }
        const parsed = data?.value ? Number(data.value) : NaN;
        if (Number.isFinite(parsed)) {
          setGstRatePercent(parsed);
        }
      });
  }, [restaurantId]);

  return (
    <RestaurantContext.Provider
      value={{ restaurantId, tableId, voiceEnabled, promptForIdentity, venueName, ads, hours, chefName, chefNote, gstRatePercent }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}
