// Types only — no hardcoded data.
// Menu items are loaded at runtime from Supabase via useMenu() in lib/menuStore.ts.

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  tags: string[];
  is_veg: boolean;
  description?: string;
  image?: string;
  /** From menu_items.facts.prep_minutes (migration 0072) — undefined when
   *  the venue hasn't set it. Its own field (not read off `facts` below)
   *  because real logic — the kiosk order ETA — depends on it as a number. */
  prepMinutes?: number;
  /** Raw menu_items.facts (migration 0072) — calories_kcal, allergens,
   *  spice_level, ingredients, best_time, origin_country, notes, etc. Kept
   *  as a passthrough rather than a typed field per key: `facts` is
   *  intentionally schema-less so a venue can add a new fact key without a
   *  migration (see 0072's own comment) — flattening every key into
   *  MenuItem would fight that. lib/menuFacts.ts formats it for display. */
  facts?: Record<string, unknown>;
}

export interface OrderItem extends MenuItem {
  quantity: number;
}
