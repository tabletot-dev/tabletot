import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TableSelector } from '@/components/billing/TableSelector';
import { MenuGrid } from '@/components/billing/MenuGrid';
import { CartSummary } from '@/components/billing/CartSummary';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { KOTView } from '@/components/billing/KOTView';
import { OrderDetails } from '@/components/billing/OrderDetails';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

interface ExistingOrder {
  id: string;
  order_id: string;
  table_no: string;
  items_json: any;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: string;
  special_instructions: string | null;
  customer_name: string | null;
  created_at: string;
}

// Generate canonical order ID - single format used everywhere
const generateOrderId = (tableNumber: string) => {
  const timestamp = Date.now();
  return `T${tableNumber}-${timestamp}`;
};

export default function Billing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showKOT, setShowKOT] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [existingOrder, setExistingOrder] = useState<ExistingOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  // Load existing unpaid order for table
  useEffect(() => {
    if (selectedTable) {
      checkExistingOrder(selectedTable.table_number);
    }
  }, [selectedTable]);

  const checkExistingOrder = async (tableNumber: string) => {
    setLoading(true);
    try {
      // Only fetch active orders (exclude paid, completed, cancelled)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('table_no', tableNumber)
        .not('status', 'in', '("paid","completed","cancelled")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingOrder(data);
        setCurrentOrder({ id: data.id });
        
        // Load cart items from existing order
        const items = data.items_json as unknown as any[];
        if (Array.isArray(items)) {
          // Fetch menu items to get prices if not available in order
          const { data: menuItems } = await supabase
            .from('menu_items')
            .select('item_name, price');
          
          const menuPriceMap = new Map<string, number>();
          (menuItems || []).forEach((mi) => {
            menuPriceMap.set(mi.item_name.toLowerCase(), Number(mi.price));
          });

          // Filter out metadata items and reconstruct cart
          const cartItems = items
            .filter((item: any) => {
              // Filter out metadata entries like "[Customer: ...]"
              const name = item.name || item.item_name || '';
              return !name.startsWith('[') && name.trim() !== '';
            })
            .map((item: any) => {
              const itemName = item.name || item.item_name || 'Unknown Item';
              const quantity = Number(item.quantity || item.qty) || 1;
              
              // Try to get price from item, or look up from menu
              let price = Number(item.price) || 0;
              if (price === 0) {
                price = menuPriceMap.get(itemName.toLowerCase()) || 0;
              }
              
              // Calculate total - use stored total, line_total, or calculate from price
              let itemTotal = Number(item.total || item.line_total) || 0;
              if (itemTotal === 0) {
                itemTotal = price * quantity;
              }

              return {
                id: item.id || crypto.randomUUID(),
                menu_item_id: item.menu_item_id || '',
                name: itemName,
                price: price,
                quantity: quantity,
                variants: item.variants || [],
                addons: item.addons || [],
                notes: item.notes || '',
                total: itemTotal,
              };
            });

          setCart(cartItems);
        }
        setShowOrderDetails(true);
      } else {
        // No active order - show blank bill
        setExistingOrder(null);
        setCurrentOrder(null);
        setCart([]);
        setShowOrderDetails(false);
      }
    } catch (error: any) {
      console.error('Error checking existing order:', error);
      // On error, default to blank state
      setExistingOrder(null);
      setCurrentOrder(null);
      setCart([]);
      setShowOrderDetails(false);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item: CartItem) => {
    setShowOrderDetails(false);
    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          i.menu_item_id === item.menu_item_id &&
          JSON.stringify(i.variants) === JSON.stringify(item.variants) &&
          JSON.stringify(i.addons) === JSON.stringify(item.addons)
      );

      if (existing) {
        return prev.map((i) =>
          i.id === existing.id
            ? { ...i, quantity: i.quantity + item.quantity, total: i.total + item.total }
            : i
        );
      }

      return [...prev, { ...item, id: crypto.randomUUID() }];
    });
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.total, 0);
  };

  const getSpecialInstructions = () => {
    return cart
      .filter((item) => item.notes)
      .map((item) => `${item.name}: ${item.notes}`)
      .join('; ');
  };

  const syncOrderToGoogleSheets = async (orderData: any) => {
    try {
      const response = await supabase.functions.invoke('sync-order-to-sheets', {
        body: orderData,
      });
      if (response.error) {
        console.error('Failed to sync to Google Sheets:', response.error);
      }
    } catch (error) {
      console.error('Google Sheets sync error:', error);
    }
  };

  const handlePrintKOT = async () => {
    if (cart.length === 0) {
      toast({ title: 'Cart is empty', description: 'Add items before printing KOT', variant: 'destructive' });
      return;
    }

    if (!selectedTable) {
      toast({ title: 'Select a table', description: 'Please select a table first', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const orderIdStr = existingOrder?.order_id || generateOrderId(selectedTable.table_number);
      const specialInstructions = getSpecialInstructions();
      let orderId = existingOrder?.id || currentOrder?.id;

      // Create or update order in database
      if (!orderId) {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_id: orderIdStr,
            order_type: 'dine-in',
            table_no: selectedTable.table_number,
            items_json: cart as any,
            subtotal: calculateTotal(),
            tax: 0,
            discount: 0,
            total: calculateTotal(),
            status: 'new',
            created_by: user?.id,
            special_instructions: specialInstructions,
            customer_name: 'Walk-in Customer',
          })
          .select()
          .single();

        if (orderError) throw orderError;
        orderId = orderData.id;
        setExistingOrder(orderData);
        setCurrentOrder({ id: orderId });

        // Update table status to preparing (blue color)
        await supabase
          .from('restaurant_tables')
          .update({ status: 'preparing', current_order_id: orderId })
          .eq('id', selectedTable.id);
      } else {
        // Update existing order
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            items_json: cart as any,
            subtotal: calculateTotal(),
            total: calculateTotal(),
            special_instructions: specialInstructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        if (updateError) throw updateError;
      }

      // Sync to Google Sheets
      const sheetsData = {
        order_id: orderIdStr,
        table_no: selectedTable.table_number,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          modifiers: [
            ...item.variants.map((v) => v.name),
            ...item.addons.map((a) => a.name),
          ],
        })),
        total: calculateTotal(),
        special_instructions: specialInstructions,
      };
      syncOrderToGoogleSheets(sheetsData);

      // Generate KOT ticket
      const kotNumber = `KOT-${Date.now()}`;
      const { data: kotData, error: kotError } = await supabase
        .from('kot_tickets')
        .insert({
          order_id: orderId,
          kot_number: kotNumber,
          table_number: selectedTable.table_number,
          items: cart as any,
          created_by: user?.id,
          special_notes: specialInstructions,
        })
        .select()
        .single();

      if (kotError) throw kotError;

      setCurrentOrder({ id: orderId, kot: kotData });
      
      // Update table status to 'preparing' after KOT is printed (for both new and existing orders)
      await supabase
        .from('restaurant_tables')
        .update({ status: 'preparing' })
        .eq('id', selectedTable.id);
      
      setShowKOT(true);
      setShowOrderDetails(false);
      toast({ title: 'KOT Generated', description: `KOT ${kotNumber} has been printed` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = (table: any) => {
    setSelectedTable(table);
    setCart([]);
    setExistingOrder(null);
    setCurrentOrder(null);
    setShowOrderDetails(false);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast({ title: 'Cart is empty', description: 'Add items before checkout', variant: 'destructive' });
      return;
    }

    const orderId = existingOrder?.id || currentOrder?.id;

    if (!orderId) {
      // Create order first
      setLoading(true);
      try {
        const orderIdStr = generateOrderId(selectedTable.table_number);
        const specialInstructions = getSpecialInstructions();
        
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_id: orderIdStr,
            order_type: 'dine-in',
            table_no: selectedTable.table_number,
            items_json: cart as any,
            subtotal: calculateTotal(),
            tax: calculateTotal() * 0.05,
            discount: 0,
            total: calculateTotal() * 1.05,
            status: 'preparing',
            created_by: user?.id,
            special_instructions: specialInstructions,
            customer_name: 'Walk-in Customer',
          })
          .select()
          .single();

        if (orderError) throw orderError;

        await supabase
          .from('restaurant_tables')
          .update({ status: 'occupied', current_order_id: orderData.id })
          .eq('id', selectedTable.id);

        setCurrentOrder({ id: orderData.id });
        setExistingOrder(orderData);
        setShowPayment(true);
      } catch (error: any) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    } else {
      setShowPayment(true);
    }
  };

  const handlePaymentComplete = async () => {
    // Reset all state and go back to table selection
    setCart([]);
    setCurrentOrder(null);
    setExistingOrder(null);
    setSelectedTable(null);
    setShowPayment(false);
    setShowOrderDetails(false);
  };

  const handleContinueOrder = () => {
    setShowOrderDetails(false);
  };

  const handleChangeTable = () => {
    setSelectedTable(null);
    setCart([]);
    setCurrentOrder(null);
    setExistingOrder(null);
    setShowOrderDetails(false);
  };

  if (loading && !selectedTable) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!selectedTable) {
    return (
      <div className="h-full flex flex-col">
        <div className="border-b bg-card p-4">
          <h1 className="text-2xl font-bold">Select Table</h1>
        </div>
        <TableSelector onSelect={handleTableSelect} />
      </div>
    );
  }

  // Show order details screen for existing unpaid orders
  if (showOrderDetails && existingOrder) {
    return (
      <>
        <OrderDetails
          order={existingOrder}
          cart={cart}
          onContinue={handleContinueOrder}
          onCheckout={handleCheckout}
          onChangeTable={handleChangeTable}
          loading={loading}
        />
        {/* Payment Modal */}
        {showPayment && (existingOrder?.id || currentOrder?.id) && (
          <PaymentModal
            cart={cart}
            total={calculateTotal() * 1.05}
            orderId={existingOrder?.id || currentOrder?.id}
            tableId={selectedTable?.id}
            tableNumber={selectedTable?.table_number}
            onClose={() => setShowPayment(false)}
            onComplete={handlePaymentComplete}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing - Table {selectedTable.table_number}</h1>
          {existingOrder && (
            <p className="text-sm text-muted-foreground">
              Order: {existingOrder.order_id} • Status: {existingOrder.status}
            </p>
          )}
        </div>
        <button
          onClick={handleChangeTable}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Change Table
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Menu Section */}
        <div className="flex-1 overflow-auto">
          <MenuGrid onAddToCart={addToCart} />
        </div>

        {/* Cart Section */}
        <div className="w-96 border-l bg-card flex flex-col">
          <CartSummary
            cart={cart}
            onUpdateItem={updateCartItem}
            onRemoveItem={removeFromCart}
            onPrintKOT={handlePrintKOT}
            onCheckout={handleCheckout}
            loading={loading}
            selectedTable={selectedTable}
          />
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (existingOrder?.id || currentOrder?.id) && (
        <PaymentModal
          cart={cart}
          total={calculateTotal() * 1.05}
          orderId={existingOrder?.id || currentOrder?.id}
          tableId={selectedTable?.id}
          tableNumber={selectedTable?.table_number}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}

      {/* KOT Print View */}
      {showKOT && currentOrder?.kot && (
        <KOTView kot={currentOrder.kot} onClose={() => setShowKOT(false)} />
      )}
    </div>
  );
}
