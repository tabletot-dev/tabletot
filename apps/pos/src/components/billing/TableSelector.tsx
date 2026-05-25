import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Wifi, WifiOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Table {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
  current_order_id: string | null;
  assigned_captain: string | null;
}

interface TableSelectorProps {
  onSelect: (table: Table) => void;
}

export function TableSelector({ onSelect }: TableSelectorProps) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
  const prevTablesRef = useRef<Map<string, string>>(new Map());

  const fetchTables = useCallback(async () => {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .order('table_number', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setIsConnected(false);
    } else {
      const newlyUpdated = new Set<string>();
      const currentStatuses = prevTablesRef.current;

      (data || []).forEach(table => {
        const prevStatus = currentStatuses.get(table.id);
        if (prevStatus && prevStatus !== table.status) newlyUpdated.add(table.id);
        currentStatuses.set(table.id, table.status);
      });

      if (newlyUpdated.size > 0) {
        setRecentlyUpdated(newlyUpdated);
        setTimeout(() => setRecentlyUpdated(new Set()), 2000);
      }

      setTables(data || []);
      setIsConnected(true);
    }
    setLoading(false);
  }, []);

  // Derive table status from active orders and write it back to restaurant_tables.
  // This keeps tables in sync when kiosk orders arrive without a POS staff action.
  const syncTableStatusFromOrders = useCallback(async () => {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('table_no, status, updated_at')
      .not('table_no', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) return;

    const orderStatusMap = new Map<string, string>();
    (orders || []).forEach((order) => {
      if (!order.table_no || orderStatusMap.has(order.table_no)) return;
      let tableStatus = 'preparing';
      if (['new', 'ordering'].includes(order.status)) tableStatus = 'ordering';
      else if (['preparing', 'in_progress'].includes(order.status)) tableStatus = 'preparing';
      else if (['ready', 'served', 'billing'].includes(order.status)) tableStatus = 'billing';
      else if (['completed', 'paid'].includes(order.status)) tableStatus = 'paid';
      else if (order.status === 'cancelled') tableStatus = 'available';
      orderStatusMap.set(order.table_no, tableStatus);
    });

    for (const [tableNo, status] of orderStatusMap) {
      await supabase
        .from('restaurant_tables')
        .update({ status })
        .eq('table_number', tableNo);
    }

    await fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    fetchTables();
    syncTableStatusFromOrders();

    const tableChannel = supabase
      .channel('table-changes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables' },
        () => fetchTables(),
      )
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));

    const orderChannel = supabase
      .channel('order-status-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => syncTableStatusFromOrders(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tableChannel);
      supabase.removeChannel(orderChannel);
    };
  }, [fetchTables, syncTableStatusFromOrders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
      case 'free':      return 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400';
      case 'ordering':  return 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-400';
      case 'preparing': return 'bg-sky-500/20 border-sky-500 text-sky-700 dark:text-sky-400';
      case 'billing':
      case 'occupied':  return 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-400';
      case 'paid':      return 'bg-slate-400/20 border-slate-400 text-slate-600 dark:text-slate-400';
      default:          return 'bg-muted border-border';
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'available':
      case 'free':      return 'bg-emerald-500';
      case 'ordering':  return 'bg-amber-500';
      case 'preparing': return 'bg-sky-500';
      case 'billing':
      case 'occupied':  return 'bg-rose-500';
      case 'paid':      return 'bg-slate-400';
      default:          return 'bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
      case 'free':      return 'Free';
      case 'ordering':  return 'Ordering';
      case 'preparing': return 'Preparing';
      case 'billing':
      case 'occupied':  return 'Billing';
      case 'paid':      return 'Paid';
      default:          return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">No tables found</p>
          <p className="text-sm text-muted-foreground mt-2">Ask an admin to create tables first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">Select a Table</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isConnected
            ? <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            : <WifiOff className="h-3.5 w-3.5 text-rose-500" />}
          <span>{isConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-card rounded-lg border">
        {[
          ['bg-emerald-500', 'Free'],
          ['bg-amber-500', 'Ordering'],
          ['bg-sky-500', 'Preparing'],
          ['bg-rose-500', 'Billing'],
          ['bg-slate-400', 'Paid'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${color}`} />
            <span className="text-sm">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {tables.map((table) => (
          <Card
            key={table.id}
            className={cn(
              'p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 relative overflow-hidden',
              getStatusColor(table.status),
              recentlyUpdated.has(table.id) && 'ring-2 ring-primary ring-offset-2 animate-pulse',
            )}
            onClick={() => onSelect(table)}
          >
            <div className={cn(
              'absolute top-2 right-2 w-2 h-2 rounded-full',
              getStatusDotColor(table.status),
              recentlyUpdated.has(table.id) && 'animate-ping',
            )} />
            <div className="text-center">
              <h3 className="font-bold text-2xl mb-1">{table.table_number}</h3>
              <p className="text-xs opacity-75 mb-2">
                <Users className="inline h-3 w-3 mr-1" />
                {table.capacity}
              </p>
              <Badge variant="secondary" className={cn('text-xs font-medium', getStatusColor(table.status))}>
                {getStatusLabel(table.status)}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
