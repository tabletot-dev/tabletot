import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ─── local types ────────────────────────────────────────────────────────────

interface MenuItemOption {
  id: string;
  name: string;
}

interface AnchorRow {
  id: string;
  item_id: string;
  item_name: string;
  anchor_type: string;
  priority: number;
  active: boolean;
}

interface PairingRow {
  id: string;
  source_item_id: string;
  source_name: string;
  paired_item_id: string;
  paired_name: string;
  priority: number;
  context: string | null;
}

interface MealRuleRow {
  id: string;
  rule_name: string;
  priority: number | null;
  active: boolean | null;
  condition: unknown;
  suggestion: unknown;
}

interface AovLiftRow {
  pattern_type: string | null;
  total_shown: number | null;
  accepted: number | null;
  acceptance_rate_pct: number | null;
  avg_cart_when_accepted: number | null;
  avg_cart_when_rejected: number | null;
  aov_lift_estimate: number | null;
}

const ANCHOR_TYPES = ['chef_pick', 'bestseller', 'new', 'signature'] as const;

// ─── page ────────────────────────────────────────────────────────────────────

export default function RecommendationCuration() {
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);

  // Section 1
  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [anchorsLoading, setAnchorsLoading] = useState(true);
  const [newAnchorItemId, setNewAnchorItemId] = useState('');
  const [newAnchorType, setNewAnchorType] = useState<string>('chef_pick');
  const [addingAnchor, setAddingAnchor] = useState(false);

  // Section 2
  const [pairings, setPairings] = useState<PairingRow[]>([]);
  const [pairingsLoading, setPairingsLoading] = useState(true);
  const [newPairSource, setNewPairSource] = useState('');
  const [newPairTarget, setNewPairTarget] = useState('');
  const [newPairPriority, setNewPairPriority] = useState(0);
  const [addingPairing, setAddingPairing] = useState(false);

  // Section 3
  const [mealRules, setMealRules] = useState<MealRuleRow[]>([]);
  const [mealRulesLoading, setMealRulesLoading] = useState(true);

  // Section 4 — Measurement
  const [aovRows, setAovRows] = useState<AovLiftRow[]>([]);
  const [aovLoading, setAovLoading] = useState(true);

  // ── fetch helpers ────────────────────────────────────────────────────────

  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase
      .from('menu_items')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setMenuItems(data as MenuItemOption[]);
  }, []);

  const fetchAnchors = useCallback(async () => {
    setAnchorsLoading(true);
    const { data, error } = await supabase
      .from('anchor_items')
      .select('id, item_id, anchor_type, priority, active, menu_items(name)')
      .order('priority', { ascending: false });
    if (error) { toast({ title: 'Error loading anchor items', variant: 'destructive' }); }
    if (data) {
      setAnchors(
        data.map((r) => ({
          id: r.id,
          item_id: r.item_id ?? '',
          item_name: (r.menu_items as { name: string } | null)?.name ?? '—',
          anchor_type: r.anchor_type ?? 'chef_pick',
          priority: r.priority ?? 0,
          active: r.active ?? true,
        }))
      );
    }
    setAnchorsLoading(false);
  }, []);

  const fetchPairings = useCallback(async () => {
    setPairingsLoading(true);
    const { data, error } = await supabase
      .from('item_pairings')
      .select('id, source_item_id, paired_item_id, priority, context, source:menu_items!item_pairings_source_item_id_fkey(name), paired:menu_items!item_pairings_paired_item_id_fkey(name)')
      .order('priority', { ascending: false });
    if (error) { toast({ title: 'Error loading pairings', variant: 'destructive' }); }
    if (data) {
      setPairings(
        data.map((r) => ({
          id: r.id,
          source_item_id: r.source_item_id ?? '',
          source_name: (r.source as { name: string } | null)?.name ?? '—',
          paired_item_id: r.paired_item_id ?? '',
          paired_name: (r.paired as { name: string } | null)?.name ?? '—',
          priority: r.priority ?? 0,
          context: r.context,
        }))
      );
    }
    setPairingsLoading(false);
  }, []);

  const fetchMealRules = useCallback(async () => {
    setMealRulesLoading(true);
    const { data, error } = await supabase
      .from('meal_completion_rules')
      .select('id, rule_name, priority, active, condition, suggestion')
      .order('priority', { ascending: false });
    if (error) { toast({ title: 'Error loading meal rules', variant: 'destructive' }); }
    if (data) setMealRules(data as MealRuleRow[]);
    setMealRulesLoading(false);
  }, []);

  const fetchAovLift = useCallback(async () => {
    const { data } = await supabase.from('recommendation_aov_lift').select('*');
    setAovRows((data as AovLiftRow[]) ?? []);
    setAovLoading(false);
  }, []);

  useEffect(() => {
    fetchMenuItems();
    fetchAnchors();
    fetchPairings();
    fetchMealRules();
    fetchAovLift();
    const interval = setInterval(fetchAovLift, 30_000);
    return () => clearInterval(interval);
  }, [fetchMenuItems, fetchAnchors, fetchPairings, fetchMealRules, fetchAovLift]);

  // ── anchor actions ────────────────────────────────────────────────────────

  const addAnchor = async () => {
    if (!newAnchorItemId) return;
    setAddingAnchor(true);
    const maxPriority = anchors.reduce((m, a) => Math.max(m, a.priority), 0);
    const { error } = await supabase.from('anchor_items').insert({
      item_id: newAnchorItemId,
      anchor_type: newAnchorType,
      priority: maxPriority + 1,
      active: true,
    });
    if (error) { toast({ title: 'Failed to add anchor item', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Anchor item added' }); setNewAnchorItemId(''); }
    setAddingAnchor(false);
    fetchAnchors();
  };

  const updateAnchorType = async (id: string, anchor_type: string) => {
    const { error } = await supabase.from('anchor_items').update({ anchor_type }).eq('id', id);
    if (error) toast({ title: 'Update failed', variant: 'destructive' });
    else fetchAnchors();
  };

  const toggleAnchorActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from('anchor_items').update({ active }).eq('id', id);
    if (error) toast({ title: 'Update failed', variant: 'destructive' });
    else fetchAnchors();
  };

  const deleteAnchor = async (id: string) => {
    const { error } = await supabase.from('anchor_items').delete().eq('id', id);
    if (error) toast({ title: 'Delete failed', variant: 'destructive' });
    else fetchAnchors();
  };

  const moveAnchorPriority = async (id: string, direction: 'up' | 'down') => {
    const idx = anchors.findIndex((a) => a.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= anchors.length) return;
    const a = anchors[idx];
    const b = anchors[swapIdx];
    await Promise.all([
      supabase.from('anchor_items').update({ priority: b.priority }).eq('id', a.id),
      supabase.from('anchor_items').update({ priority: a.priority }).eq('id', b.id),
    ]);
    fetchAnchors();
  };

  // ── pairing actions ───────────────────────────────────────────────────────

  const addPairing = async () => {
    if (!newPairSource || !newPairTarget || newPairSource === newPairTarget) {
      toast({ title: 'Select two different items', variant: 'destructive' });
      return;
    }
    setAddingPairing(true);
    const { error } = await supabase.from('item_pairings').insert({
      source_item_id: newPairSource,
      paired_item_id: newPairTarget,
      priority: newPairPriority,
    });
    if (error) toast({ title: 'Failed to add pairing', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Pairing added' }); setNewPairSource(''); setNewPairTarget(''); setNewPairPriority(0); }
    setAddingPairing(false);
    fetchPairings();
  };

  const deletePairing = async (id: string) => {
    const { error } = await supabase.from('item_pairings').delete().eq('id', id);
    if (error) toast({ title: 'Delete failed', variant: 'destructive' });
    else fetchPairings();
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Recommendation Curation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage anchor items, item pairings, and meal completion rules.
        </p>
      </div>

      {/* ── Section 1: Anchor Items ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Anchor Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {anchorsLoading ? (
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
                    <TableCell colSpan={5} className="text-muted-foreground text-sm text-center py-6">
                      No anchor items yet.
                    </TableCell>
                  </TableRow>
                )}
                {anchors.map((row, idx) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.item_name}</TableCell>
                    <TableCell>
                      <Select
                        value={row.anchor_type}
                        onValueChange={(v) => updateAnchorType(row.id, v)}
                      >
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => moveAnchorPriority(row.id, 'up')}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{row.priority}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === anchors.length - 1}
                          onClick={() => moveAnchorPriority(row.id, 'down')}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={row.active}
                        onCheckedChange={(v) => toggleAnchorActive(row.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteAnchor(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Add anchor */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Select value={newAnchorItemId} onValueChange={setNewAnchorItemId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select menu item…" />
              </SelectTrigger>
              <SelectContent>
                {menuItems.map((mi) => (
                  <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newAnchorType} onValueChange={setNewAnchorType}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANCHOR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addAnchor} disabled={addingAnchor || !newAnchorItemId}>
              {addingAnchor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Item Pairings ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Item Pairings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pairingsLoading ? (
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
                    <TableCell colSpan={5} className="text-muted-foreground text-sm text-center py-6">
                      No pairings yet.
                    </TableCell>
                  </TableRow>
                )}
                {pairings.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.source_name}</TableCell>
                    <TableCell className="text-muted-foreground">→</TableCell>
                    <TableCell>{row.paired_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deletePairing(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Add pairing */}
          <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
            <Select value={newPairSource} onValueChange={setNewPairSource}>
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
            <Select value={newPairTarget} onValueChange={setNewPairTarget}>
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
              value={newPairPriority}
              onChange={(e) => setNewPairPriority(Number(e.target.value))}
            />
            <Button onClick={addPairing} disabled={addingPairing || !newPairSource || !newPairTarget}>
              {addingPairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Meal Completion Rules (read-only) ─────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Meal Completion Rules</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: 'Coming soon', description: 'Rule editor is not built yet.' })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          {mealRulesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule name</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Suggestion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mealRules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-sm text-center py-6">
                      No meal completion rules yet.
                    </TableCell>
                  </TableRow>
                )}
                {mealRules.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.rule_name}</TableCell>
                    <TableCell>{row.priority ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={row.active ? 'default' : 'secondary'}>
                        {row.active ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <pre className="text-xs text-muted-foreground max-w-[160px] truncate">
                        {row.condition ? JSON.stringify(row.condition) : '—'}
                      </pre>
                    </TableCell>
                    <TableCell>
                      <pre className="text-xs text-muted-foreground max-w-[160px] truncate">
                        {row.suggestion ? JSON.stringify(row.suggestion) : '—'}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Measurement ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Measurement</CardTitle>
        </CardHeader>
        <CardContent>
          {aovLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : aovRows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pattern</TableHead>
                  <TableHead className="text-right">Shown</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Acceptance rate</TableHead>
                  <TableHead className="text-right">AOV lift estimate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aovRows.map((row) => (
                  <TableRow key={row.pattern_type ?? 'null'}>
                    <TableCell className="font-medium">{row.pattern_type ?? '—'}</TableCell>
                    <TableCell className="text-right">{row.total_shown ?? 0}</TableCell>
                    <TableCell className="text-right">{row.accepted ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {row.acceptance_rate_pct != null ? `${row.acceptance_rate_pct}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.aov_lift_estimate != null ? `₹${row.aov_lift_estimate}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
