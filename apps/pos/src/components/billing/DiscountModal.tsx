import { useState, useEffect } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { Percent, DollarSign, Ticket } from 'lucide-react';

interface DiscountModalProps {
  subtotal: number;
  onApply: (discount: { type: string; value: number }) => void;
  onClose: () => void;
}

export function DiscountModal({ subtotal, onApply, onClose }: DiscountModalProps) {
  const [discountType, setDiscountType] = useState<string>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [couponCode, setCouponCode] = useState<string>('');
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    const { data } = await supabase
      .from('discount_types')
      .select('*')
      .eq('is_active', true)
      .eq('discount_type', 'coupon')
      .gte('valid_until', new Date().toISOString())
      .order('name', { ascending: true });

    setAvailableCoupons(data || []);
  };

  const calculateDiscount = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) return 0;

    if (discountType === 'percentage') {
      return Math.min((subtotal * value) / 100, subtotal);
    } else {
      return Math.min(value, subtotal);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode) {
      toast({ title: 'Enter coupon code', variant: 'destructive' });
      return;
    }

    const { data, error } = await supabase
      .from('discount_types')
      .select('*')
      .eq('coupon_code', couponCode.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      toast({ title: 'Invalid coupon', description: 'Coupon code not found or expired', variant: 'destructive' });
      return;
    }

    if (subtotal < parseFloat(data.min_order_value.toString())) {
      toast({
        title: 'Minimum order not met',
        description: `Minimum order value: ₹${data.min_order_value}`,
        variant: 'destructive',
      });
      return;
    }

    let discountAmount = 0;
    if (data.discount_type === 'percentage') {
      discountAmount = (subtotal * parseFloat(data.value.toString())) / 100;
      if (data.max_discount) {
        discountAmount = Math.min(discountAmount, parseFloat(data.max_discount.toString()));
      }
    } else {
      discountAmount = parseFloat(data.value.toString());
    }

    onApply({ type: data.discount_type, value: discountAmount });
    toast({ title: 'Coupon applied', description: `Discount of ₹${discountAmount.toFixed(2)} applied` });
  };

  const handleApply = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      toast({ title: 'Invalid discount', description: 'Enter a valid discount value', variant: 'destructive' });
      return;
    }

    onApply({ type: discountType, value });
    toast({ title: 'Discount applied' });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Discount</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Manual Discount */}
          <div className="space-y-4">
            <Label>Discount Type</Label>
            <RadioGroup value={discountType} onValueChange={setDiscountType}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="percentage" id="percentage" />
                <Label htmlFor="percentage" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Percent className="h-4 w-4" />
                  Percentage
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="flat" id="flat" />
                <Label htmlFor="flat" className="flex items-center gap-2 cursor-pointer flex-1">
                  <DollarSign className="h-4 w-4" />
                  Flat Amount
                </Label>
              </div>
            </RadioGroup>

            <div>
              <Label htmlFor="value">
                {discountType === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
              </Label>
              <Input
                id="value"
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'percentage' ? 'Enter percentage' : 'Enter amount'}
              />
              {discountValue && (
                <p className="text-sm text-muted-foreground mt-2">
                  Discount: ₹{calculateDiscount().toFixed(2)}
                </p>
              )}
            </div>

            <Button onClick={handleApply} className="w-full">
              Apply Discount
            </Button>
          </div>

          {/* Coupon Code */}
          {availableCoupons.length > 0 && (
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or use coupon</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coupon">Coupon Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="coupon"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                  />
                  <Button onClick={handleApplyCoupon} variant="outline">
                    <Ticket className="h-4 w-4 mr-2" />
                    Apply
                  </Button>
                </div>
              </div>

              {availableCoupons.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Available Coupons:</p>
                  <div className="space-y-2">
                    {availableCoupons.map((coupon) => (
                      <div
                        key={coupon.id}
                        className="p-3 border rounded-lg cursor-pointer hover:border-primary"
                        onClick={() => setCouponCode(coupon.coupon_code)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{coupon.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Code: {coupon.coupon_code}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-primary">
                            {coupon.discount_type === 'percentage'
                              ? `${coupon.value}%`
                              : `₹${coupon.value}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
