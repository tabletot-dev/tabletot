import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Pencil, Trash2, Loader2, Search, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';

interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [userRoles, setUserRoles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    role: 'staff',
    phone: '',
    is_active: true,
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    const [staffRes, rolesRes] = await Promise.all([
      supabase.from('staff').select('*').order('full_name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    if (staffRes.error) {
      toast({ title: 'Error', description: staffRes.error.message, variant: 'destructive' });
    } else {
      setStaff(staffRes.data || []);
    }
    if (!rolesRes.error) {
      const map = new Map<string, string>();
      (rolesRes.data as UserRole[] || []).forEach(r => map.set(r.user_id, r.role));
      setUserRoles(map);
    }
    setLoading(false);
  };

  const updatePosRole = async (userId: string, role: string) => {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role }, { onConflict: 'user_id' });
    if (error) {
      toast({ title: 'Error updating POS role', description: error.message, variant: 'destructive' });
    } else {
      setUserRoles(prev => new Map(prev).set(userId, role));
      toast({ title: 'POS role updated' });
    }
  };

  const resetForm = () => {
    setFormData({ full_name: '', role: 'staff', phone: '', is_active: true });
    setEditingStaff(null);
  };

  const openEditDialog = (member: StaffMember) => {
    setEditingStaff(member);
    setFormData({
      full_name: member.full_name,
      role: member.role,
      phone: member.phone || '',
      is_active: member.is_active,
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }

    setSaving(true);

    if (editingStaff) {
      const { error } = await supabase
        .from('staff')
        .update({
          full_name: formData.full_name.trim(),
          role: formData.role,
          phone: formData.phone.trim() || null,
          is_active: formData.is_active,
        })
        .eq('id', editingStaff.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Staff updated successfully' });
        setDialogOpen(false);
        fetchStaff();
      }
    } else {
      // For new staff, we'll create a placeholder user_id since we don't have a real auth user
      const { error } = await supabase
        .from('staff')
        .insert({
          user_id: crypto.randomUUID(), // Placeholder
          full_name: formData.full_name.trim(),
          role: formData.role,
          phone: formData.phone.trim() || null,
          is_active: formData.is_active,
        });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Staff created successfully' });
        setDialogOpen(false);
        fetchStaff();
      }
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: 'Are you sure you want to delete this staff member?' }))) return;

    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Staff deleted successfully' });
      fetchStaff();
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('staff')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchStaff();
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-500/20 text-red-600';
      case 'manager': return 'bg-purple-500/20 text-purple-600';
      case 'captain': return 'bg-blue-500/20 text-blue-600';
      case 'chef': return 'bg-amber-500/20 text-amber-600';
      default: return 'bg-slate-500/20 text-slate-600';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const filteredStaff = staff.filter((member) =>
    member.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Staff Management</h1>
          <p className="text-muted-foreground">Manage your team members</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingStaff ? 'Edit Staff' : 'Add New Staff'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="captain">Captain</SelectItem>
                    <SelectItem value="chef">Chef</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingStaff ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search staff..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{staff.length}</p>
            <p className="text-sm text-muted-foreground">Total Staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{staff.filter(s => s.is_active).length}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{staff.filter(s => s.role === 'chef').length}</p>
            <p className="text-sm text-muted-foreground">Chefs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{staff.filter(s => s.role === 'captain').length}</p>
            <p className="text-sm text-muted-foreground">Captains</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Members ({filteredStaff.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStaff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No staff members found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job Role</TableHead>
                  <TableHead>POS Login Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{member.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(member.role)}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.user_id ? (
                        <Select
                          value={userRoles.get(member.user_id) ?? ''}
                          onValueChange={(role) => updatePosRole(member.user_id, role)}
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue placeholder="No access" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">No login</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.phone || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={member.is_active}
                        onCheckedChange={() => toggleActive(member.id, member.is_active)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(member)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(member.id)}
                          className="text-destructive hover:text-destructive"
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
    </div>
  );
}
