import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGate } from '@/components/FeatureGate';
import { emptyRuleForm, formToRule, ruleError, ruleToForm, type RuleForm, type RuleRow } from '@/lib/ruleForm';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface Rule extends RuleRow { id: string }
interface Dish { id: string; name: string; category: string | null }

const NEW = 'new';
const KINDS = [
  { value: 'has_category', label: 'has an item from' },
  { value: 'missing_category', label: 'has no item from' },
] as const;

export default function CompletionRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const [r, m] = await Promise.all([
      supabase.from('meal_completion_rules')
        .select('id, rule_name, priority, active, condition, suggestion')
        .eq('restaurant_id', RESTAURANT_ID).order('priority', { ascending: false }),
      supabase.from('menu_items').select('id, name, category').eq('restaurant_id', RESTAURANT_ID).eq('active', true).order('name'),
    ]);
    if (r.error) toast.error('Error loading completion rules');
    if (m.error) toast.error('Error loading menu items');
    if (r.data) setRules(r.data as Rule[]);
    if (m.data) setDishes(m.data as Dish[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const categories = useMemo(() => [...new Set(dishes.map((d) => d.category).filter((c): c is string => !!c))].sort(), [dishes]);
  const dishName = (id: string) => dishes.find((d) => d.id === id)?.name ?? '(item off the menu)';

  const edit = (r: Rule) => {
    const f = ruleToForm(r);
    if (f) { setEditing(r.id); setForm(f); }
  };
  const startNew = () => { setEditing(NEW); setForm(emptyRuleForm()); };
  const cancel = () => { setEditing(null); setForm(emptyRuleForm()); };

  const save = async () => {
    const problem = ruleError(form);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const row = formToRule(form);
    const { error } = editing === NEW
      ? await supabase.from('meal_completion_rules').insert({ ...row, restaurant_id: RESTAURANT_ID })
      : await supabase.from('meal_completion_rules').update(row).eq('id', editing as string);
    setSaving(false);
    if (error) { toast.error('Save failed: ' + error.message); return; }
    toast.success('Saved');
    cancel();
    fetchAll();
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from('meal_completion_rules').update({ active }).eq('id', id);
    if (error) toast.error('Update failed');
    else fetchAll();
  };

  const remove = async (r: Rule) => {
    if (!confirm(`Delete the rule "${r.rule_name}"?`)) return;
    const { error } = await supabase.from('meal_completion_rules').delete().eq('id', r.id);
    if (error) toast.error('Delete failed');
    else { if (editing === r.id) cancel(); fetchAll(); }
  };

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meal Completion Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            When a customer is about to place their order, the first matching rule (highest priority first) suggests one more item.
            A rule stays quiet if the suggested item is already in the order.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Suggests</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">No completion rules yet.</TableCell></TableRow>
                  )}
                  {rules.map((r) => {
                    const f = ruleToForm(r);
                    return (
                      <TableRow key={r.id} className={editing === r.id ? 'bg-primary/5' : undefined}>
                        <TableCell className="font-medium">{r.rule_name}</TableCell>
                        <TableCell className="text-sm">{f ? `Order ${KINDS.find((k) => k.value === f.kind)?.label} ${f.category}` : <span className="text-muted-foreground">Custom rule — edit in Supabase Studio</span>}</TableCell>
                        <TableCell className="text-sm">{f ? <>{dishName(f.item_id)}<br /><span className="text-muted-foreground">“{f.text}”</span></> : '—'}</TableCell>
                        <TableCell>{r.priority ?? 0}</TableCell>
                        <TableCell><Switch checked={!!r.active} onCheckedChange={(v) => toggle(r.id, v)} /></TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!f} aria-label={`Edit ${r.rule_name}`} onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${r.rule_name}`} onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {!editing && <Button variant="outline" className="border-dashed" onClick={startNew}><Plus className="h-4 w-4" /> Add a rule</Button>}
          </CardContent>
        </Card>

        {editing && (
          <Card>
            <CardHeader><CardTitle>{editing === NEW ? 'New rule' : 'Edit rule'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rule_name">Rule name</Label>
                <Input id="rule_name" value={form.rule_name} onChange={(e) => setForm({ ...form, rule_name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="kind">When the order…</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as RuleForm['kind'] })}>
                    <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger id="category"><SelectValue placeholder="Pick a category…" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item_id">Then suggest</Label>
                <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
                  <SelectTrigger id="item_id"><SelectValue placeholder="Pick an item…" /></SelectTrigger>
                  <SelectContent>{dishes.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="text">Nudge text shown to the customer</Label>
                <Input id="text" placeholder="e.g. Add a croissant to go with that?" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              </div>
              <div className="flex items-end gap-6">
                <div className="space-y-1.5 w-32">
                  <Label htmlFor="priority">Priority</Label>
                  <Input id="priority" type="number" step="1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="active">Active</Label>
                  <div><Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
                <Button variant="outline" onClick={cancel}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </FeatureGate>
  );
}
