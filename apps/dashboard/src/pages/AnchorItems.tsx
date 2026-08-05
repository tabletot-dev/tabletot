import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGate } from '@/components/FeatureGate';

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface MenuItemOption { id: string; name: string; }
interface AnchorRow {
  id: string;
  item_id: string;
  item_name: string;
  anchor_type: string;
  priority: number;
  active: boolean;
}

const ANCHOR_TYPES = ['chef_pick', 'bestseller', 'new', 'signature'] as const;

export default function AnchorItems() {
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemId, setNewItemId] = useState('');
  const [newType, setNewType] = useState<string>('chef_pick');
  const [adding, setAdding] = useState(false);

  const fetchMenuItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name')
      .eq('restaurant_id', RESTAURANT_ID)
      .eq('active', true)
      .order('name');
    if (error) toast.error('Error loading menu items');
    if (data) setMenuItems(data as MenuItemOption[]);
  }, []);

  const fetchAnchors = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('anchor_items')
      .select('id, item_id, anchor_type, priority, active, menu_items(name)')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('priority', { ascending: false });
    if (error) toast.error('Error loading anchor items');
    if (data) {
      setAnchors(data.map((r) => ({
        id: r.id,
        item_id: r.item_id ?? '',
        item_name: (r.menu_items as { name: string } | null)?.name ?? '—',
        anchor_type: r.anchor_type ?? 'chef_pick',
        priority: r.priority ?? 0,
        active: r.active ?? true,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMenuItems();
    fetchAnchors();
  }, [fetchMenuItems, fetchAnchors]);

  const addAnchor = async () => {
    if (!newItemId) return;
    setAdding(true);
    const maxPriority = anchors.reduce((m, a) => Math.max(m, a.priority), 0);
    const { error } = await supabase.from('anchor_items').insert({
      restaurant_id: RESTAURANT_ID,
      item_id: newItemId,
      anchor_type: newType,
      priority: maxPriority + 1,
      active: true,
    });
    if (error) toast.error('Failed to add anchor item: ' + error.message);
    else { toast.success('Anchor item added'); setNewItemId(''); }
    setAdding(false);
    fetchAnchors();
  };

  const updateAnchorType = async (id: string, anchor_type: string) => {
    const { error } = await supabase.from('anchor_items').update({ anchor_type }).eq('id', id);
    if (error) toast.error('Update failed');
    else fetchAnchors();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from('anchor_items').update({ active }).eq('id', id);
    if (error) toast.error('Update failed');
    else fetchAnchors();
  };

  const deleteAnchor = async (id: string) => {
    if (!confirm('Delete this anchor item?')) return;
    const { error } = await supabase.from('anchor_items').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else fetchAnchors();
  };

  const movePriority = async (id: string, direction: 'up' | 'down') => {
    const idx = anchors.findIndex((a) => a.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= anchors.length) return;
    const a = anchors[idx];
    const b = anchors[swapIdx];
    // Neither result was checked before — a partial failure (one write lands,
    // one doesn't) left two anchors sharing a priority, after which the
    // up/down buttons swap equal values and appear dead with no error shown.
    const [resA, resB] = await Promise.all([
      supabase.from('anchor_items').update({ priority: b.priority }).eq('id', a.id),
      supabase.from('anchor_items').update({ priority: a.priority }).eq('id', b.id),
    ]);
    if (resA.error || resB.error) {
      toast.error('Failed to reorder — priorities may be out of sync, reloading current state.');
    }
    fetchAnchors();
  };

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Anchor Items</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Chef's picks and featured items shown to customers on an empty cart.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Current Anchors</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anchors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                        No anchor items yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {anchors.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.item_name}</TableCell>
                      <TableCell>
                        <Select value={row.anchor_type} onValueChange={(v) => updateAnchorType(row.id, v)}>
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ANCHOR_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => movePriority(row.id, 'up')}>
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm">{row.priority}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === anchors.length - 1} onClick={() => movePriority(row.id, 'down')}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.active} onCheckedChange={(v) => toggleActive(row.id, v)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteAnchor(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex items-center gap-2 pt-2 border-t">
              <Select value={newItemId} onValueChange={setNewItemId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select menu item…" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((mi) => (
                    <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANCHOR_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addAnchor} disabled={adding || !newItemId}>
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
