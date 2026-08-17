import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import { RESTAURANT_ID } from '@/lib/restaurant';

interface RestaurantTable {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
  area_id: string | null;
  // From table_state, the ledger append_event alone maintains — 'idle' means
  // no real session/order is open on this table right now. status can lag
  // or be manually overridden and drift from this (audit finding #5).
  order_state: string;
}

interface Area {
  id: string;
  name: string;
}

export default function TableManagement() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [formData, setFormData] = useState({
    table_number: '',
    capacity: 4,
    status: 'available',
    area_id: '',
  });

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('tables-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_state' }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [tablesRes, areasRes, stateRes] = await Promise.all([
      supabase.from('restaurant_tables').select('*').order('table_number'),
      supabase.from('areas').select('id, name').eq('is_active', true),
      supabase.from('table_state').select('table_id, state'),
    ]);

    if (tablesRes.error) {
      toast({ title: 'Error', description: tablesRes.error.message, variant: 'destructive' });
    } else {
      const stateByTable = new Map((stateRes.data || []).map(s => [s.table_id, s.state]));
      setTables((tablesRes.data || []).map(t => ({
        ...t,
        order_state: stateByTable.get(t.id) || 'idle',
      })));
    }

    if (!areasRes.error) {
      setAreas(areasRes.data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({ table_number: '', capacity: 4, status: 'available', area_id: '' });
    setEditingTable(null);
  };

  const openEditDialog = (table: RestaurantTable) => {
    setEditingTable(table);
    setFormData({
      table_number: table.table_number,
      capacity: table.capacity,
      status: table.status,
      area_id: table.area_id || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.table_number.trim()) {
      toast({ title: 'Error', description: 'Table number is required', variant: 'destructive' });
      return;
    }
    if (editingTable && editingTable.order_state !== 'idle' && formData.status !== editingTable.status) {
      toast({
        title: 'Table has an active order',
        description: 'Settle the bill in Billing before changing this table\'s status.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    const tableData = {
      table_number: formData.table_number.trim(),
      capacity: formData.capacity,
      status: formData.status,
      area_id: formData.area_id || null,
    };

    if (editingTable) {
      const { error } = await supabase
        .from('restaurant_tables')
        .update(tableData)
        .eq('id', editingTable.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Table updated successfully' });
        setDialogOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('restaurant_tables')
        // Scope to this deployment's restaurant. Without this the row lands
        // with restaurant_id = NULL and the kiosk can't resolve it (406).
        .insert({ ...tableData, restaurant_id: RESTAURANT_ID });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Table created successfully' });
        setDialogOpen(false);
        fetchData();
      }
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: 'Are you sure you want to delete this table?' }))) return;

    const { error } = await supabase.from('restaurant_tables').delete().eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Table deleted' });
      fetchData();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const table = tables.find(t => t.id === id);
    if (table && table.order_state !== 'idle') {
      toast({
        title: 'Table has an active order',
        description: 'Settle the bill in Billing before changing this table\'s status.',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('restaurant_tables')
      .update({ status })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchData();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/20 text-emerald-600';
      case 'occupied': return 'bg-rose-500/20 text-rose-600';
      case 'reserved': return 'bg-blue-500/20 text-blue-600';
      case 'cleaning': return 'bg-amber-500/20 text-amber-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusCounts = {
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Table Management</h1>
          <p className="text-muted-foreground">Manage your restaurant tables</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Table
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTable ? 'Edit Table' : 'Add New Table'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Table Number *</Label>
                <Input
                  value={formData.table_number}
                  onChange={(e) => setFormData({ ...formData, table_number: e.target.value })}
                  placeholder="T1"
                />
              </div>
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 4 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {areas.length > 0 && (
                <div className="space-y-2">
                  <Label>Area</Label>
                  <Select
                    value={formData.area_id}
                    onValueChange={(value) => setFormData({ ...formData, area_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select area" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingTable ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{tables.length}</p>
            <p className="text-sm text-muted-foreground">Total Tables</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{statusCounts.available}</p>
            <p className="text-sm text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-rose-600">{statusCounts.occupied}</p>
            <p className="text-sm text-muted-foreground">Occupied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{statusCounts.reserved}</p>
            <p className="text-sm text-muted-foreground">Reserved</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Grid View */}
      <Card>
        <CardHeader>
          <CardTitle>Tables ({tables.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {tables.map((table) => (
              <div
                key={table.id}
                className={cn(
                  'p-4 rounded-lg border-2 text-center transition-all hover:shadow-md cursor-pointer',
                  table.status === 'available' && 'border-emerald-500 bg-emerald-500/10',
                  table.status === 'occupied' && 'border-rose-500 bg-rose-500/10',
                  table.status === 'reserved' && 'border-blue-500 bg-blue-500/10',
                  table.status === 'cleaning' && 'border-amber-500 bg-amber-500/10'
                )}
                onClick={() => openEditDialog(table)}
              >
                <p className="text-xl font-bold">{table.table_number}</p>
                <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {table.capacity}
                </div>
                <Badge className={cn('mt-2 text-xs', getStatusColor(table.status))}>
                  {table.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table List */}
      <Card>
        <CardHeader>
          <CardTitle>Table List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((table) => (
                <TableRow key={table.id}>
                  <TableCell className="font-medium">{table.table_number}</TableCell>
                  <TableCell>{table.capacity} seats</TableCell>
                  <TableCell>
                    <Select
                      value={table.status}
                      onValueChange={(value) => updateStatus(table.id, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="occupied">Occupied</SelectItem>
                        <SelectItem value="reserved">Reserved</SelectItem>
                        <SelectItem value="cleaning">Cleaning</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(table)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(table.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
