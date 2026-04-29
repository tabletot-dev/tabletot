import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, RefreshCw, Wifi, WifiOff } from 'lucide-react';
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
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
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
      // Track which tables changed status for animation
      const newlyUpdated = new Set<string>();
      const currentStatuses = prevTablesRef.current;
      
      (data || []).forEach(table => {
        const prevStatus = currentStatuses.get(table.id);
        if (prevStatus && prevStatus !== table.status) {
          newlyUpdated.add(table.id);
        }
        currentStatuses.set(table.id, table.status);
      });
      
      if (newlyUpdated.size > 0) {
        setRecentlyUpdated(newlyUpdated);
        // Clear animation after 2 seconds
        setTimeout(() => setRecentlyUpdated(new Set()), 2000);
      }
      
      setTables(data || []);
      setIsConnected(true);
    }
    setLoading(false);
  }, []);

  const syncFromSheets = useCallback(async (showToast = false) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-tables-from-sheets');
      
      if (error) {
        throw error;
      }
      
      if (data?.success) {
        setLastSyncTime(new Date());
        if (showToast && data.updates?.length > 0) {
          toast({ 
            title: 'Tables Updated', 
            description: `${data.updates.length} table(s) synced from Google Sheets` 
          });
        }
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      setIsConnected(false);
      if (showToast) {
        toast({ 
          title: 'Sync Error', 
          description: error.message || 'Failed to sync from Google Sheets', 
          variant: 'destructive' 
        });
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  // Sync table status from orders - this is the SOURCE OF TRUTH for tables with active orders
  const syncTableStatusFromOrders = useCallback(async () => {
    try {
      // Get all orders that have table numbers (including completed for status update)
      const { data: orders, error } = await supabase
        .from('orders')
        .select('table_no, status, updated_at')
        .not('table_no', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching orders for table sync:', error);
        return;
      }

      console.log('Orders for table sync:', orders);

      // Create a map of table_no to order status (use most recent order per table)
      const orderStatusMap = new Map<string, string>();
      (orders || []).forEach((order) => {
        if (order.table_no && !orderStatusMap.has(order.table_no)) {
          // Map order status to table status
          let tableStatus = 'preparing';
          if (order.status === 'new' || order.status === 'ordering') {
            tableStatus = 'ordering';
          } else if (order.status === 'preparing' || order.status === 'in_progress') {
            tableStatus = 'preparing'; // Blue
          } else if (order.status === 'ready' || order.status === 'served' || order.status === 'billing') {
            tableStatus = 'billing'; // Red - order is ready from KDS
          } else if (order.status === 'completed' || order.status === 'paid') {
            tableStatus = 'paid'; // Grey - order is completed
          } else if (order.status === 'cancelled') {
            tableStatus = 'available'; // Green - table is free
          }
          orderStatusMap.set(order.table_no, tableStatus);
          console.log(`Mapping table ${order.table_no} to status ${tableStatus} (order status: ${order.status})`);
        }
      });

      // Update tables based on order status
      for (const [tableNo, status] of orderStatusMap) {
        const { error: updateError } = await supabase
          .from('restaurant_tables')
          .update({ status })
          .eq('table_number', tableNo);
        
        if (updateError) {
          console.error(`Error updating table ${tableNo}:`, updateError);
        }
      }

      // Refresh tables after updating
      await fetchTables();
    } catch (error) {
      console.error('Error syncing table status from orders:', error);
    }
  }, [fetchTables]);

  // Combined sync function - sheets first, then orders (orders take priority)
  const runFullSync = useCallback(async (showToast = false) => {
    await syncFromSheets(showToast);
    await syncTableStatusFromOrders();
  }, [syncFromSheets, syncTableStatusFromOrders]);

  useEffect(() => {
    fetchTables();
    
    // Initial sync - orders should run AFTER sheets to take priority
    runFullSync();
    
    // Set up periodic sync every 10 seconds
    const syncInterval = setInterval(() => {
      runFullSync(false);
    }, 10000);
    
    // Set up realtime subscription for immediate local updates
    const tableChannel = supabase
      .channel('table-changes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_tables',
        },
        (payload) => {
          console.log('Table change detected:', payload);
          fetchTables();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Listen for order status changes to update table status
    const orderChannel = supabase
      .channel('order-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('Order change detected:', payload);
          syncTableStatusFromOrders();
        }
      )
      .subscribe();

    return () => {
      clearInterval(syncInterval);
      supabase.removeChannel(tableChannel);
      supabase.removeChannel(orderChannel);
    };
  }, [fetchTables, syncFromSheets, syncTableStatusFromOrders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
      case 'free':
        return 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400';
      case 'ordering':
        return 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-400';
      case 'preparing':
        return 'bg-sky-500/20 border-sky-500 text-sky-700 dark:text-sky-400';
      case 'billing':
      case 'occupied':
        return 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-400';
      case 'paid':
        return 'bg-slate-400/20 border-slate-400 text-slate-600 dark:text-slate-400';
      default:
        return 'bg-muted border-border';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'available':
      case 'free':
        return 'bg-emerald-500';
      case 'ordering':
        return 'bg-amber-500';
      case 'preparing':
        return 'bg-sky-500';
      case 'billing':
      case 'occupied':
        return 'bg-rose-500';
      case 'paid':
        return 'bg-slate-400';
      default:
        return 'bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
      case 'free':
        return 'Free';
      case 'ordering':
        return 'Ordering';
      case 'preparing':
        return 'Preparing';
      case 'billing':
      case 'occupied':
        return 'Billing';
      case 'paid':
        return 'Paid';
      default:
        return status;
    }
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    const seconds = Math.floor((new Date().getTime() - lastSyncTime.getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  // Update the "time ago" display every second
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 1000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Header with Sync Button and Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Select a Table</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isConnected ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-rose-500" />
            )}
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last sync: {formatLastSync()}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => runFullSync(true)}
            disabled={syncing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>
      
      {/* Status Legend */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500" />
          <span className="text-sm">Free</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500" />
          <span className="text-sm">Ordering</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-sky-500" />
          <span className="text-sm">Preparing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-rose-500" />
          <span className="text-sm">Billing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-400" />
          <span className="text-sm">Paid</span>
        </div>
        {syncing && (
          <div className="flex items-center gap-2 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Syncing with Google Sheets...</span>
          </div>
        )}
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {tables.map((table) => (
          <Card
            key={table.id}
            className={cn(
              'p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 relative overflow-hidden',
              getStatusColor(table.status),
              recentlyUpdated.has(table.id) && 'ring-2 ring-primary ring-offset-2 animate-pulse'
            )}
            onClick={() => onSelect(table)}
          >
            {/* Animated status indicator */}
            <div 
              className={cn(
                'absolute top-2 right-2 w-2 h-2 rounded-full',
                getStatusBgColor(table.status),
                recentlyUpdated.has(table.id) && 'animate-ping'
              )}
            />
            <div className="text-center">
              <h3 className="font-bold text-2xl mb-1">{table.table_number}</h3>
              <p className="text-xs opacity-75 mb-2">
                <Users className="inline h-3 w-3 mr-1" />
                {table.capacity}
              </p>
              <Badge 
                variant="secondary" 
                className={cn(
                  'text-xs font-medium transition-all duration-300',
                  getStatusColor(table.status)
                )}
              >
                {getStatusLabel(table.status)}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
