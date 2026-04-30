// Types only — no hardcoded data.
// Menu items are loaded at runtime from Supabase via useMenu() in lib/menuStore.ts.

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  tags: string[];
}

export interface OrderItem extends MenuItem {
  quantity: number;
}
