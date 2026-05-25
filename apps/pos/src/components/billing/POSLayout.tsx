import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Trash2, Printer, CreditCard, Save, Loader2, ArrowLeft, RefreshCw, Home, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { TableSelector } from './TableSelector';
import { SettleBillModal } from './SettleBillModal';

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  item_id: string;
  name: string;
  category: string;
  price: number;
}

interface BillItem {
  id: string;
  menu_item_id: string;
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

interface SelectedTable {
  id: string;
  table_number: string;
}

export function POSLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printingKOT, setPrintingKOT] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handleChangeTable = () => {
    if (billItems.length > 0) {
      const confirm = window.confirm('You have items in the bill. Are you sure you want to change table? Unsaved items will be lost.');
      if (!confirm) return;
    }
    setBillItems([]);
    setCurrentOrderId(null);
    setSelectedTable(null);
  };

  const handleGoBack = () => {
    if (billItems.length > 0) {
      const confirm = window.confirm('You have items in the bill. Are you sure you want to leave? Unsaved items will be lost.');
      if (!confirm) return;
    }
    navigate('/');
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch categories from menu_categories table
    const { data: categoriesData, error: catError } = await supabase
      .from('menu_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order');

    if (catError) {
      toast({ title: 'Error', description: catError.message, variant: 'destructive' });
    } else {
      setCategories(categoriesData || []);
      if (categoriesData && categoriesData.length > 0) {
        setSelectedCategory(categoriesData[0].name);
      }
    }

    // Fetch menu items
    const { data: itemsData, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, category, price')
      .eq('active', true)
      .order('name');

    if (itemsError) {
      toast({ title: 'Error', description: itemsError.message, variant: 'destructive' });
    } else {
      setMenuItems(itemsData || []);
    }
    
    setLoading(false);
  };

  const filteredItems = selectedCategory
    ? menuItems.filter((item) => item.category === selectedCategory)
    : menuItems;

  const addToBill = (item: MenuItem) => {
    setBillItems((prev) => {
      const existing = prev.find((i) => i.menu_item_id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          menu_item_id: item.id,
          item_id: item.item_id,
          name: item.name,
          price: item.price,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setBillItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (id: string) => {
    setBillItems((prev) => prev.filter((item) => item.id !== id));
  };

  const subtotal = billItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.05; // 5% tax
  const totalAmount = subtotal + tax;

  const generateOrderId = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = date.getTime().toString(36).toUpperCase();
    return `ORD-${dateStr}-${timeStr}`;
  };

  const saveAsDraft = async () => {
    if (billItems.length === 0) {
      toast({ title: 'Error', description: 'Add items before saving', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const orderData = {
        order_id: currentOrderId ? undefined : generateOrderId(),
        order_type: 'dine-in',
        items_json: billItems.map((item) => ({
          id: item.id,
          menu_item_id: item.menu_item_id,
          item_id: item.item_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          total: item.price * item.quantity,
        })),
        subtotal: subtotal,
        tax: tax,
        discount: 0,
        total: totalAmount,
        status: 'draft',
        source: 'POS',
        created_by: user?.id,
      };

      if (currentOrderId) {
        // Update existing order
        const { error } = await supabase
          .from('orders')
          .update({
            items_json: orderData.items_json,
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            total: orderData.total,
          })
          .eq('id', currentOrderId);

        if (error) throw error;
        toast({ title: 'Success', description: 'Order updated as draft' });
      } else {
        // Create new order
        const { data, error } = await supabase
          .from('orders')
          .insert({
            order_id: generateOrderId(),
            order_type: 'dine-in',
            items_json: orderData.items_json,
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            discount: 0,
            total: orderData.total,
            status: 'draft',
            source: 'POS',
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        setCurrentOrderId(data.id);
        toast({ title: 'Success', description: `Order saved as draft (${data.order_id})` });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const clearBill = () => {
    setBillItems([]);
    setCurrentOrderId(null);
    setSelectedTable(null);
  };

  const generateKOTNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = date.getTime().toString(36).toUpperCase().slice(-4);
    return `KOT-${dateStr}-${timeStr}`;
  };

  const printKOT = async () => {
    if (billItems.length === 0) {
      toast({ title: 'Error', description: 'Add items before printing KOT', variant: 'destructive' });
      return;
    }

    if (!selectedTable) {
      toast({ title: 'Error', description: 'Please select a table first', variant: 'destructive' });
      return;
    }

    setPrintingKOT(true);

    try {
      // First, save the order if not already saved
      let orderId = currentOrderId;
      const newOrderId = generateOrderId();

      if (!orderId) {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_id: newOrderId,
            order_type: 'dine-in',
            table_no: selectedTable.table_number,
            items_json: billItems.map((item) => ({
              id: item.id,
              menu_item_id: item.menu_item_id,
              item_id: item.item_id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              notes: item.notes || '',
              total: item.price * item.quantity,
            })),
            subtotal: subtotal,
            tax: tax,
            discount: 0,
            total: totalAmount,
            status: 'preparing',
            source: 'POS',
            created_by: user?.id,
          })
          .select()
          .single();

        if (orderError) throw orderError;
        orderId = orderData.id;
        setCurrentOrderId(orderId);
      } else {
        // Update existing order status
        await supabase
          .from('orders')
          .update({ status: 'preparing', table_no: selectedTable.table_number })
          .eq('id', orderId);
      }

      // Generate KOT number
      const kotNumber = generateKOTNumber();

      // Create KOT ticket record
      const { error: kotError } = await supabase
        .from('kot_tickets')
        .insert({
          order_id: orderId,
          kot_number: kotNumber,
          table_number: selectedTable.table_number,
          items: billItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            notes: item.notes || '',
          })),
          status: 'pending',
          created_by: user?.id,
        });

      if (kotError) throw kotError;

      // Update table status to 'occupied' (which represents preparing in this context)
      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ 
          status: 'occupied',
          current_order_id: orderId,
        })
        .eq('id', selectedTable.id);

      if (tableError) throw tableError;

      // Sync to Google Sheets
      const { error: sheetError } = await supabase.functions.invoke('sync-order-to-sheets', {
        body: {
          table_no: selectedTable.table_number,
          items: billItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            notes: item.notes || '',
          })),
          kot_number: kotNumber,
          order_id: newOrderId || currentOrderId,
        },
      });

      if (sheetError) {
        console.error('Google Sheets sync error:', sheetError);
        // Don't fail the whole operation if sheet sync fails
        toast({ 
          title: 'Warning', 
          description: 'KOT printed but failed to sync to Google Sheets',
          variant: 'destructive'
        });
      }

      toast({ 
        title: 'KOT Printed', 
        description: `KOT ${kotNumber} sent to kitchen. Table status updated.`
      });
    } catch (error: any) {
      console.error('Print KOT error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setPrintingKOT(false);
    }
  };

  if (!selectedTable) {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Header for table selection */}
        <div className="h-14 border-b bg-card flex items-center px-4 gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="font-heading font-bold text-lg">POS Billing</h1>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-4xl w-full">
            <h2 className="font-heading text-2xl font-bold mb-6 text-center">Select a Table to Start</h2>
            <TableSelector onSelect={(table) => setSelectedTable({ id: table.id, table_number: table.table_number })} />
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      <div className="h-14 border-b bg-card flex items-center px-4 gap-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={handleGoBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        
        <div className="h-6 w-px bg-border" />
        
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </Button>
        
        <div className="h-6 w-px bg-border" />
        
        <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg">
          <Grid3X3 className="h-4 w-4 text-primary" />
          <span className="font-semibold text-primary">Table {selectedTable.table_number}</span>
        </div>
        
        <Button variant="outline" size="sm" onClick={handleChangeTable} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Change Table
        </Button>
        
        <div className="flex-1" />
        
        <Badge variant="secondary" className="text-xs">
          {billItems.reduce((sum, item) => sum + item.quantity, 0)} items in bill
        </Badge>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Categories */}
        <div className="w-48 border-r bg-card flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-heading font-bold text-lg">Categories</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {categories.map((category) => (
                <button
                key={category.id}
                onClick={() => setSelectedCategory(category.name)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all',
                  selectedCategory === category.name
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Middle - Items Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-card">
          <h2 className="font-heading font-bold text-xl">
            {selectedCategory || 'Menu Items'}
            <Badge variant="secondary" className="ml-3">
              {filteredItems.length} items
            </Badge>
          </h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No items found in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all group"
                  onClick={() => addToBill(item)}
                >
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    <p className="font-bold text-lg text-primary">₹{item.price}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right - Bill Panel */}
      <div className="w-80 border-l bg-card flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-lg">Table {selectedTable.table_number}</h2>
            <p className="text-sm text-muted-foreground">
              {billItems.reduce((sum, item) => sum + item.quantity, 0)} items
              {currentOrderId && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Draft
                </Badge>
              )}
            </p>
          </div>
          {billItems.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearBill}>
              Clear
            </Button>
          )}
        </div>

        {/* Bill Items */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {billItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No items added</p>
                <p className="text-xs mt-1">Click on items to add</p>
              </div>
            ) : (
              billItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-muted/50 rounded-lg space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm flex-1">{item.name}</span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="h-7 w-7 rounded-md bg-background border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="h-7 w-7 rounded-md bg-background border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="font-semibold">₹{item.price * item.quantity}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Bill Footer */}
        <div className="border-t p-4 space-y-4">
          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (5%)</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span>₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full h-10"
              disabled={billItems.length === 0 || saving}
              onClick={saveAsDraft}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save as Draft
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-12"
                disabled={billItems.length === 0 || printingKOT}
                onClick={printKOT}
              >
                {printingKOT ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 mr-2" />
                )}
                Print KOT
              </Button>
              <Button
                className="h-12"
                disabled={billItems.length === 0 || !currentOrderId}
                onClick={() => setShowPaymentModal(true)}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Settle Bill
              </Button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Payment Modal */}
      {currentOrderId && selectedTable && (
        <SettleBillModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          billItems={billItems.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          }))}
          subtotal={subtotal}
          tax={tax}
          total={totalAmount}
          orderId={currentOrderId}
          tableId={selectedTable.id}
          tableNumber={selectedTable.table_number}
          onPaymentComplete={() => {
            setBillItems([]);
            setCurrentOrderId(null);
            setSelectedTable(null);
          }}
        />
      )}
    </div>
  );
}
