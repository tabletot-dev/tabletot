import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface CaptainAssignModalProps {
  tableId: string;
  onClose: () => void;
}

export function CaptainAssignModal({ tableId, onClose }: CaptainAssignModalProps) {
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('is_active', true)
      .in('role', ['captain', 'waiter'])
      .order('full_name', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setStaff(data || []);
    }
    setLoading(false);
  };

  const handleAssign = async () => {
    if (!selectedStaff) {
      toast({ title: 'Select a captain', description: 'Please select a staff member', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ assigned_captain: selectedStaff })
      .eq('id', tableId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Captain assigned successfully' });
      onClose();
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Captain/Waiter</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No staff members found</p>
            <p className="text-sm mt-2">Ask an admin to add staff first</p>
          </div>
        ) : (
          <div className="space-y-4">
            <RadioGroup value={selectedStaff} onValueChange={setSelectedStaff}>
              {staff.map((member) => (
                <div key={member.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                  <RadioGroupItem value={member.user_id} id={member.id} />
                  <Label htmlFor={member.id} className="flex-1 cursor-pointer">
                    <div>
                      <p className="font-medium">{member.full_name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{member.role}</p>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
