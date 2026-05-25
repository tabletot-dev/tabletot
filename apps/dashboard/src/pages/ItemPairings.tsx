import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGate } from '@/components/FeatureGate';

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface MenuItemOption { id: string; name: string; }
interface PairingRow {
  id: string;
  source_item_id: string;
  source_name: string;
  paired_item_id: string;
  paired_name: string;
  priority: number;
  context: string | null;
}

export default function ItemPairings() {
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [pairings, setPairings] = useState<PairingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [adding, setAdding] = useState(false);

  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase
      .from('menu_items')
      .select('id, name')
      .eq('restaurant_id', RESTAURANT_ID)
      .eq('active', true)
      .order('name');
    if (data) setMenuItems(data as MenuItemOption[]);
  }, []);

  const fetchPairings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('item_pairings')
      .select('id, source_item_id, paired_item_id, priority, context, source:menu_items!item_pairings_source_item_id_fkey(name), paired:menu_items!item_pairings_paired_item_id_fkey(name)')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('priority', { ascending: false });
    if (error) toast.error('Error loading pairings');
    if (data) {
      setPairings(data.map((r) => ({
        id: r.id,
        source_item_id: r.source_item_id ?? '',
        source_name: (r.source as { name: string } | null)?.name ?? '—',
        paired_item_id: r.paired_item_id ?? '',
        paired_name: (r.paired as { name: string } | null)?.name ?? '—',
        priority: r.priority ?? 0,
        context: r.context,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMenuItems();
    fetchPairings();
  }, [fetchMenuItems, fetchPairings]);

  const addPairing = async () => {
    if (!newSource || !newTarget || newSource === newTarget) {
      toast.error('Select two different items');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('item_pairings').insert({
      restaurant_id: RESTAURANT_ID,
      source_item_id: newSource,
      paired_item_id: newTarget,
      priority: newPriority,
    });
    if (error) toast.error('Failed to add pairing: ' + error.message);
    else { toast.success('Pairing added'); setNewSource(''); setNewTarget(''); setNewPriority(0); }
    setAdding(false);
    fetchPairings();
  };

  const deletePairing = async (id: string) => {
    const { error } = await supabase.from('item_pairings').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else fetchPairings();
  };

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Item Pairings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            When a customer adds item A, suggest item B as a pairing nudge.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Current Pairings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead />
                    <TableHead>Paired with</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                        No pairings yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {pairings.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.source_name}</TableCell>
                      <TableCell className="text-muted-foreground">→</TableCell>
                      <TableCell>{row.paired_name}</TableCell>
                      <TableCell><Badge variant="secondary">{row.priority}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deletePairing(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
              <Select value={newSource} onValueChange={setNewSource}>
                <SelectTrigger className="flex-1 min-w-[160px]">
                  <SelectValue placeholder="Source item…" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((mi) => (
                    <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">→</span>
              <Select value={newTarget} onValueChange={setNewTarget}>
                <SelectTrigger className="flex-1 min-w-[160px]">
                  <SelectValue placeholder="Paired with…" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((mi) => (
                    <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="w-20"
                placeholder="Priority"
                value={newPriority}
                onChange={(e) => setNewPriority(Number(e.target.value))}
              />
              <Button onClick={addPairing} disabled={adding || !newSource || !newTarget}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </FeatureGate>
  );
}
