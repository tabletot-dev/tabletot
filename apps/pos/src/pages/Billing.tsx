import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RESTAURANT_ID } from '@/lib/restaurant';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { KOTView } from '@/components/billing/KOTView';
import { CaptainAssignModal } from '@/components/billing/CaptainAssignModal';
import { MenuGrid } from '@/components/billing/MenuGrid';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, Users, Bell, Droplets, ChefHat, Plus,
  Receipt, CreditCard, UserCheck, Minus, Wifi, WifiOff, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Table {
  id: string;
  table_number: string;
  capacity: number | null;
  status: string;
  current_order_id: string | null;
  assigned_captain: string | null;
}

interface Order {
  id: string;
  order_id: string | null;
  table_no: string | null;
  items_json: any;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: string;
  created_at: string;
  bill_generated_at?: string | null;
  final_discount?: number | null;
  final_total?: number | null;
}

interface CartItem {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  variants: Array<{ type: string; name: string; price: number }>;
  addons: Array<{ name: string; price: number }>;
  notes: string;
  total: number;
}

interface DisplayItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  notes: string;
}

interface PendingRequest {
  id: string;
  table_id: string;
  status: string;
}

interface BillRequest extends PendingRequest {
  phone: string | null;
  order_id: string | null;
}

interface TableRequest extends PendingRequest {
  request_type: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDisplayItems(itemsJson: any): DisplayItem[] {
  if (!Array.isArray(itemsJson)) return [];
  return itemsJson
    .map((item: any) => {
      const name = item.name || item.item_name || 'Unknown';
      if (!name || name.startsWith('[')) return null;
      const quantity = Number(item.quantity || item.qty) || 1;
      const price = Number(item.price) || 0;
      const total = Number(item.total || item.line_total) || price * quantity;
      return { name, quantity, price, total, notes: item.notes || '' };
    })
    .filter(Boolean) as DisplayItem[];
}

function mergeIntoCart(existing: CartItem[], incoming: CartItem): CartItem[] {
  const match = existing.find(
    (i) =>
      i.menu_item_id === incoming.menu_item_id &&
      JSON.stringify(i.variants) === JSON.stringify(incoming.variants) &&
      JSON.stringify(i.addons) === JSON.stringify(incoming.addons),
  );
  if (match) {
    return existing.map((i) =>
      i.id === match.id
        ? { ...i, quantity: i.quantity + incoming.quantity, total: i.total + incoming.total }
        : i,
    );
  }
  return [...existing, { ...incoming, id: crypto.randomUUID() }];
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400',
  free:      'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400',
  occupied:  'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-400',
  ordering:  'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400',
  preparing: 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-400',
  billing:   'bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-400',
  paid:      'bg-slate-400/15 border-slate-400 text-slate-500',
};

const STATUS_LABEL: Record<string, string> = {
  available: 'Free', free: 'Free', occupied: 'Occupied',
  ordering: 'Ordering', preparing: 'Preparing', billing: 'Billing', paid: 'Paid',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Billing() {
  const { user, userRole } = useAuth();

  // Config
  const [gstRate, setGstRate] = useState(5);
  const [staffNameMap, setStaffNameMap] = useState<Map<string, string>>(new Map());
  const [isConnected, setIsConnected] = useState(true);

  // Table + request data
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [billRequests, setBillRequests] = useState<BillRequest[]>([]);
  const [tableRequests, setTableRequests] = useState<TableRequest[]>([]);

  // Selected table + active order
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Pending cart items (for Add Items flow)
  const [pendingItems, setPendingItems] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Discount (applied at settle)
  const [discountAmount, setDiscountAmount] = useState(0);

  // Modals
  const [showAddItems, setShowAddItems] = useState(false);
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCaptain, setShowCaptain] = useState(false);
  const [showKOT, setShowKOT] = useState(false);
  const [lastKot, setLastKot] = useState<any>(null);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const billReqForTable = billRequests.find((r) => r.table_id === selectedTableId) ?? null;
  const waterReqForTable = tableRequests.find(
    (r) => r.table_id === selectedTableId && r.request_type === 'water',
  ) ?? null;
  const allOrderItems = parseDisplayItems(activeOrder?.items_json);
  const itemsSubtotal = allOrderItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = Math.round((itemsSubtotal - discountAmount) * gstRate) / 100;
  const billTotal = itemsSubtotal - discountAmount + taxAmount;

  // ─── Boot fetches ──────────────────────────────────────────────────────────

  useEffect(() => {
    supabase
      .from('restaurant_settings')
      .select('key, value')
      .eq('key', 'gst_rate')
      .maybeSingle()
      .then(({ data }) => { if (data) setGstRate(Number(data.value) || 5); });

    supabase
      .from('staff')
      .select('user_id, id, full_name')
      .eq('is_active', true)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data || []).forEach((s) => {
          if (s.user_id) map.set(s.user_id, s.full_name);
          map.set(s.id, s.full_name);
        });
        setStaffNameMap(map);
      });
  }, []);

  // ─── Tables ────────────────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('table_number');
    if (!error) setTables(data || []);
    else setIsConnected(false);
    setTablesLoading(false);
  }, []);

  const fetchBillRequests = useCallback(async () => {
    const { data } = await supabase
      .from('bill_requests')
      .select('*')
      .eq('status', 'pending');
    setBillRequests(data || []);
  }, []);

  const fetchTableRequests = useCallback(async () => {
    const { data } = await supabase
      .from('table_requests')
      .select('*')
      .eq('status', 'pending');
    setTableRequests(data || []);
  }, []);

  useEffect(() => {
    fetchTables();
    fetchBillRequests();
    fetchTableRequests();

    const tableChannel = supabase
      .channel('billing-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `restaurant_id=eq.${RESTAURANT_ID}` }, fetchTables)
      .subscribe((s) => setIsConnected(s === 'SUBSCRIBED'));

    const billReqChannel = supabase
      .channel('billing-bill-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_requests' }, fetchBillRequests)
      .subscribe();

    const tableReqChannel = supabase
      .channel('billing-table-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_requests' }, fetchTableRequests)
      .subscribe();

    return () => {
      supabase.removeChannel(tableChannel);
      supabase.removeChannel(billReqChannel);
      supabase.removeChannel(tableReqChannel);
    };
  }, [fetchTables, fetchBillRequests, fetchTableRequests]);

  // ─── Active order ──────────────────────────────────────────────────────────

  const loadActiveOrder = useCallback(async (table: Table) => {
    setLoadingOrder(true);

    if (table.current_order_id) {
      // Normal path: table already has a linked order (set by trigger on orders INSERT)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', table.current_order_id)
        .maybeSingle();
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else setActiveOrder(data);
    } else {
      // Fallback: kiosk session exists but no order yet (between session start and first KOT)
      const { data: session } = await supabase
        .from('sessions')
        .select('session_key')
        .eq('table_id', table.id)
        .in('status', ['active', 'bill_requested'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session?.session_key) {
        const { data: order } = await supabase
          .from('orders')
          .select('*')
          .eq('session_id', session.session_key)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        setActiveOrder(order ?? null);
      } else {
        setActiveOrder(null);
      }
    }

    setLoadingOrder(false);
  }, []);

  useEffect(() => {
    if (!selectedTable) { setActiveOrder(null); return; }
    loadActiveOrder(selectedTable);
  }, [selectedTable, loadActiveOrder]);

  // D3: Pre-populate discount from the persisted bill lock when the order loads.
  useEffect(() => {
    if (activeOrder?.final_discount != null) {
      setDiscountAmount(activeOrder.final_discount);
    }
  }, [activeOrder?.id]);

  // Refresh active order when orders table changes
  useEffect(() => {
    if (!activeOrder?.id) return;
    const ch = supabase
      .channel(`billing-order-${activeOrder.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrder.id}` },
        ({ new: updated }) => setActiveOrder(updated as Order),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeOrder?.id]);

  // ─── Table selection ───────────────────────────────────────────────────────

  const handleSelectTable = (table: Table) => {
    setSelectedTableId(table.id);
    setPendingItems([]);
    setDiscountAmount(0);
    setShowAddItems(false);
    setShowBillPreview(false);
    setShowPayment(false);
  };

  // ─── Send to kitchen ───────────────────────────────────────────────────────

  const handleSendToKitchen = async () => {
    if (!selectedTable || pendingItems.length === 0) return;
    setSaving(true);
    try {
      // One writer: order_submitted creates-or-merges the order in the canonical
      // {id,name,qty,price,modifiers} shape, prices it from menu_items (tax
      // included), cuts the KOT, and marks the table occupied — server-side
      // (migration 0048). This kills the old {quantity,total} shape and the
      // tax-free `total = subtotal` overwrite (audit M4). id must be the
      // menu_items UUID (menu_item_id); the RPC casts it and looks up the price.
      // modifiers carries variant + addon names — previously always sent as
      // [], so a server's "large, oat milk" selection never reached the
      // kitchen ticket (audit finding, Task 2.3).
      const specialNotes = pendingItems.filter((i) => i.notes).map((i) => `${i.name}: ${i.notes}`).join('; ');
      const items = pendingItems.map((it) => ({
        id: it.menu_item_id,
        name: it.name,
        qty: it.quantity,
        price: it.price,
        modifiers: [
          ...it.variants.map((v) => v.name),
          ...it.addons.map((a) => a.name),
        ],
      }));
      const { data, error: rpcErr } = await supabase.rpc('append_event', {
        p_event_id: crypto.randomUUID(),
        p_restaurant_id: RESTAURANT_ID,
        p_table_id: selectedTable.id,
        p_event_type: 'order_submitted',
        p_payload: { items, display_name: null, source: 'pos', special_notes: specialNotes || null },
      });
      if (rpcErr) throw rpcErr;
      const result = data as unknown as { order_id: string; kot_id: string };

      // The RPC's KOT row now carries special_notes + modifiers server-side
      // (migration 0052); still show the richer local pendingItems on the
      // POS's own ticket preview — only the kot_number is server-owned.
      const { data: kotRow } = await supabase
        .from('kot_tickets')
        .select('kot_number, printed_at')
        .eq('id', result.kot_id)
        .maybeSingle();
      const kotNumber = kotRow?.kot_number ?? `KOT-${Date.now()}`;

      setLastKot({
        kot_number: kotNumber,
        table_number: selectedTable.table_number,
        printed_at: kotRow?.printed_at ?? new Date().toISOString(),
        items: pendingItems,
        special_notes: specialNotes || null,
      });
      setPendingItems([]);
      setShowAddItems(false);
      setShowKOT(true);
      toast({ title: 'KOT sent', description: `${kotNumber} sent to kitchen` });
      await loadActiveOrder({ ...selectedTable, current_order_id: result.order_id });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Acknowledge requests ──────────────────────────────────────────────────

  const acknowledgeBillRequest = async () => {
    if (!billReqForTable) return;
    await supabase.from('bill_requests').update({ status: 'acknowledged' }).eq('id', billReqForTable.id);
    fetchBillRequests();
  };

  const acknowledgeWaterRequest = async () => {
    if (!waterReqForTable) return;
    await supabase.from('table_requests').update({ status: 'acknowledged' }).eq('id', waterReqForTable.id);
    fetchTableRequests();
  };

  // ─── Payment complete ──────────────────────────────────────────────────────

  const handlePaymentComplete = () => {
    setActiveOrder(null);
    setDiscountAmount(0);
    setShowPayment(false);
    setShowBillPreview(false);
    if (billReqForTable) {
      supabase.from('bill_requests').update({ status: 'settled' }).eq('id', billReqForTable.id);
    }
    // The payment_settled ledger event (migration 0049, KOT archive added in
    // 0052) already closes the session, archives KOTs, and frees the table —
    // no direct writes needed here. PaymentModal is the RPC caller.
    fetchTables();
    fetchBillRequests();
  };

  const handleEndService = async () => {
    if (!selectedTable) return;
    if (!window.confirm(`End service for Table ${selectedTable.table_number}? This resets the kiosk.`)) return;
    try {
      // service_ended (migration 0052): same table-freeing cleanup as
      // payment_settled, without a payments row — this is a walkout/staff
      // reset, not a paid order. Previously this only closed the `sessions`
      // projection; since 0049 dropped the trigger that used to free the
      // table on session close, that left the table occupied and the kiosk
      // never reset, despite this button's own confirm text.
      const { error } = await supabase.rpc('append_event', {
        p_event_id: crypto.randomUUID(),
        p_restaurant_id: RESTAURANT_ID,
        p_table_id: selectedTable.id,
        p_event_type: 'service_ended',
        p_payload: { created_by: user?.id ?? null },
      });
      if (error) throw error;
      setActiveOrder(null);
      setDiscountAmount(0);
      fetchTables();
    } catch (err: any) {
      toast({ title: 'End service failed', description: err.message, variant: 'destructive' });
    }
  };

  // ─── Stale session cleanup ─────────────────────────────────────────────────

  const [cleaningUp, setCleaningUp] = useState(false);

  const handleCleanupStaleSessions = async () => {
    setCleaningUp(true);
    try {
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      // Fetch all open sessions — we determine staleness from order activity below,
      // not from started_at, so we don't pre-filter by date here.
      const { data: openSessions, error } = await supabase
        .from('sessions')
        .select('id, session_key, started_at, table_id')
        .in('status', ['active', 'bill_requested']);

      if (error) throw error;
      if (!openSessions?.length) {
        toast({ title: 'No stale sessions', description: 'Nothing to clean up.' });
        return;
      }

      const allSessionKeys = openSessions.map((s) => s.session_key).filter(Boolean);

      // Fetch all orders for these sessions to find last-activity time per session.
      const { data: orders } = await supabase
        .from('orders')
        .select('id, session_id, created_at')
        .in('session_id', allSessionKeys);

      // Last activity = MAX(orders.created_at) if orders exist; else session.started_at.
      // A table that ordered dessert 20 min ago is never stale even if started_at is 8h old.
      const lastActivityByKey = new Map<string, string>();
      for (const order of orders || []) {
        const prev = lastActivityByKey.get(order.session_id);
        if (!prev || order.created_at > prev) {
          lastActivityByKey.set(order.session_id, order.created_at);
        }
      }

      const staleSessions = openSessions.filter((s) => {
        const lastActivity = s.session_key
          ? (lastActivityByKey.get(s.session_key) ?? s.started_at)
          : s.started_at;
        return lastActivity < cutoff;
      });

      if (!staleSessions.length) {
        toast({ title: 'No stale sessions', description: 'Nothing to clean up.' });
        return;
      }

      // KOT guard: skip sessions with any open KOT tickets.
      const staleKeys = new Set(staleSessions.map((s) => s.session_key).filter(Boolean));
      const staleOrders = (orders || []).filter((o) => staleKeys.has(o.session_id));
      const staleOrderIds = staleOrders.map((o) => o.id);
      const openKotOrderIds = new Set<string>();

      if (staleOrderIds.length > 0) {
        const { data: openKots } = await supabase
          .from('kot_tickets')
          .select('order_id')
          .in('order_id', staleOrderIds)
          .in('status', ['accepted', 'preparing', 'ready']);
        (openKots || []).forEach((k) => openKotOrderIds.add(k.order_id));
      }

      const sessionsWithOpenKots = new Set(
        staleOrders.filter((o) => openKotOrderIds.has(o.id)).map((o) => o.session_id),
      );

      const safeSessions = staleSessions.filter((s) => !sessionsWithOpenKots.has(s.session_key));

      if (!safeSessions.length) {
        toast({ title: 'Nothing safe to close', description: 'All stale sessions have open KOTs.' });
        return;
      }

      // One service_ended event per table — same reasoning as handleEndService:
      // this must go through the ledger so the table actually frees and the
      // kiosk actually resets, not just the sessions projection.
      let closed = 0;
      let failed = 0;
      for (const s of safeSessions) {
        if (!s.table_id) { failed++; continue; }
        const { error: rpcErr } = await supabase.rpc('append_event', {
          p_event_id: crypto.randomUUID(),
          p_restaurant_id: RESTAURANT_ID,
          p_table_id: s.table_id,
          p_event_type: 'service_ended',
          p_payload: { created_by: user?.id ?? null },
        });
        if (rpcErr) failed++; else closed++;
      }

      if (closed > 0) {
        toast({ title: `${closed} session(s) closed`, description: 'Stale kiosk sessions cleaned up.' });
      }
      if (failed > 0) {
        toast({ title: `${failed} session(s) failed to close`, variant: 'destructive' });
      }
      fetchTables();
    } catch (err: any) {
      toast({ title: 'Cleanup failed', description: err.message, variant: 'destructive' });
    } finally {
      setCleaningUp(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const tableHasBillReq = (tableId: string) => billRequests.some((r) => r.table_id === tableId);
  const tableHasWaterReq = (tableId: string) =>
    tableRequests.some((r) => r.table_id === tableId && r.request_type === 'water');

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── LEFT: Table grid ────────────────────────────────────────────── */}
      <div className="w-[340px] shrink-0 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-lg">Tables</h2>
          <div className="flex items-center gap-2">
            {(userRole === 'manager' || userRole === 'admin') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                disabled={cleaningUp}
                onClick={handleCleanupStaleSessions}
                title="Close stale sessions (>6h, no open KOT)"
              >
                {cleaningUp
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isConnected
                ? <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                : <WifiOff className="h-3.5 w-3.5 text-rose-500" />}
              <span>{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {tablesLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : tables.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm p-8">
              No tables yet — add them in Table Management.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 p-4">
              {tables.map((table) => {
                const hasBill = tableHasBillReq(table.id);
                const hasWater = tableHasWaterReq(table.id);
                const isSelected = table.id === selectedTableId;
                const colorClass = STATUS_COLORS[table.status] ?? 'bg-muted border-border';

                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={cn(
                      'relative rounded-xl border-2 p-3 text-center transition-all hover:shadow-md',
                      colorClass,
                      isSelected && 'ring-2 ring-primary ring-offset-2',
                    )}
                  >
                    {/* Alert badges */}
                    {hasBill && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white animate-pulse">
                        <Bell className="h-2.5 w-2.5" />
                      </span>
                    )}
                    {!hasBill && hasWater && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white animate-pulse">
                        <Droplets className="h-2.5 w-2.5" />
                      </span>
                    )}

                    <p className="text-2xl font-bold">{table.table_number}</p>
                    {table.capacity && (
                      <p className="text-xs opacity-70 flex items-center justify-center gap-0.5 mt-0.5">
                        <Users className="h-3 w-3" />{table.capacity}
                      </p>
                    )}
                    <p className="text-xs mt-1 font-medium">
                      {STATUS_LABEL[table.status] ?? table.status}
                    </p>
                    {table.assigned_captain && staffNameMap.get(table.assigned_captain) && (
                      <p className="text-xs mt-0.5 opacity-60 truncate">
                        {staffNameMap.get(table.assigned_captain)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Legend */}
        <div className="p-3 border-t grid grid-cols-2 gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Bell className="h-3 w-3 text-rose-500" /> Bill requested</span>
          <span className="flex items-center gap-1"><Droplets className="h-3 w-3 text-sky-500" /> Water request</span>
        </div>
      </div>

      {/* ── RIGHT: Order panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <ChefHat className="h-12 w-12 mx-auto opacity-30" />
              <p className="text-lg font-medium">Select a table to begin</p>
            </div>
          </div>
        ) : (
          <>
            {/* Panel header */}
            <div className="border-b bg-card p-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Table {selectedTable.table_number}</h2>
                {activeOrder && (
                  <p className="text-xs text-muted-foreground">
                    {activeOrder.order_id} &bull; {activeOrder.status}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCaptain(true)}>
                  <UserCheck className="h-4 w-4 mr-1" />
                  {selectedTable.assigned_captain && staffNameMap.get(selectedTable.assigned_captain)
                    ? staffNameMap.get(selectedTable.assigned_captain)
                    : 'Assign Captain'}
                </Button>
                {activeOrder && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={handleEndService}>
                    End Service
                  </Button>
                )}
              </div>
            </div>

            {/* Alert bar */}
            {(billReqForTable || waterReqForTable) && (
              <div className="border-b bg-rose-50 dark:bg-rose-950/30 px-4 py-2 flex items-center gap-3 flex-wrap">
                {billReqForTable && (
                  <div className="flex items-center gap-2 flex-1">
                    <Bell className="h-4 w-4 text-rose-600 shrink-0 animate-pulse" />
                    <span className="text-sm font-medium text-rose-700 dark:text-rose-400">
                      Bill requested{billReqForTable.phone ? ` · ${billReqForTable.phone}` : ''}
                    </span>
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={acknowledgeBillRequest}>
                      Acknowledge
                    </Button>
                  </div>
                )}
                {waterReqForTable && (
                  <div className="flex items-center gap-2 flex-1">
                    <Droplets className="h-4 w-4 text-sky-600 shrink-0 animate-pulse" />
                    <span className="text-sm font-medium text-sky-700 dark:text-sky-400">Water requested</span>
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={acknowledgeWaterRequest}>
                      Acknowledge
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Order content */}
            {loadingOrder ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !activeOrder ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Receipt className="h-10 w-10 opacity-30" />
                <p>No active order for this table</p>
                <Button onClick={() => setShowAddItems(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Start Order
                </Button>
              </div>
            ) : (
              <>
                {/* Items list */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-2">
                    {allOrderItems.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-8">No items yet</p>
                    ) : (
                      allOrderItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start py-2 border-b border-border/50 last:border-0">
                          <div>
                            <p className="font-medium">{item.quantity}× {item.name}</p>
                            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                          </div>
                          <p className="font-medium shrink-0 ml-4">₹{item.total.toFixed(0)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {/* Totals */}
                <div className="border-t bg-card p-4 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span>₹{itemsSubtotal.toFixed(0)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span><span>−₹{discountAmount.toFixed(0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST {gstRate}%</span><span>₹{taxAmount.toFixed(0)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span><span>₹{billTotal.toFixed(0)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="border-t bg-card p-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => { setPendingItems([]); setShowAddItems(true); }}>
                    <Plus className="h-4 w-4 mr-2" />Add Items
                  </Button>
                  <Button variant="outline" onClick={() => setShowBillPreview(true)}>
                    <Receipt className="h-4 w-4 mr-2" />Generate Bill
                  </Button>
                  <Button
                    className="col-span-2 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setShowPayment(true)}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />Settle — ₹{billTotal.toFixed(0)}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Add Items dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAddItems} onOpenChange={(open) => { if (!open) { setPendingItems([]); setShowAddItems(false); } }}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="flex h-full">
            {/* Menu */}
            <div className="flex-1 overflow-hidden border-r">
              <MenuGrid onAddToCart={(item) => setPendingItems((prev) => mergeIntoCart(prev, item))} />
            </div>

            {/* Pending cart */}
            <div className="w-72 shrink-0 flex flex-col">
              <div className="p-4 border-b">
                <h3 className="font-semibold">New Items ({pendingItems.reduce((s, i) => s + i.quantity, 0)})</h3>
              </div>
              <ScrollArea className="flex-1">
                {pendingItems.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground p-8">Tap items on the menu to add them</p>
                ) : (
                  <div className="p-3 space-y-2">
                    {pendingItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">₹{item.price} × {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                            onClick={() =>
                              setPendingItems((prev) =>
                                item.quantity <= 1
                                  ? prev.filter((i) => i.id !== item.id)
                                  : prev.map((i) => i.id === item.id ? { ...i, quantity: i.quantity - 1, total: i.total - i.price } : i),
                              )
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm w-5 text-center">{item.quantity}</span>
                          <button
                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                            onClick={() =>
                              setPendingItems((prev) =>
                                prev.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1, total: i.total + i.price } : i),
                              )
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <div className="p-4 border-t space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Subtotal</span>
                  <span>₹{pendingItems.reduce((s, i) => s + i.total, 0).toFixed(0)}</span>
                </div>
                <Button
                  className="w-full"
                  disabled={pendingItems.length === 0 || saving}
                  onClick={handleSendToKitchen}
                >
                  {saving
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <ChefHat className="h-4 w-4 mr-2" />}
                  Send to Kitchen
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bill preview dialog ─────────────────────────────────────────── */}
      <Dialog open={showBillPreview} onOpenChange={setShowBillPreview}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bill — Table {selectedTable?.table_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm max-h-64 overflow-auto">
            {allOrderItems.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{item.quantity}× {item.name}</span>
                <span>₹{item.total.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <Separator />
          {/* Discount input */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">Discount (₹)</span>
            <input
              type="number"
              min={0}
              max={itemsSubtotal}
              value={discountAmount || ''}
              onChange={(e) => setDiscountAmount(Math.max(0, Math.min(itemsSubtotal, Number(e.target.value) || 0)))}
              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
              placeholder="0"
            />
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>₹{itemsSubtotal.toFixed(0)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span><span>−₹{discountAmount.toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>GST {gstRate}%</span><span>₹{taxAmount.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span><span>₹{billTotal.toFixed(0)}</span>
            </div>
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={async () => {
              if (activeOrder?.id) {
                await supabase.from('orders').update({
                  bill_generated_at: new Date().toISOString(),
                  final_discount: discountAmount,
                  final_total: billTotal,
                }).eq('id', activeOrder.id);
              }
              setShowBillPreview(false);
              setShowPayment(true);
            }}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Proceed to Settle
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Payment modal ───────────────────────────────────────────────── */}
      {showPayment && activeOrder && selectedTable && (
        <PaymentModal
          cart={allOrderItems}
          total={billTotal}
          orderId={activeOrder.id}
          tableId={selectedTable.id}
          tableNumber={selectedTable.table_number}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}

      {/* ── KOT print modal ─────────────────────────────────────────────── */}
      {showKOT && lastKot && (
        <KOTView kot={lastKot} onClose={() => setShowKOT(false)} />
      )}

      {/* ── Captain assign modal ─────────────────────────────────────────── */}
      {showCaptain && selectedTable && (
        <CaptainAssignModal
          tableId={selectedTable.id}
          onClose={() => {
            setShowCaptain(false);
            fetchTables();
          }}
        />
      )}
    </div>
  );
}
