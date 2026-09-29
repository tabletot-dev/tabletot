import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGate } from '@/components/FeatureGate';
import { cn } from '@/lib/utils';
import { csv, factsToForm, formToFacts, normalizeCategory, type Facts } from '@/lib/menuForm';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
const VOICE_ENGINE_URL = (import.meta.env.VITE_VOICE_ENGINE_URL as string | undefined) || '';
const VOICE_ADMIN_KEY = (import.meta.env.VITE_VOICE_ADMIN_KEY as string | undefined) || '';

interface Dish {
  id: string;
  name: string;
  price: number | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  active: boolean;
  is_veg: boolean;
  tags: unknown;
  facts: Facts | null;
}

const NEW = 'new';
const SPICE = ['mild', 'medium', 'hot'];
const textarea = 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// Tells the voice engine to reload the menu so it doesn't serve stale
// prices/items until its next background refresh. Failure is surfaced, not hidden.
function refreshVoiceMenu() {
  if (!VOICE_ENGINE_URL) return;
  fetch(`${VOICE_ENGINE_URL}/admin/refresh-menu`, {
    method: 'POST',
    headers: VOICE_ADMIN_KEY ? { 'X-Admin-Key': VOICE_ADMIN_KEY } : {},
  })
    .then((res) => { if (!res.ok) toast.error(`Voice menu refresh failed (${res.status}) — voice may show stale items for a few minutes`); })
    .catch(() => toast.error('Voice engine unreachable — voice may show stale items for a few minutes'));
}

const emptyForm = () => ({
  name: '', price: '', category: '', description: '', image_url: '', is_veg: true, active: true, tags: '',
  ...factsToForm(null),
});

