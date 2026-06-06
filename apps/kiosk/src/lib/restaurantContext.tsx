import { createContext, useContext, useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

interface RestaurantCtx {
  restaurantId: string;
  tableId: string;
  voiceEnabled: boolean;
  promptForIdentity: boolean;
}

const RestaurantContext = createContext<RestaurantCtx>({
  restaurantId: "",
  tableId: "",
  voiceEnabled: true,
  promptForIdentity: false,
});

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const restaurantId = import.meta.env.VITE_RESTAURANT_ID as string;
  const tableId = import.meta.env.VITE_TABLE_ID as string;

  // voiceEnabled defaults true to avoid flash of no-voice before flag loads.
  // promptForIdentity defaults false — restaurants without the flag set
  // should go straight to menu, same as before this feature existed.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [promptForIdentity, setPromptForIdentity] = useState(false);

  useEffect(() => {
    if (!restaurantId || !hasSupabaseConfig) return;

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
          if ("prompt_for_identity" in cfg) {
            setPromptForIdentity(Boolean(cfg.prompt_for_identity));
          }
        }
      });
  }, [restaurantId]);

  return (
    <RestaurantContext.Provider value={{ restaurantId, tableId, voiceEnabled, promptForIdentity }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}
