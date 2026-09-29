import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RESTAURANT_ID } from '@/lib/restaurant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const VOICE_ENGINE_URL = (import.meta.env.VITE_VOICE_ENGINE_URL as string | undefined) || '';
const VOICE_ADMIN_KEY = (import.meta.env.VITE_VOICE_ADMIN_KEY as string | undefined) || '';

// Tells the voice engine to reload the menu, so a sold-out dish can't still be
// ordered by voice until its next background refresh. Failure is surfaced.
function refreshVoiceMenu() {
  if (!VOICE_ENGINE_URL) return;
  fetch(`${VOICE_ENGINE_URL}/admin/refresh-menu`, {
    method: 'POST',
    headers: VOICE_ADMIN_KEY ? { 'X-Admin-Key': VOICE_ADMIN_KEY } : {},
  })
    .then((res) => {
      if (!res.ok) toast({ variant: 'destructive', title: 'Voice menu refresh failed', description: `Voice engine returned ${res.status}. Voice ordering may still offer this dish for a few minutes.` });
    })
    .catch(() => toast({ variant: 'destructive', title: 'Voice menu refresh unreachable', description: 'Voice ordering may still offer this dish for a few minutes.' }));
}

interface Dish { id: string; name: string; category: string | null; active: boolean }

// Menu editing lives in the dashboard (ADR 0025). The POS only flips a dish
// on or off mid-service — the same `active` field the dashboard edits.
export default function SoldOut() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchDishes = async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, category, active')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('name');
    if (error) toast({ variant: 'destructive', title: 'Error', description: 'Failed to load menu.' });
    if (data) setDishes(data);
    setLoading(false);
  };

  useEffect(() => { fetchDishes(); }, []);

  const setActive = async (d: Dish, active: boolean) => {
    const { error } = await supabase.from('menu_items').update({ active }).eq('id', d.id);
    if (error) { toast({ variant: 'destructive', title: 'Update failed', description: error.message }); return; }
    refreshVoiceMenu();
    fetchDishes();
  };

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const by: Record<string, Dish[]> = {};
    for (const d of dishes) if (!q || d.name.toLowerCase().includes(q)) (by[d.category ?? 'Uncategorised'] ??= []).push(d);
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [dishes, search]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Sold out</h1>
        <p className="text-muted-foreground mt-1">
          Switch a dish off when it runs out — it disappears from the kiosk straight away. Switch it back on when it's available again.
          Prices, photos and everything else are edited in the dashboard.
        </p>
      </div>
      <Input placeholder="Search dishes" value={search} onChange={(e) => setSearch(e.target.value)} />
      {grouped.map(([category, list]) => (
        <Card key={category}>
          <CardHeader><CardTitle>{category}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {list.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <span className={d.active ? 'font-medium' : 'text-muted-foreground line-through'}>{d.name}</span>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {d.active ? 'Available' : 'Sold out'}
                  <Switch checked={d.active} onCheckedChange={(v) => setActive(d, v)} aria-label={`${d.name} available`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {grouped.length === 0 && <p className="text-muted-foreground">No dishes found.</p>}
    </div>
  );
}
