import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MenuItem } from '@/data/menu';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

export interface PairedItem extends MenuItem {
  context: string | null;
  priority: number;
}

export interface AnchorItem extends MenuItem {
  itemId: string;
  anchorType: 'chef_pick' | 'bestseller' | 'new' | 'signature';
  priority: number;
}

export interface MenuState {
  items: MenuItem[];
  itemsByCategory: Record<string, MenuItem[]>;
  categories: string[];
  pairingsByItemId: Record<string, PairedItem[]>;
  anchors: AnchorItem[];
  loading: boolean;
  error: string | null;
}

export function useMenu(): MenuState {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [pairingsByItemId, setPairingsByItemId] = useState<Record<string, PairedItem[]>>({});
  const [anchors, setAnchors] = useState<AnchorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll() {
    const [menuRes, pairingsRes, anchorsRes] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, name, category, price, tags, is_veg')
        .eq('restaurant_id', RESTAURANT_ID)
        .eq('active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('item_pairings')
        .select('source_item_id, paired_item_id, priority, context')
        .eq('restaurant_id', RESTAURANT_ID),
      supabase
        .from('anchor_items')
        .select('item_id, anchor_type, priority')
        .eq('restaurant_id', RESTAURANT_ID)
        .eq('active', true)
        .order('priority', { ascending: false }),
    ]);

    if (menuRes.error) {
      setError('Menu unavailable, please ask staff');
      setLoading(false);
      return;
    }

    const mapped: MenuItem[] = (menuRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category ?? '',
      price: row.price ?? 0,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_veg: (row as any).is_veg ?? true,
    }));

    const itemMap = new Map(mapped.map((i) => [i.id, i]));

    const byItemId: Record<string, PairedItem[]> = {};
    for (const p of pairingsRes.data ?? []) {
      const paired = itemMap.get(p.paired_item_id);
      if (!paired) continue;
      if (!byItemId[p.source_item_id]) byItemId[p.source_item_id] = [];
      byItemId[p.source_item_id].push({ ...paired, context: p.context, priority: p.priority });
    }
    for (const key of Object.keys(byItemId)) {
      byItemId[key].sort((a, b) => b.priority - a.priority);
    }

    const anchorList: AnchorItem[] = (anchorsRes.data ?? [])
      .map((a) => {
        const item = itemMap.get(a.item_id);
        if (!item) return null;
        return {
          ...item,
          itemId: a.item_id,
          anchorType: a.anchor_type as AnchorItem['anchorType'],
          priority: a.priority,
        };
      })
      .filter((x): x is AnchorItem => x !== null);

    setItems(mapped);
    setPairingsByItemId(byItemId);
    setAnchors(anchorList);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();

    const channelName = `menu_realtime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchAll();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  // fetchAll is defined inside the hook; no stale-closure risk
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsByCategory: Record<string, MenuItem[]> = {};
  for (const item of items) {
    if (!itemsByCategory[item.category]) itemsByCategory[item.category] = [];
    itemsByCategory[item.category].push(item);
  }

  const categories = [...new Set(items.map((i) => i.category))];

  return { items, itemsByCategory, categories, pairingsByItemId, anchors, loading, error };
}
