import { describe, it, expect } from "vitest";
import { formatMenuFacts } from "@/lib/menuFacts";

describe("formatMenuFacts", () => {
  it("returns nothing for undefined facts", () => {
    expect(formatMenuFacts(undefined)).toEqual([]);
  });

  it("formats every recognized key and skips unrecognized ones", () => {
    const rows = formatMenuFacts({
      prep_minutes: 10,
      calories_kcal: 320,
      spice_level: "medium",
      best_time: "Breakfast, brunch",
      origin_country: "USA",
      allergens: ["dairy", "gluten"],
      ingredients: ["sourdough", "avocado"],
      notes: "contains raw egg",
      some_future_key: "should be ignored",
    });
    expect(rows).toEqual([
      { label: "Prep time", value: "10 min" },
      { label: "Calories", value: "320 kcal" },
      { label: "Spice level", value: "Medium" },
      { label: "Best enjoyed", value: "Breakfast, brunch" },
      { label: "Origin", value: "USA" },
      { label: "Allergens", value: "Dairy, Gluten" },
      { label: "Ingredients", value: "Sourdough, Avocado" },
      { label: "Note", value: "contains raw egg" },
    ]);
  });

  it("skips a key present with the wrong type instead of rendering garbage", () => {
    expect(formatMenuFacts({ prep_minutes: "ten", allergens: "dairy" })).toEqual([]);
  });
});
