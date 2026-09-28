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
   *  the venue hasn't set it. */
  prepMinutes?: number;
}

export interface OrderItem extends MenuItem {
  quantity: number;
}
