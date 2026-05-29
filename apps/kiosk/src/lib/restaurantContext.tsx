import { createContext, useContext, useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

interface RestaurantCtx {
  restaurantId: string;
  tableId: string;
  voiceEnabled: boolean;
  isTreatment: boolean;
}

const RestaurantContext = createContext<RestaurantCtx>({
  restaurantId: "",
  tableId: "",
  voiceEnabled: true,
  isTreatment: false,
});

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const restaurantId = import.meta.env.VITE_RESTAURANT_ID as string;
  const tableId = import.meta.env.VITE_TABLE_ID as string;

  // voiceEnabled defaults true to avoid flash of no-voice before flag loads.
  // isTreatment defaults false — safer for A/B integrity on fetch failure.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isTreatment, setIsTreatment] = useState(false);

  useEffect(() => {
    if (!restaurantId || !hasSupabaseConfig) return;

    Promise.all([
      supabase
        .from("restaurants")
        .select("config")
        .eq("id", restaurantId)
        .single(),
      tableId
        ? supabase
            .from("restaurant_tables")
            .select("is_treatment")
            .eq("restaurant_id", restaurantId)
            .eq("table_number", tableId)
            .single()
        : Promise.resolve({ data: null }),
    ]).then(([restaurantRes, tableRes]) => {
      if (restaurantRes.data?.config && typeof restaurantRes.data.config === "object") {
        const cfg = restaurantRes.data.config as Record<string, unknown>;
        if ("voice_enabled" in cfg) {
          setVoiceEnabled(Boolean(cfg.voice_enabled));
        }
      }
      // Any fetch error → stays false (control behavior)
      setIsTreatment(Boolean((tableRes as { data: { is_treatment?: boolean } | null }).data?.is_treatment ?? false));
    });
  }, [restaurantId, tableId]);

  return (
    <RestaurantContext.Provider value={{ restaurantId, tableId, voiceEnabled, isTreatment }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}
