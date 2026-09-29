// Formats menu_items.facts (migration 0072, schema-less jsonb) into display
// rows for the dish-detail screen. Recognizes a known set of keys and skips
// anything else — a venue can add a new key any time without a code change;
// it just won't render here until a label is added below.
//
// Documented in 0072: calories_kcal, allergens, spice_level, prep_minutes,
// ingredients, notes. Added here (2026-09-29, no migration needed — same
// open schema): best_time, origin_country.

export interface FactRow {
  label: string;
  value: string;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function asStringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const strs = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return strs.length > 0 ? strs : null;
}

export function formatMenuFacts(facts: Record<string, unknown> | undefined): FactRow[] {
  if (!facts) return [];
  const rows: FactRow[] = [];

  if (typeof facts.prep_minutes === "number") {
    rows.push({ label: "Prep time", value: `${facts.prep_minutes} min` });
  }
  if (typeof facts.calories_kcal === "number") {
    rows.push({ label: "Calories", value: `${facts.calories_kcal} kcal` });
  }
  if (typeof facts.spice_level === "string" && facts.spice_level.trim()) {
    rows.push({ label: "Spice level", value: titleCase(facts.spice_level) });
  }
  if (typeof facts.best_time === "string" && facts.best_time.trim()) {
    rows.push({ label: "Best enjoyed", value: facts.best_time });
  }
  if (typeof facts.origin_country === "string" && facts.origin_country.trim()) {
    rows.push({ label: "Origin", value: facts.origin_country });
  }
  const allergens = asStringList(facts.allergens);
  if (allergens) {
    rows.push({ label: "Allergens", value: allergens.map(titleCase).join(", ") });
  }
  const ingredients = asStringList(facts.ingredients);
  if (ingredients) {
    rows.push({ label: "Ingredients", value: ingredients.map(titleCase).join(", ") });
  }
  if (typeof facts.notes === "string" && facts.notes.trim()) {
    rows.push({ label: "Note", value: facts.notes });
  }

  return rows;
}
