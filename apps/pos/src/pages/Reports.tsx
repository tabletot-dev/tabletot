import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RESTAURANT_ID } from '@/lib/restaurant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Download, Calendar, IndianRupee, ShoppingBag,
  TrendingUp, MoonStar, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { formatRupees } from '@/lib/formatCurrency';

interface HistoryOrder {
  id: string;
  order_id: string | null;
  table_no: string | null;
  items_json: any;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: string | null;
  amount_paid: number;
  tips: number;
  source: string | null;
  order_created_at: string | null;
  created_at: string;
}

interface OpenOrder {
  id: string;
  order_id: string | null;
  table_no: string | null;
  status: string;
  total: number;
  created_at: string;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function periodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case 'today': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    case 'week':  { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    case 'month': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    case 'year':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString(); }
    default:      { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); }
  }
}

export default function Reports() {
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<HistoryOrder[]>([]);

  // Day close tab
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [todayOrders, setTodayOrders] = useState<HistoryOrder[]>([]);
  const [dayCloseLoading, setDayCloseLoading] = useState(true);

  // ── Summary tab data ────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('order_history')
      .select('*')
      .gte('order_created_at', periodStart(period))
      .order('order_created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Day close tab data ──────────────────────────────────────────────────────

  // 'served' isn't in the filter — nothing sets orders.status to 'served' yet
  // (see docs/plans/2026-08-02-three-app-hardening.md Task 4.4). Filtering on
  // a status nothing writes is a no-op today; re-add once 4.4 lands.
  const fetchDayCloseData = useCallback(async () => {
    setDayCloseLoading(true);
    const [openRes, todayRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_id, table_no, status, total, created_at')
        .eq('restaurant_id', RESTAURANT_ID)
        .in('status', ['new', 'preparing', 'ready'])
        .order('created_at'),
      // order_history has no restaurant_id column (single-tenant pilot; see
      // 0043's comment) — cannot scope this query until that's added.
      // order_created_at, not created_at (archive-write time), to match
      // fetchOrders' date basis so History and Day Close never disagree on
      // which day an order belongs to.
      supabase
        .from('order_history')
        .select('*')
        .gte('order_created_at', todayStart())
        .order('order_created_at', { ascending: false }),
    ]);
    setOpenOrders(openRes.data || []);
    setTodayOrders(todayRes.data || []);
    setDayCloseLoading(false);
  }, []);

  useEffect(() => { fetchDayCloseData(); }, [fetchDayCloseData]);

  // ── Derived metrics ─────────────────────────────────────────────────────────

  const totalRevenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const itemCounts: Record<string, { quantity: number; revenue: number }> = {};
  orders.forEach((o) => {
    if (!Array.isArray(o.items_json)) return;
    o.items_json.forEach((item: any) => {
      const name = item.name || item.item_name;
      const qty = Number(item.quantity || item.qty) || 1;
      const price = Number(item.price) || 0;
      if (!name || name.startsWith('[')) return;
      if (!itemCounts[name]) itemCounts[name] = { quantity: 0, revenue: 0 };
      itemCounts[name].quantity += qty;
      itemCounts[name].revenue += price * qty;
    });
  });
  const topItems = Object.entries(itemCounts)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const dateGroups: Record<string, { orders: number; revenue: number }> = {};
  orders.forEach((o) => {
    const date = new Date(o.order_created_at || o.created_at).toLocaleDateString('en-IN');
    if (!dateGroups[date]) dateGroups[date] = { orders: 0, revenue: 0 };
    dateGroups[date].orders++;
    dateGroups[date].revenue += o.total ?? 0;
  });
  const dailySales = Object.entries(dateGroups)
    .map(([date, d]) => ({ date, ...d }))
    .reverse();

  // Payment method breakdown (today)
  const paymentBreakdown: Record<string, { count: number; total: number }> = {};
  todayOrders.forEach((o) => {
    const m = o.payment_method || 'unknown';
    if (!paymentBreakdown[m]) paymentBreakdown[m] = { count: 0, total: 0 };
    paymentBreakdown[m].count++;
    paymentBreakdown[m].total += o.total ?? 0;
  });

  const exportCSV = () => {
    const rows = [
      ['Date', 'Order ID', 'Table', 'Payment', 'Total'],
      ...orders.map((o) => [
        new Date(o.order_created_at || o.created_at).toLocaleDateString('en-IN'),
        o.order_id ?? '',
        o.table_no ?? '',
        o.payment_method ?? '',
        (o.total ?? 0).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `sales-${period}-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    toast({ title: 'Exported', description: 'CSV downloaded' });
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Reports</h1>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary"><TrendingUp className="h-4 w-4 mr-2" />Summary</TabsTrigger>
          <TabsTrigger value="history"><Calendar className="h-4 w-4 mr-2" />History</TabsTrigger>
          <TabsTrigger value="dayclose"><MoonStar className="h-4 w-4 mr-2" />Day Close</TabsTrigger>
        </TabsList>

        {/* ── Summary ────────────────────────────────────────────────── */}
        <TabsContent value="summary" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">Last 30 days</SelectItem>
                <SelectItem value="year">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCSV} disabled={orders.length === 0}>
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="text-3xl font-bold mt-1">{formatRupees(totalRevenue)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <IndianRupee className="h-6 w-6 text-emerald-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Orders</p>
                      <p className="text-3xl font-bold mt-1">{totalOrders}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <ShoppingBag className="h-6 w-6 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Order Value</p>
                      <p className="text-3xl font-bold mt-1">{formatRupees(avgOrderValue)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Daily Sales</CardTitle></CardHeader>
                  <CardContent>
                    {dailySales.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">No sales in this period</p>
                    ) : (
                      <div className="space-y-3">
                        {dailySales.slice(0, 7).map((d) => (
                          <div key={d.date} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <p className="font-medium">{d.date}</p>
                              <p className="text-sm text-muted-foreground">{d.orders} orders</p>
                            </div>
                            <p className="font-bold text-lg">{formatRupees(d.revenue)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Top Items</CardTitle></CardHeader>
                  <CardContent>
                    {topItems.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">No items in this period</p>
                    ) : (
                      <div className="space-y-3">
                        {topItems.map((item, idx) => (
                          <div key={item.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary" className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0">
                                {idx + 1}
                              </Badge>
                              <div>
                                <p className="font-medium">{item.name}</p>
                                <p className="text-sm text-muted-foreground">{item.quantity} sold</p>
                              </div>
                            </div>
                            <p className="font-bold">{formatRupees(item.revenue)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── History ────────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Completed Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : orders.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No completed orders in this period</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg text-sm">
                      <div>
                        <p className="font-medium">{o.order_id ?? o.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.table_no ? `Table ${o.table_no}` : 'Takeaway'} &bull;{' '}
                          {new Date(o.order_created_at || o.created_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatRupees(o.total ?? 0)}</p>
                        <p className="text-xs text-muted-foreground capitalize">{o.payment_method ?? '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Day Close ──────────────────────────────────────────────── */}
        <TabsContent value="dayclose" className="mt-6 space-y-6">
          {dayCloseLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Open orders warning */}
              {openOrders.length > 0 && (
                <Card className="border-amber-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-5 w-5" />
                      {openOrders.length} Open Order{openOrders.length > 1 ? 's' : ''}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {openOrders.map((o) => (
                        <div key={o.id} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                          <span>{o.order_id ?? o.id.slice(0, 8)} {o.table_no ? `· Table ${o.table_no}` : ''}</span>
                          <Badge variant="outline" className="capitalize">{o.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Today's payment breakdown */}
              <Card>
                <CardHeader><CardTitle>Today's Takings</CardTitle></CardHeader>
                <CardContent>
                  {todayOrders.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No completed orders today yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(paymentBreakdown).map(([method, d]) => (
                        <div key={method} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium capitalize">{method}</p>
                            <p className="text-sm text-muted-foreground">{d.count} order{d.count !== 1 ? 's' : ''}</p>
                          </div>
                          <p className="text-lg font-bold">{formatRupees(d.total)}</p>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between items-center px-3 font-bold text-lg">
                        <span>Total</span>
                        <span>{formatRupees(todayOrders.reduce((s, o) => s + (o.total ?? 0), 0))}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* End of service checklist — read-only. Previously a "Close Day"
                  button bulk-updated orders.status with no restaurant/table
                  filter and no ledger event, so it never archived to
                  order_history, never recorded a payment, and left every
                  occupied table's kiosk stranded (table_state kept believing
                  the span was still live). Settling is the only correct path
                  now — this just makes it easy to see who's left to settle. */}
              <Card>
                <CardHeader>
                  <CardTitle>End of Service</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No open orders. Every table has been settled.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {openOrders.length} table{openOrders.length > 1 ? 's' : ''} still open.
                        Settle each from Billing — there is no bulk "close day" action,
                        so revenue and the kiosk state always stay in sync.
                      </p>
                      <Button asChild variant="outline">
                        <Link to="/billing">
                          Go to Billing <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
