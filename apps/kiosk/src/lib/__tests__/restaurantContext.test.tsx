import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// restaurantContext fires two queries on mount:
//   from("restaurants").select("name, config").eq(...).single()
//   from("restaurant_settings").select("value").eq(...).or(...).order(...).limit(1).maybeSingle()
// Only the first carries the About-screen config we care about here.
vi.mock("@/integrations/supabase/client", () => {
  const restaurantsChain = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              name: "Silver Specialty Coffee",
              config: {
                voice_enabled: true,
                hours: "11 AM - 11 PM, every day",
                chef_name: "Rohit Nair",
                chef_note: "Small batches, lever machine.",
              },
            },
            error: null,
          }),
      }),
    }),
  };
  const settingsChain = {
    select: () => ({
      eq: () => ({
        or: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
  return {
    hasSupabaseConfig: true,
    supabase: {
      from: (table: string) =>
        table === "restaurants" ? restaurantsChain : settingsChain,
    },
  };
});

import { RestaurantProvider, useRestaurant } from "@/lib/restaurantContext";

function Probe() {
  const r = useRestaurant();
  return (
    <span data-testid="v">
      {r.hours}|{r.chefName}|{r.chefNote}
    </span>
  );
}

describe("restaurantContext — About-screen config", () => {
  it("exposes hours, chefName and chefNote from restaurants.config", async () => {
    render(
      <RestaurantProvider>
        <Probe />
      </RestaurantProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("v").textContent).toBe(
        "11 AM - 11 PM, every day|Rohit Nair|Small batches, lever machine.",
      ),
    );
  });
});
