import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, Eye, Wifi, WifiOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

interface Order {
  id: string;
  order_id: string;
  order_type: string;
  table_no: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  items_json: Json;
  created_at: string;
  source: string | null;
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const prevOrderIdsRef = useRef<Set<string>>(new Set());

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const currentIds = prevOrderIdsRef.current;
      const newlyAdded = new Set<string>();

      (data || []).forEach(order => {
        if (!currentIds.has(order.id)) newlyAdded.add(order.id);
        currentIds.add(order.id);
      });

      if (newlyAdded.size > 0 && prevOrderIdsRef.current.size > 0) {
        setRecentlyAdded(newlyAdded);
        const tabletotOrders = (data || []).filter(o => newlyAdded.has(o.id) && o.source === 'Tabletot');
        if (tabletotOrders.length > 0) {
          toast({
            title: '🔔 New Tabletot Order!',
            description: `${tabletotOrders.length} new order(s) received from Tabletot`,
          });
        }
        setTimeout(() => setRecentlyAdded(new Set()), 3000);
      }

      setOrders(data || []);
      setIsConnected(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load orders.' });
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders(),
      )
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
      toast({ title: 'Status updated', description: `Order status changed to ${status}.` });
      fetchOrders();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update status.' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':       return 'bg-blue-500';
      case 'preparing': return 'bg-yellow-500';
      case 'ready':     return 'bg-green-500';
      case 'served':
      case 'completed': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      case 'paid':      return 'bg-emerald-600';
      default:          return 'bg-gray-500';
    }
  };

  const getSourceBadge = (source: string | null) => {
    if (source === 'Tabletot') {
      return (
        <Badge variant="outline" className="bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500">
          Tabletot
        </Badge>
      );
    }
    return <Badge variant="outline">POS</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Orders</h1>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isConnected
            ? <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            : <WifiOff className="h-3.5 w-3.5 text-rose-500" />}
          <span>{isConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      <div className="grid gap-4">
        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No orders yet</p>
              <p className="text-sm text-muted-foreground mt-2">Orders will appear here automatically</p>
            </CardContent>
          </Card>
        ) : (
          orders.map(order => (
            <Card
              key={order.id}
              className={cn(
                'transition-all duration-300',
                recentlyAdded.has(order.id) && 'ring-2 ring-primary ring-offset-2 animate-pulse bg-primary/5',
              )}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold">{order.order_id}</h3>
                      <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                      {getSourceBadge(order.source)}
                      {order.table_no && <Badge variant="secondary">Table {order.table_no}</Badge>}
                      {recentlyAdded.has(order.id) && <Badge className="bg-primary animate-bounce">NEW</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                    <p className="text-lg font-semibold mt-2">
                      Total: ₹{(order.total ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Select value={order.status} onValueChange={status => updateOrderStatus(order.id, status)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="served">Served</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => { setSelectedOrder(order); setDialogOpen(true); }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Order Details
              {selectedOrder?.source === 'Tabletot' && (
                <Badge variant="outline" className="bg-purple-500/20 text-purple-700 border-purple-500">Tabletot</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder?.order_id} — {selectedOrder?.order_type}
              {selectedOrder?.table_no && ` — Table ${selectedOrder.table_no}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Items</h4>
              <div className="space-y-2">
                {Array.isArray(selectedOrder?.items_json) && selectedOrder?.items_json?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    {item.qty > 0 ? (
                      <>
                        <span>
                          {item.qty}x {item.item_name ?? item.name}
                          {item.notes && <span className="text-muted-foreground ml-2">({item.notes})</span>}
                        </span>
                        <span>₹{(item.line_total ?? (item.price ?? 0) * item.qty).toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">
                        {item.item_name ?? item.name}
                        {item.notes && ` — ${item.notes}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>₹{(selectedOrder?.subtotal ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax</span>
                <span>₹{(selectedOrder?.tax ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
                <span>Total</span>
                <span>₹{(selectedOrder?.total ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
