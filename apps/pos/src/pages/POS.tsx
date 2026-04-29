import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Minus, Trash2, ShoppingCart } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MenuItem {
  id: string;
  item_id: string;
  item_name: string;
  price: number;
  category: string;
  is_available: boolean;
}

interface CartItem extends MenuItem {
  quantity: number;
}

export default function POS() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tableNo, setTableNo] = useState('');
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const { user } = useAuth();

  const categories = [...new Set(menuItems.map(item => item.category))];

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_available', true)
        .order('category', { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load menu items.',
      });
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i =>
          i.id === itemId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter(i => i.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const submitOrder = async () => {
    if (cart.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Empty cart',
        description: 'Please add items to your cart.',
      });
      return;
    }

    if (orderType === 'dine-in' && !tableNo) {
      toast({
        variant: 'destructive',
        title: 'Missing table number',
        description: 'Please enter a table number.',
      });
      return;
    }

    setSubmitting(true);

    try {
      const subtotal = calculateTotal();
      const tax = subtotal * 0.1;
      const total = subtotal + tax;

      const orderItems = cart.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        qty: item.quantity,
        price: item.price,
        line_total: item.price * item.quantity,
      }));

      const orderId = `ORD-${Date.now()}`;

      const { error: orderError } = await supabase.from('orders').insert({
        order_id: orderId,
        order_type: orderType,
        table_no: orderType === 'dine-in' ? tableNo : null,
        subtotal,
        tax,
        total,
        items_json: orderItems,
        created_by: user?.id,
        status: 'new',
        source: 'POS',
      });

      if (orderError) throw orderError;

      const orderItemsInsert = orderItems.map(item => ({
        order_id: orderId,
        item_id: item.item_id,
        item_name: item.item_name,
        qty: item.qty,
        line_total: item.line_total,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsInsert);

      if (itemsError) throw itemsError;

      toast({
        title: 'Order placed',
        description: `Order ${orderId} has been submitted successfully.`,
      });

      setCart([]);
      setTableNo('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to submit order.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Menu Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={categories[0] || 'all'}>
              <TabsList className="mb-4">
                {categories.map(category => (
                  <TabsTrigger key={category} value={category}>
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
              {categories.map(category => (
                <TabsContent key={category} value={category}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {menuItems
                      .filter(item => item.category === category)
                      .map(item => (
                        <Card
                          key={item.id}
                          className="cursor-pointer hover:border-primary transition-colors"
                          onClick={() => addToCart(item)}
                        >
                          <CardContent className="p-4">
                            <h3 className="font-semibold truncate">{item.item_name}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              ${item.price.toFixed(2)}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Current Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Order Type</Label>
              <div className="flex gap-2">
                <Button
                  variant={orderType === 'dine-in' ? 'default' : 'outline'}
                  onClick={() => setOrderType('dine-in')}
                  className="flex-1"
                >
                  Dine In
                </Button>
                <Button
                  variant={orderType === 'takeaway' ? 'default' : 'outline'}
                  onClick={() => setOrderType('takeaway')}
                  className="flex-1"
                >
                  Takeaway
                </Button>
              </div>
            </div>

            {orderType === 'dine-in' && (
              <div className="space-y-2">
                <Label htmlFor="table-no">Table Number</Label>
                <Input
                  id="table-no"
                  placeholder="Enter table number"
                  value={tableNo}
                  onChange={e => setTableNo(e.target.value)}
                />
              </div>
            )}

            <div className="border-t border-border pt-4">
              <ScrollArea className="h-64">
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">
                    Cart is empty
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">
                            ${item.price.toFixed(2)} each
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm">{item.quantity}</span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeFromCart(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>${calculateTotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax (10%)</span>
                <span>${(calculateTotal() * 0.1).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
                <span>Total</span>
                <span>${(calculateTotal() * 1.1).toFixed(2)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={submitOrder}
              disabled={submitting || cart.length === 0}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Place Order
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