export default function MenuItems() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDishes = useCallback(async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, price, category, description, image_url, active, is_veg, tags, facts')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('name');
    if (error) toast.error('Error loading menu');
    if (data) setDishes(data as Dish[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDishes(); }, [fetchDishes]);

  const categories = useMemo(() => [...new Set(dishes.map((d) => d.category).filter((c): c is string => !!c))].sort(), [dishes]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = dishes.filter((d) => !q || d.name.toLowerCase().includes(q));
    const by: Record<string, Dish[]> = {};
    for (const d of shown) (by[d.category ?? 'Uncategorised'] ??= []).push(d);
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [dishes, search]);

  const pick = (d: Dish) => {
    setSelected(d.id);
    setForm({
      name: d.name,
      price: d.price?.toString() ?? '',
      category: d.category ?? '',
      description: d.description ?? '',
      image_url: d.image_url ?? '',
      is_veg: d.is_veg,
      active: d.active,
      tags: Array.isArray(d.tags) ? (d.tags as string[]).join(', ') : '',
      ...factsToForm(d.facts),
    });
  };

  const startNew = () => { setSelected(NEW); setForm(emptyForm()); };

  const setActive = async (d: Dish, active: boolean) => {
    const { error } = await supabase.from('menu_items').update({ active }).eq('id', d.id);
    if (error) { toast.error('Update failed'); return; }
    refreshVoiceMenu();
    fetchDishes();
    if (selected === d.id) setForm((f) => ({ ...f, active }));
  };

  const upload = async (file: File) => {
    setUploading(true);
    const path = `uploads/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from('menu-images').upload(path, file);
    if (error) toast.error('Upload failed: ' + error.message);
    else setForm((f) => ({ ...f, image_url: supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl }));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    const price = parseFloat(form.price);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) {
      toast.error('Name and a valid price are required');
      return;
    }
    setSaving(true);
    const current = dishes.find((d) => d.id === selected);
    const row = {
      name: form.name.trim(),
      price,
      category: normalizeCategory(form.category, categories),
      description: form.description.trim() || null,
      image_url: form.image_url || null,
      is_veg: form.is_veg,
      active: form.active,
      tags: csv(form.tags),
      facts: formToFacts(current?.facts ?? null, form) as never,
    };
    const { error } = selected === NEW
      ? await supabase.from('menu_items').insert({ ...row, restaurant_id: RESTAURANT_ID })
      : await supabase.from('menu_items').update(row).eq('id', selected as string);
    setSaving(false);
    if (error) { toast.error('Save failed: ' + error.message); return; }
    toast.success('Saved');
    refreshVoiceMenu();
    await fetchDishes();
    if (selected === NEW) { setSelected(null); setForm(emptyForm()); }
  };

  const f = (key: keyof ReturnType<typeof emptyForm>) => ({
    id: key,
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-6xl mx-auto space-y-6 md:flex md:h-screen md:flex-col">
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Everything the kiosk shows about a dish. Switch a dish off to hide it (nothing is ever deleted).
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          // ponytail: desktop = two panes that scroll on their own inside one screen; phones just stack.
          <div className="grid gap-6 md:min-h-0 md:flex-1 md:grid-cols-[280px_1fr] md:grid-rows-[minmax(0,1fr)]">
            <Card className="md:flex md:h-full md:min-h-0 md:flex-col">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
                <Input placeholder="Search dishes" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {grouped.map(([cat, list]) => (
                  <div key={cat} className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">{cat}</p>
                    {list.map((d) => (
                      <div
                        key={d.id}
                        className={cn('flex items-center justify-between rounded-md border px-3 py-1.5 text-sm', selected === d.id && 'border-primary bg-primary/10')}
                      >
                        <button className={cn('flex-1 text-left', !d.active && 'text-muted-foreground')} onClick={() => pick(d)}>{d.name}</button>
                        <Switch checked={d.active} onCheckedChange={(v) => setActive(d, v)} />
                      </div>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && <p className="text-sm text-muted-foreground">No dishes.</p>}
                </div>
                <Button variant="outline" className="w-full border-dashed" onClick={startNew}><Plus className="h-4 w-4" /> Add a dish</Button>
              </CardContent>
            </Card>

            {selected ? (
              <Card className="md:h-full md:overflow-y-auto">
                <CardHeader><CardTitle>{selected === NEW ? 'New dish' : form.name}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input {...f('name')} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label htmlFor="price">Price (₹)</Label><Input type="number" min="0" {...f('price')} /></div>
                    <div className="space-y-1.5">
                      <Label htmlFor="category">Category</Label>
                      <Input list="menu-categories" {...f('category')} />
                      <datalist id="menu-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                    </div>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="description">Description</Label><textarea rows={2} className={textarea} {...f('description')} /></div>
                  <div className="flex flex-wrap items-end gap-6">
                    <div className="space-y-1.5">
                      <Label>Diet</Label>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant={form.is_veg ? 'default' : 'outline'} onClick={() => setForm({ ...form, is_veg: true })}>Veg</Button>
                        <Button type="button" size="sm" variant={form.is_veg ? 'outline' : 'default'} onClick={() => setForm({ ...form, is_veg: false })}>Non-Veg</Button>
                      </div>
                    </div>
                    <div className="space-y-1.5"><Label htmlFor="active">Shown on kiosk</Label><div><Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div></div>
                    <div className="space-y-1.5 flex-1 min-w-[200px]"><Label htmlFor="tags">Tags (comma-separated)</Label><Input {...f('tags')} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    {form.image_url && <img src={form.image_url} alt="" className="h-16 w-24 rounded object-cover" />}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                    <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {form.image_url ? 'Replace photo' : 'Upload photo'}
                    </Button>
                    {form.image_url && <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, image_url: '' })}>Remove</Button>}
                  </div>

                  <div className="border-t pt-4 space-y-4">
                    <div className="flex items-baseline justify-between">
                      <p className="font-semibold text-sm">Dish facts</p>
                      <p className="text-xs text-muted-foreground">The kiosk and voice AI only state facts filled in here</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label htmlFor="prep">Prep minutes</Label><Input type="number" min="0" {...f('prep')} /></div>
                      <div className="space-y-1.5"><Label htmlFor="calories">Calories (kcal)</Label><Input type="number" min="0" {...f('calories')} /></div>
                      <div className="space-y-1.5"><Label htmlFor="allergens">Allergens</Label><Input placeholder="egg, dairy" {...f('allergens')} /></div>
                      <div className="space-y-1.5">
                        <Label htmlFor="spice">Spice level</Label>
                        <Select value={form.spice || 'none'} onValueChange={(v) => setForm({ ...form, spice: v === 'none' ? '' : v })}>
                          <SelectTrigger id="spice"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not set</SelectItem>
                            {SPICE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5"><Label htmlFor="ingredients">Ingredients (comma-separated)</Label><Input {...f('ingredients')} /></div>
                    <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><Input placeholder="e.g. contains raw egg" {...f('notes')} /></div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
                    <Button variant="outline" onClick={() => { setSelected(null); setForm(emptyForm()); }}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground pt-2">Pick a dish on the left, or add a new one.</p>
            )}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
