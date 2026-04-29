import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trash2, Minus, Plus, User, Receipt, CreditCard } from 'lucide-react';
import { CaptainAssignModal } from './CaptainAssignModal';
import { DiscountModal } from './DiscountModal';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variants: Array<{ type: string; name: string; price: number }>;
  addons: Array<{ name: string; price: number }>;
  notes: string;
  total: number;
}

interface CartSummaryProps {
  cart: CartItem[];
  onUpdateItem: (id: string, updates: Partial<CartItem>) => void;
  onRemoveItem: (id: string) => void;
  onPrintKOT: () => void;
  onCheckout: () => void;
  loading: boolean;
  selectedTable: any;
}

export function CartSummary({
  cart,
  onUpdateItem,
  onRemoveItem,
  onPrintKOT,
  onCheckout,
  loading,
  selectedTable,
}: CartSummaryProps) {
  const [showCaptainModal, setShowCaptainModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discount, setDiscount] = useState<{ type: string; value: number } | null>(null);

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = discount
    ? discount.type === 'percentage'
      ? (subtotal * discount.value) / 100
      : discount.value
    : 0;
  const taxRate = 0.05; // 5% GST
  const taxAmount = (subtotal - discountAmount) * taxRate;
  const total = subtotal - discountAmount + taxAmount;

  return (
    <>
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold mb-3">Current Order</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowCaptainModal(true)}
          >
            <User className="h-4 w-4 mr-2" />
            Assign Captain
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowDiscountModal(true)}
          >
            Discount
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Cart is empty</p>
              <p className="text-sm mt-1">Add items from the menu</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">{item.name}</h3>
                    {item.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.variants.map((v, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {v.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {item.addons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.addons.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {a.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">Note: {item.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        onUpdateItem(item.id, {
                          quantity: Math.max(1, item.quantity - 1),
                          total: (item.total / item.quantity) * Math.max(1, item.quantity - 1),
                        })
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        onUpdateItem(item.id, {
                          quantity: item.quantity + 1,
                          total: (item.total / item.quantity) * (item.quantity + 1),
                        })
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-semibold">₹{item.total.toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4 space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {discount && (
            <div className="flex justify-between text-green-600">
              <span>
                Discount ({discount.type === 'percentage' ? `${discount.value}%` : `₹${discount.value}`})
              </span>
              <span>-₹{discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax (GST 5%)</span>
            <span>₹{taxAmount.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={onPrintKOT}
            disabled={cart.length === 0 || loading}
          >
            <Receipt className="h-4 w-4 mr-2" />
            Print KOT
          </Button>
          <Button
            className="w-full"
            size="lg"
            onClick={onCheckout}
            disabled={cart.length === 0 || loading}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Proceed to Payment
          </Button>
        </div>
      </div>

      {showCaptainModal && (
        <CaptainAssignModal
          tableId={selectedTable?.id}
          onClose={() => setShowCaptainModal(false)}
        />
      )}

      {showDiscountModal && (
        <DiscountModal
          subtotal={subtotal}
          onApply={(discountData) => {
            setDiscount(discountData);
            setShowDiscountModal(false);
          }}
          onClose={() => setShowDiscountModal(false)}
        />
      )}
    </>
  );
}
