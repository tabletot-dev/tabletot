import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  active: boolean;
  tags: Json | null;
}

interface FormState {
  name: string;
  category: string;
  price: string;
  active: boolean;
  tags: string; // comma-separated, e.g. "veg" or "non-veg, spicy"
}

const EMPTY_FORM: FormState = {
  name: '',
  category: '',
  price: '',
  active: true,
  tags: '',
};

function tagsToDisplay(tags: Json | null): string {
  if (!tags || !Array.isArray(tags)) return '';
  return (tags as string[]).join(', ');
}

function tagsToJson(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function AdminMenuItems() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, category, price, active, tags')
      .order('name', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }

  const uniqueCategories = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];

  const filtered = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
    return matchSearch && matchCat;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category ?? '',
      price: item.price != null ? String(item.price) : '',
      active: item.active,
      tags: tagsToDisplay(item.tags),
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = form.name.trim();
    const category = form.category.trim();
    const price = parseFloat(form.price);

    if (!name) {
      toast({ title: 'Validation', description: 'Name is required.', variant: 'destructive' });
      return;
    }
    if (!category) {
      toast({ title: 'Validation', description: 'Category is required.', variant: 'destructive' });
      return;
    }
    if (!form.price || isNaN(price) || price <= 0) {
      toast({ title: 'Validation', description: 'Price must be greater than 0.', variant: 'destructive' });
      return;
    }

    const payload = {
      name,
      category,
      price,
      active: form.active,
      tags: tagsToJson(form.tags).length > 0 ? (tagsToJson(form.tags) as Json) : null,
    };

    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Saved', description: `"${name}" updated.` });
        setDialogOpen(false);
        fetchItems();
      }
    } else {
      const { error } = await supabase
        .from('menu_items')
        .insert(payload);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Created', description: `"${name}" added to menu.` });
        setDialogOpen(false);
        fetchItems();
      }
    }

    setSaving(false);
  }

  async function handleSoftDelete(item: MenuItem) {
    if (!confirm(`Archive "${item.name}"? It will be hidden from the menu but not deleted.`)) return;

    const { error } = await supabase
      .from('menu_items')
      .update({ active: false })
      .eq('id', item.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Archived', description: `"${item.name}" is now inactive.` });
      fetchItems();
    }
  }

  async function toggleActive(item: MenuItem) {
    const { error } = await supabase
      .from('menu_items')
      .update({ active: !item.active })
      .eq('id', item.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: !item.active } : i))
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Menu Items</h1>
          <p className="text-muted-foreground">View, edit, and manage all menu items</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {uniqueCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Menu Items ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No items found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id} className={!item.active ? 'opacity-50' : undefined}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.category ?? '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(item.tags) && (item.tags as string[]).map((tag) => (
                          <Badge
                            key={tag}
                            variant={tag === 'veg' ? 'secondary' : 'destructive'}
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.price != null ? `₹${item.price}` : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={item.active}
                        onCheckedChange={() => toggleActive(item)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSoftDelete(item)}
                          className="text-destructive hover:text-destructive"
                          title="Archive item (sets active=false)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit / Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mi-name">Name *</Label>
              <Input
                id="mi-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Butter Chicken"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mi-category">Category *</Label>
                <Input
                  id="mi-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. indian_curries"
                  list="category-suggestions"
                />
                <datalist id="category-suggestions">
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mi-price">Price (₹) *</Label>
                <Input
                  id="mi-price"
                  type="number"
                  min="1"
                  step="1"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="e.g. 299"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mi-tags">Tags</Label>
              <Input
                id="mi-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="e.g. veg  or  non-veg, spicy"
              />
              <p className="text-xs text-muted-foreground">Comma-separated. Common values: veg, non-veg</p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="mi-active">Active</Label>
              <Switch
                id="mi-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="flex-1">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
