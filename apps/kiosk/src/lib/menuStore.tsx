import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { MenuItem } from '@/data/menu';
import { hydrateMenuItemImage } from '@/lib/menuImages';
import type { CompletionRule } from '@/lib/completionRules';
import { RESTAURANT_ID } from '@/lib/config';

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
  completionRules: CompletionRule[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const MenuContext = createContext<MenuState>({
  items: [],
  itemsByCategory: {},
  categories: [],
  pairingsByItemId: {},
  anchors: [],
  completionRules: [],
  loading: true,
  error: null,
  retry: () => {},
});

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [pairingsByItemId, setPairingsByItemId] = useState<Record<string, PairedItem[]>>({});
  const [anchors, setAnchors] = useState<AnchorItem[]>([]);
  const [completionRules, setCompletionRules] = useState<CompletionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Version counter prevents stale responses from overwriting newer state.
  const fetchVersionRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const version = ++fetchVersionRef.current;
    setLoading(true);
    try {
      const [menuRes, pairingsRes, anchorsRes, rulesRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name, category, price, tags, is_veg, image_url, description, facts')
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
        supabase
          .from('meal_completion_rules')
          .select('rule_name, condition, suggestion')
          .eq('restaurant_id', RESTAURANT_ID)
          .eq('active', true)
          .order('priority', { ascending: false }),
      ]);

      if (version !== fetchVersionRef.current) return;

      if (menuRes.error) {
        setError('Menu unavailable, please ask staff');
        return;
      }

      if (pairingsRes.error) console.error('[menuStore] pairings fetch failed:', pairingsRes.error);
      if (anchorsRes.error) console.error('[menuStore] anchors fetch failed:', anchorsRes.error);
      if (rulesRes.error) console.error('[menuStore] completion rules fetch failed:', rulesRes.error);

      const mapped: MenuItem[] = (menuRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? '',
        price: row.price ?? 0,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        is_veg: (row as any).is_veg ?? false,
        description: row.description ?? undefined,
        image: row.image_url ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prepMinutes: typeof (row as any).facts?.prep_minutes === 'number' ? (row as any).facts.prep_minutes : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        facts: ((row as any).facts && typeof (row as any).facts === 'object') ? (row as any).facts : undefined,
      })).map(hydrateMenuItemImage);

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
      setCompletionRules((rulesRes.data ?? []) as CompletionRule[]);
      setError(null);
    } catch (e) {
      if (version !== fetchVersionRef.current) return;
      console.error('[menuStore] fetchAll threw:', e);
      setError('Menu unavailable, please ask staff');
    } finally {
      if (version === fetchVersionRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    if (!hasSupabaseConfig || !RESTAURANT_ID) {
      return;
    }

    const channel = supabase
      .channel('menu_realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'menu_items',
        filter: `restaurant_id=eq.${RESTAURANT_ID}`,
      }, fetchAll)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'item_pairings',
        filter: `restaurant_id=eq.${RESTAURANT_ID}`,
      }, fetchAll)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'anchor_items',
        filter: `restaurant_id=eq.${RESTAURANT_ID}`,
      }, fetchAll)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'meal_completion_rules',
        filter: `restaurant_id=eq.${RESTAURANT_ID}`,
      }, fetchAll)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchAll]);

  const itemsByCategory = useMemo(() => {
    const acc: Record<string, MenuItem[]> = {};
    for (const item of items) {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
    }
    return acc;
  }, [items]);

  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  const value = useMemo<MenuState>(
    () => ({ items, itemsByCategory, categories, pairingsByItemId, anchors, completionRules, loading, error, retry: fetchAll }),
    [items, itemsByCategory, categories, pairingsByItemId, anchors, completionRules, loading, error, fetchAll],
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu(): MenuState {
  return useContext(MenuContext);
}
