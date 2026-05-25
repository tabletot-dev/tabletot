import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Clock, CheckCircle, ChefHat, Bell } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface KOTTicket {
  id: string;
  kot_number: string;
  table_number: string | null;
  items: any;
  status: string;
  printed_at: string;
  special_notes: string | null;
}

export default function Kitchen() {
  const [tickets, setTickets] = useState<KOTTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');

  useEffect(() => {
    fetchTickets();

    const channel = supabase
      .channel('kot_tickets')
      // New pending tickets appended directly — no round-trip fetch needed.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'kot_tickets',
          filter: 'status=eq.pending',
        },
        (payload) => {
          setTickets((prev) => [...prev, payload.new as KOTTicket]);
        }
      )
      // Status changes and deletions require a full refresh to reflect current DB state.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kot_tickets' },
        (payload) => {
          const updated = payload.new as KOTTicket;
          if (updated.status === 'completed') {
            setTickets((prev) => prev.filter((t) => t.id !== updated.id));
          } else {
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'kot_tickets' },
        () => fetchTickets()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTickets = async () => {
    const { data, error } = await supabase
      .from('kot_tickets')
      .select('*')
      .in('status', ['pending', 'preparing', 'ready'])
      .order('printed_at', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setTickets(data || []);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('kot_tickets')
      .update({ status })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Ticket marked as ${status}` });
      // Realtime UPDATE handler updates state; trigger also syncs orders.status
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/20 text-amber-600 border-amber-500';
      case 'preparing': return 'bg-blue-500/20 text-blue-600 border-blue-500';
      case 'ready': return 'bg-emerald-500/20 text-emerald-600 border-emerald-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTimeSince = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins === 1) return '1 min ago';
    return `${mins} mins ago`;
  };

  const filteredTickets = filter === 'all' 
    ? tickets 
    : tickets.filter(t => t.status === filter);

  const pendingCount = tickets.filter(t => t.status === 'pending').length;
  const preparingCount = tickets.filter(t => t.status === 'preparing').length;
  const readyCount = tickets.filter(t => t.status === 'ready').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ChefHat className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">Kitchen Display</h1>
            <p className="text-sm text-muted-foreground">Manage incoming orders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              <Bell className="h-3 w-3 mr-1" />
              {pendingCount} New
            </Badge>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="p-4 border-b bg-card">
        <div className="flex gap-2">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({tickets.length})
          </Button>
          <Button 
            variant={filter === 'pending' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('pending')}
            className={filter === 'pending' ? '' : 'border-amber-500 text-amber-600 hover:bg-amber-50'}
          >
            Pending ({pendingCount})
          </Button>
          <Button 
            variant={filter === 'preparing' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('preparing')}
            className={filter === 'preparing' ? '' : 'border-blue-500 text-blue-600 hover:bg-blue-50'}
          >
            Preparing ({preparingCount})
          </Button>
          <Button 
            variant={filter === 'ready' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('ready')}
            className={filter === 'ready' ? '' : 'border-emerald-500 text-emerald-600 hover:bg-emerald-50'}
          >
            Ready ({readyCount})
          </Button>
        </div>
      </div>

      {/* KOT Cards Grid */}
      <ScrollArea className="flex-1 p-4">
        {filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <ChefHat className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg">No orders in queue</p>
            <p className="text-sm">New orders will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTickets.map((ticket) => (
              <Card 
                key={ticket.id} 
                className={cn(
                  'overflow-hidden transition-all hover:shadow-lg',
                  ticket.status === 'pending' && 'border-amber-500 border-2',
                  ticket.status === 'preparing' && 'border-blue-500',
                  ticket.status === 'ready' && 'border-emerald-500'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{ticket.kot_number}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {ticket.table_number ? `Table ${ticket.table_number}` : 'Takeaway'}
                      </p>
                    </div>
                    <Badge className={getStatusColor(ticket.status)}>
                      {ticket.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {getTimeSince(ticket.printed_at)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Items List */}
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {Array.isArray(ticket.items) && ticket.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                        <span className="font-medium">
                          {item.quantity || item.qty}x {item.name || item.item_name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Special Notes */}
                  {ticket.special_notes && (
                    <div className="p-2 bg-amber-100 rounded text-sm text-amber-800">
                      <strong>Note:</strong> {ticket.special_notes}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    {ticket.status === 'pending' && (
                      <Button 
                        className="flex-1 bg-blue-500 hover:bg-blue-600"
                        onClick={() => updateStatus(ticket.id, 'preparing')}
                      >
                        Start Preparing
                      </Button>
                    )}
                    {ticket.status === 'preparing' && (
                      <Button 
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                        onClick={() => updateStatus(ticket.id, 'ready')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark Ready
                      </Button>
                    )}
                    {ticket.status === 'ready' && (
                      <Button 
                        className="flex-1"
                        variant="outline"
                        onClick={() => updateStatus(ticket.id, 'completed')}
                      >
                        Complete & Archive
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
