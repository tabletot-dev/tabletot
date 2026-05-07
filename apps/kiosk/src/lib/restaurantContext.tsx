import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RestaurantCtx {
  restaurantId: string;
  tableId: string;
  voiceEnabled: boolean;
}

const RestaurantContext = createContext<RestaurantCtx>({
  restaurantId: "",
  tableId: "",
  voiceEnabled: true,
});

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const restaurantId = import.meta.env.VITE_RESTAURANT_ID as string;
  const tableId = import.meta.env.VITE_TABLE_ID as string;

  // Default true so voice appears before the flag loads (avoids flash of no-voice).
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from("restaurants")
      .select("config")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        if (data?.config && typeof data.config === "object") {
          const cfg = data.config as Record<string, unknown>;
          if ("voice_enabled" in cfg) {
            setVoiceEnabled(Boolean(cfg.voice_enabled));
          }
        }
      });
  }, [restaurantId]);

  return (
    <RestaurantContext.Provider value={{ restaurantId, tableId, voiceEnabled }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}
