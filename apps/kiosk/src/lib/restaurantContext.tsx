import { createContext, useContext, useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

interface RestaurantCtx {
  restaurantId: string;
  tableId: string;
  voiceEnabled: boolean;
  promptForIdentity: boolean;
  venueName: string;
}

const RestaurantContext = createContext<RestaurantCtx>({
  restaurantId: "",
  tableId: "",
  voiceEnabled: true,
  promptForIdentity: false,
  venueName: "",
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
        }
      });
  }, [restaurantId]);

  return (
    <RestaurantContext.Provider value={{ restaurantId, tableId, voiceEnabled, promptForIdentity, venueName }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}
