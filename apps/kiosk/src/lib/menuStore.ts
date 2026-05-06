import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MenuItem } from '@/data/menu';

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

export interface MenuState {
  items: MenuItem[];
  itemsByCategory: Record<string, MenuItem[]>;
  categories: string[];
  loading: boolean;
  error: string | null;
}

export function useMenu(): MenuState {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchItems() {
    const { data, error: fetchError } = await supabase
      .from('menu_items')
      .select('id, name, category, price, tags')
      .eq('restaurant_id', RESTAURANT_ID)
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (fetchError) {
      setError('Menu unavailable, please ask staff');
      setLoading(false);
      return;
    }

    const mapped: MenuItem[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category ?? '',
      price: row.price ?? 0,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    }));

    setItems(mapped);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    fetchItems();

    const channelName = `menu_items_realtime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        () => { fetchItems(); }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  // fetchItems is defined inside the effect scope; no stale-closure risk
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsByCategory: Record<string, MenuItem[]> = {};
  for (const item of items) {
    if (!itemsByCategory[item.category]) itemsByCategory[item.category] = [];
    itemsByCategory[item.category].push(item);
  }

  // Preserve DB order (category ASC) — Set iteration preserves insertion order
  const categories = [...new Set(items.map((i) => i.category))];

  return { items, itemsByCategory, categories, loading, error };
}
