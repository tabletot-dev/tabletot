import { supabase } from '@/integrations/supabase/client';
import type { OrderItem } from '@/data/menu';

// Cached for the lifetime of the browser session. Single-table kiosk: always T1.
let cachedTableId: string | null = null;

async function resolveTableId(): Promise<string> {
  if (cachedTableId) return cachedTableId;
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('id')
    .eq('table_number', 'T1')
    .single();
  if (error) throw new Error(`Could not resolve table T1: ${error.message}`);
  cachedTableId = data.id;
  return data.id;
}

export async function submitOrder(
  cart: OrderItem[],
): Promise<{ orderId: string; kotId: string }> {
  const tableId = await resolveTableId();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({ table_id: tableId })
    .select('id')
    .single();
  if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const { data: kot, error: kotError } = await supabase
    .from('kots')
    .insert({ order_id: order.id, round_number: 1, total })
    .select('id')
    .single();
  if (kotError) throw new Error(`Failed to create KOT: ${kotError.message}`);

  const kotItems = cart.map((item) => ({
    kot_id: kot.id,
    // menu_item_id is null until the kiosk is re-pointed at DB-sourced menu items.
    // Item identity is fully captured by item_name + unit_price. See migration 0002.
    menu_item_id: null as string | null,
    item_name: item.name,
    unit_price: item.price,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase.from('kot_items').insert(kotItems);
  if (itemsError) throw new Error(`Failed to create KOT items: ${itemsError.message}`);

  return { orderId: order.id, kotId: kot.id };
}
