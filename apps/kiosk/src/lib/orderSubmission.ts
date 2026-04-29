import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
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

export class OrderSubmissionError extends Error {
  constructor(
    public readonly step: 'order' | 'kot',
    message: string,
  ) {
    super(message);
    this.name = 'OrderSubmissionError';
  }
}

export async function submitOrder(
  cart: OrderItem[],
): Promise<{ orderId: string; kotId: string }> {
  // Warm the table-id cache; the uuid is not needed for the order insert
  // (orders uses table_no text, not a uuid FK) but may be needed by callers.
  await resolveTableId();

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const itemsJson = cart.map((item) => ({
    name: item.name,
    qty: item.quantity,
    price: item.price,
    modifiers: [] as string[],
  })) as unknown as Json;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      table_no: 'T1',
      order_type: 'dine-in',
      source: 'Tabletot',
      status: 'pending',
      items_json: itemsJson,
      subtotal,
      total: subtotal,
    })
    .select('id')
    .single();
  if (orderError) throw new OrderSubmissionError('order', orderError.message);

  const { data: kot, error: kotError } = await supabase
    .from('kot_tickets')
    .insert({
      order_id: order.id,
      kot_number: `KOT-${Date.now()}`,
      table_number: 'T1',
      items: itemsJson,
      status: 'pending',
    })
    .select('id')
    .single();
  if (kotError) throw new OrderSubmissionError('kot', kotError.message);

  return { orderId: order.id, kotId: kot.id };
}
