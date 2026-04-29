import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CreditCard, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

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

interface OrderDetailsProps {
  order: {
    id: string;
    order_id: string;
    table_no: string;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    status: string;
    special_instructions: string | null;
    customer_name: string | null;
    created_at: string;
  };
  cart: CartItem[];
  onContinue: () => void;
  onCheckout: () => void;
  onChangeTable: () => void;
  loading: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'new':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'preparing':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'ready':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'served':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'paid':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export function OrderDetails({
  order,
  cart,
  onContinue,
  onCheckout,
  onChangeTable,
  loading,
}: OrderDetailsProps) {
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.05;
  const total = subtotal + tax;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onChangeTable}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Table {order.table_no}</h1>
            <p className="text-sm text-muted-foreground">
              Order {order.order_id}
            </p>
          </div>
        </div>
        <Badge className={getStatusColor(order.status)}>
          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span>{order.customer_name || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}</span>
              </div>
              {order.special_instructions && (
                <div className="pt-2">
                  <span className="text-sm text-muted-foreground">Special Instructions</span>
                  <p className="text-sm mt-1 p-2 bg-muted rounded-md">
                    {order.special_instructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.quantity}x</span>
                        <span>{item.name}</span>
                      </div>
                      {item.variants.length > 0 && (
                        <p className="text-xs text-muted-foreground ml-6">
                          {item.variants.map((v) => v.name).join(', ')}
                        </p>
                      )}
                      {item.addons.length > 0 && (
                        <p className="text-xs text-muted-foreground ml-6">
                          + {item.addons.map((a) => a.name).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-amber-600 ml-6">Note: {item.notes}</p>
                      )}
                    </div>
                    <span className="font-medium">₹{(item.total || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (5%)</span>
                  <span>₹{tax.toFixed(2)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount</span>
                    <span>-₹{order.discount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t bg-card p-4">
        <div className="max-w-2xl mx-auto flex gap-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onContinue}
            disabled={loading}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add More Items
          </Button>
          <Button
            className="flex-1"
            onClick={onCheckout}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-2" />
            )}
            Pay ₹{total.toFixed(2)}
          </Button>
        </div>
      </div>
    </div>
  );
}
