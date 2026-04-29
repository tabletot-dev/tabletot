import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, Wallet, Smartphone, Share2 } from 'lucide-react';

interface PaymentModalProps {
  cart: any[];
  total: number;
  orderId?: string;
  tableId?: string;
  tableNumber?: string;
  onClose: () => void;
  onComplete: () => void;
}

export function PaymentModal({ cart, total, orderId, tableId, tableNumber, onClose, onComplete }: PaymentModalProps) {
  const { user } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [amountPaid, setAmountPaid] = useState<string>(total.toFixed(2));
  const [tips, setTips] = useState<string>('0');
  const [loading, setLoading] = useState(false);

  const totalAmount = parseFloat(amountPaid) + parseFloat(tips || '0');
  const change = totalAmount - total;

  const handlePayment = async () => {
    if (parseFloat(amountPaid) < total) {
      toast({
        title: 'Insufficient amount',
        description: 'Payment amount must be at least the total',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Get the full order data first
      const { data: orderData, error: orderFetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderFetchError) throw orderFetchError;

      // Archive order to order_history
      const { error: archiveError } = await supabase.from('order_history').insert({
        original_order_id: orderId!,
        order_id: orderData.order_id,
        order_type: orderData.order_type,
        table_no: orderData.table_no,
        customer_name: orderData.customer_name,
        items_json: orderData.items_json,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        discount: orderData.discount,
        total: orderData.total,
        special_instructions: orderData.special_instructions,
        source: orderData.source,
        payment_method: paymentMethod,
        amount_paid: parseFloat(amountPaid),
        tips: parseFloat(tips || '0'),
        created_by: user?.id,
        order_created_at: orderData.created_at,
      });

      if (archiveError) throw archiveError;

      // Create payment record
      const { error: paymentError } = await supabase.from('payments').insert({
        order_id: orderId!,
        payment_method: paymentMethod,
        amount: parseFloat(amountPaid),
        tips: parseFloat(tips || '0'),
        status: 'completed',
        created_by: user?.id,
      });

      if (paymentError) throw paymentError;

      // Sync PAID status to Google Sheets
      if (orderData?.order_id) {
        try {
          const { error: sheetError } = await supabase.functions.invoke('update-order-status-sheet', {
            body: { 
              sessionId: orderData.order_id, 
              status: 'PAID' 
            }
          });
          if (sheetError) {
            console.error('Failed to update sheet status:', sheetError);
          }
        } catch (sheetErr) {
          console.error('Error syncing to sheet:', sheetErr);
        }
      }

      // Reset table status to 'available' (Free/green) and clear order reference
      if (tableId) {
        await supabase
          .from('restaurant_tables')
          .update({ 
            status: 'available', 
            current_order_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', tableId);
      }
      
      // Also try matching by current_order_id as fallback
      await supabase
        .from('restaurant_tables')
        .update({ 
          status: 'available', 
          current_order_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('current_order_id', orderId);

      // Delete order from active orders table
      const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (deleteError) {
        console.error('Failed to delete order:', deleteError);
        // Don't throw - order is already paid and archived
      }

      toast({
        title: 'Payment successful',
        description: `Order completed. ${change > 0 ? `Change: ₹${change.toFixed(2)}` : ''}`,
      });

      onComplete();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generateBillLink = () => {
    const billUrl = `${window.location.origin}/bill/${orderId}`;
    navigator.clipboard.writeText(billUrl);
    toast({ title: 'Link copied', description: 'Bill link copied to clipboard' });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Summary */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-lg font-bold">
              <span>Total Amount</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-3">
            <Label>Payment Method</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Wallet className="h-4 w-4" />
                  Cash
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="card" id="card" />
                <Label htmlFor="card" className="flex items-center gap-2 cursor-pointer flex-1">
                  <CreditCard className="h-4 w-4" />
                  Card
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="upi" id="upi" />
                <Label htmlFor="upi" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Smartphone className="h-4 w-4" />
                  UPI
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Amount Paid */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount Paid</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
          </div>

          {/* Tips */}
          <div className="space-y-2">
            <Label htmlFor="tips">Tips (Optional)</Label>
            <Input
              id="tips"
              type="number"
              step="0.01"
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Change */}
          {change > 0 && (
            <div className="p-3 bg-green-500/10 border border-green-500 rounded-lg">
              <div className="flex justify-between font-semibold text-green-700 dark:text-green-400">
                <span>Change to Return</span>
                <span>₹{change.toFixed(2)}</span>
              </div>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            <Button onClick={handlePayment} disabled={loading} className="w-full" size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete Payment'}
            </Button>

            <Button onClick={generateBillLink} variant="outline" className="w-full">
              <Share2 className="h-4 w-4 mr-2" />
              Share Bill Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
