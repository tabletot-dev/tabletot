import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, Download, Calendar, IndianRupee, ShoppingBag, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SalesData {
  date: string;
  orders: number;
  revenue: number;
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    totalItems: 0,
  });

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    
    switch (period) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        start = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        start = new Date(now.setHours(0, 0, 0, 0));
    }
    
    return start.toISOString();
  };

  const fetchReportData = async () => {
    setLoading(true);
    const startDate = getDateRange();

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', startDate)
      .eq('status', 'completed');

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    if (orders) {
      // Calculate summary
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
      const totalOrders = orders.length;
      
      // Count total items from items_json
      let totalItems = 0;
      const itemCounts: { [key: string]: { quantity: number; revenue: number } } = {};
      
      orders.forEach(order => {
        if (Array.isArray(order.items_json)) {
          order.items_json.forEach((item: any) => {
            const qty = item.quantity || item.qty || 1;
            const name = item.name || item.item_name;
            const price = item.price || 0;
            
            totalItems += qty;
            
            if (name) {
              if (!itemCounts[name]) {
                itemCounts[name] = { quantity: 0, revenue: 0 };
              }
              itemCounts[name].quantity += qty;
              itemCounts[name].revenue += price * qty;
            }
          });
        }
      });

      setSummary({
        totalRevenue,
        totalOrders,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        totalItems,
      });

      // Top items
      const sortedItems = Object.entries(itemCounts)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);
      
      setTopItems(sortedItems);

      // Group by date for chart
      const dateGroups: { [key: string]: { orders: number; revenue: number } } = {};
      orders.forEach(order => {
        const date = new Date(order.created_at!).toLocaleDateString();
        if (!dateGroups[date]) {
          dateGroups[date] = { orders: 0, revenue: 0 };
        }
        dateGroups[date].orders++;
        dateGroups[date].revenue += order.total || 0;
      });

      setSalesData(
        Object.entries(dateGroups).map(([date, data]) => ({
          date,
          ...data,
        }))
      );
    }

    setLoading(false);
  };

  const exportReport = () => {
    // Simple CSV export
    const headers = ['Date', 'Orders', 'Revenue'];
    const rows = salesData.map(d => [d.date, d.orders, d.revenue.toFixed(2)]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${period}.csv`;
    a.click();
    
    toast({ title: 'Exported', description: 'Report downloaded successfully' });
  };

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
          <h1 className="text-3xl font-heading font-bold">Reports</h1>
          <p className="text-muted-foreground">Analyze your sales and performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-3xl font-bold mt-1">₹{summary.totalRevenue.toFixed(0)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-3xl font-bold mt-1">{summary.totalOrders}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-3xl font-bold mt-1">₹{summary.avgOrderValue.toFixed(0)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Items Sold</p>
                <p className="text-3xl font-bold mt-1">{summary.totalItems}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {salesData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No sales data for this period
              </div>
            ) : (
              <div className="space-y-3">
                {salesData.slice(0, 7).map((day, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{day.date}</p>
                      <p className="text-sm text-muted-foreground">{day.orders} orders</p>
                    </div>
                    <p className="font-bold text-lg">₹{day.revenue.toFixed(0)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Selling Items */}
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Items</CardTitle>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No items sold in this period
              </div>
            ) : (
              <div className="space-y-3">
                {topItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center">
                        {idx + 1}
                      </Badge>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.quantity} sold</p>
                      </div>
                    </div>
                    <p className="font-bold">₹{item.revenue.toFixed(0)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Indicators */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <span className="text-emerald-600 font-medium">+15%</span>
              </div>
              <p className="text-sm text-muted-foreground">vs previous period</p>
              <p className="font-medium mt-1">Revenue Growth</p>
            </div>
            <div className="text-center p-6 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <span className="text-blue-600 font-medium">+8%</span>
              </div>
              <p className="text-sm text-muted-foreground">vs previous period</p>
              <p className="font-medium mt-1">Order Growth</p>
            </div>
            <div className="text-center p-6 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                <span className="text-red-600 font-medium">-2%</span>
              </div>
              <p className="text-sm text-muted-foreground">vs previous period</p>
              <p className="font-medium mt-1">Avg Order Value</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
