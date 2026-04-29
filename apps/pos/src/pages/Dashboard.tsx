import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  IndianRupee, 
  ShoppingBag, 
  Users, 
  TrendingUp, 
  Clock,
  ChefHat,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  activeTables: number;
  avgOrderValue: number;
  completedOrders: number;
}

interface RecentOrder {
  id: string;
  order_id: string;
  table_no: string | null;
  total: number;
  status: string;
  created_at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    todayRevenue: 0,
    pendingOrders: 0,
    activeTables: 0,
    avgOrderValue: 0,
    completedOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // Fetch today's orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', today);

    // Fetch active tables
    const { data: tables } = await supabase
      .from('restaurant_tables')
      .select('*')
      .neq('status', 'available');

    // Fetch recent orders
    const { data: recent } = await supabase
      .from('orders')
      .select('id, order_id, table_no, total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (orders) {
      const todayRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
      const completedOrders = orders.filter(o => o.status === 'completed').length;
      const pendingOrders = orders.filter(o => ['new', 'preparing'].includes(o.status || '')).length;

      setStats({
        todayOrders: orders.length,
        todayRevenue,
        pendingOrders,
        activeTables: tables?.length || 0,
        avgOrderValue: orders.length > 0 ? todayRevenue / orders.length : 0,
        completedOrders,
      });
    }

    setRecentOrders(recent || []);
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500/20 text-blue-600';
      case 'preparing': return 'bg-amber-500/20 text-amber-600';
      case 'ready': return 'bg-emerald-500/20 text-emerald-600';
      case 'completed': return 'bg-slate-500/20 text-slate-600';
      case 'draft': return 'bg-purple-500/20 text-purple-600';
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's today's overview.</p>
        </div>
        <Button onClick={() => navigate('/pos-billing')}>
          <ShoppingBag className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Revenue</p>
                <p className="text-3xl font-bold mt-1">₹{stats.todayRevenue.toFixed(0)}</p>
                <div className="flex items-center gap-1 mt-2 text-emerald-600 text-sm">
                  <ArrowUpRight className="h-4 w-4" />
                  <span>+12% from yesterday</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Orders</p>
                <p className="text-3xl font-bold mt-1">{stats.todayOrders}</p>
                <div className="flex items-center gap-1 mt-2 text-emerald-600 text-sm">
                  <ArrowUpRight className="h-4 w-4" />
                  <span>+5 from yesterday</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Orders</p>
                <p className="text-3xl font-bold mt-1">{stats.pendingOrders}</p>
                <div className="flex items-center gap-1 mt-2 text-amber-600 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Needs attention</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <ChefHat className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tables</p>
                <p className="text-3xl font-bold mt-1">{stats.activeTables}</p>
                <div className="flex items-center gap-1 mt-2 text-muted-foreground text-sm">
                  <Users className="h-4 w-4" />
                  <span>Currently occupied</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start h-12"
              onClick={() => navigate('/pos-billing')}
            >
              <ShoppingBag className="h-4 w-4 mr-3" />
              Start New Order
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start h-12"
              onClick={() => navigate('/kitchen')}
            >
              <ChefHat className="h-4 w-4 mr-3" />
              Kitchen Display
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start h-12"
              onClick={() => navigate('/orders')}
            >
              <Clock className="h-4 w-4 mr-3" />
              View All Orders
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start h-12"
              onClick={() => navigate('/reports')}
            >
              <TrendingUp className="h-4 w-4 mr-3" />
              View Reports
            </Button>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/orders')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders yet today
              </div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{order.order_id}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.table_no ? `Table ${order.table_no}` : 'Takeaway'} • {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                      <span className="font-semibold">₹{order.total.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Avg Order Value</p>
            <p className="text-2xl font-bold mt-1">₹{stats.avgOrderValue.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Completed Orders</p>
            <p className="text-2xl font-bold mt-1">{stats.completedOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Completion Rate</p>
            <p className="text-2xl font-bold mt-1">
              {stats.todayOrders > 0 
                ? ((stats.completedOrders / stats.todayOrders) * 100).toFixed(0) 
                : 0}%
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
