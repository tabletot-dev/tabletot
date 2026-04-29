import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Banknote, CreditCard, Smartphone, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BillItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface SettleBillModalProps {
  open: boolean;
  onClose: () => void;
  billItems: BillItem[];
  subtotal: number;
  tax: number;
  total: number;
  orderId: string;
  tableId: string;
  tableNumber: string;
  onPaymentComplete: () => void;
}

type PaymentMethod = 'cash' | 'card' | 'upi';

export function SettleBillModal({
  open,
  onClose,
  billItems,
  subtotal,
  tax,
  total,
  orderId,
  tableId,
  tableNumber,
  onPaymentComplete,
}: SettleBillModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState(total.toString());
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handlePayment = async () => {
    const paidAmount = parseFloat(amountPaid);
    
    if (isNaN(paidAmount) || paidAmount < total) {
      toast({
        title: 'Invalid Amount',
        description: 'Amount paid must be at least the bill total',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);

    try {
      // 1. Create payment record
      const { error: paymentError } = await supabase.from('payments').insert({
        order_id: orderId,
        amount: total,
        payment_method: paymentMethod,
        tips: paidAmount > total ? paidAmount - total : 0,
        status: 'completed',
      });

      if (paymentError) throw paymentError;

      // 2. Update order status to 'paid'
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // 3. Reset table status to 'available' and clear current_order_id
      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ 
          status: 'available',
          current_order_id: null,
        })
        .eq('id', tableId);

      if (tableError) throw tableError;

      setPaymentSuccess(true);

      toast({
        title: 'Payment Successful',
        description: `₹${total.toFixed(2)} received via ${paymentMethod.toUpperCase()}`,
      });

      // Wait for success animation then close
      setTimeout(() => {
        onPaymentComplete();
        onClose();
        setPaymentSuccess(false);
        setAmountPaid(total.toString());
      }, 1500);

    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        title: 'Payment Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const change = parseFloat(amountPaid) - total;

  const paymentMethods = [
    { id: 'cash' as PaymentMethod, label: 'Cash', icon: Banknote },
    { id: 'card' as PaymentMethod, label: 'Card', icon: CreditCard },
    { id: 'upi' as PaymentMethod, label: 'UPI', icon: Smartphone },
  ];

  if (paymentSuccess) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-20 w-20 text-emerald-500 animate-pulse" />
            <h2 className="text-2xl font-bold mt-4">Payment Successful!</h2>
            <p className="text-muted-foreground mt-2">Table {tableNumber} is now free</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Settle Bill - Table {tableNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items ({billItems.reduce((s, i) => s + i.quantity, 0)})</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax (5%)</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">₹{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Payment Method</Label>
            <div className="grid grid-cols-3 gap-3">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                    paymentMethod === method.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground/50'
                  )}
                >
                  <method.icon className="h-6 w-6" />
                  <span className="text-sm font-medium">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount Paid (for cash) */}
          {paymentMethod === 'cash' && (
            <div className="space-y-3">
              <Label htmlFor="amount">Amount Received</Label>
              <Input
                id="amount"
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="text-lg h-12"
                min={total}
              />
              {change > 0 && (
                <div className="flex justify-between p-3 bg-emerald-500/10 rounded-lg text-emerald-700 dark:text-emerald-400">
                  <span className="font-medium">Change to Return</span>
                  <span className="font-bold">₹{change.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Amount Buttons for Cash */}
          {paymentMethod === 'cash' && (
            <div className="flex gap-2 flex-wrap">
              {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].map((amount, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmountPaid(amount.toString())}
                  className={cn(amountPaid === amount.toString() && 'border-primary')}
                >
                  ₹{amount}
                </Button>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={processing}>
              Cancel
            </Button>
            <Button className="flex-1 h-12" onClick={handlePayment} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Complete Payment
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
