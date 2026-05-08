import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { OrderItem } from '@/data/menu';
import { computeTotals } from '@/lib/pricing';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
const TABLE_NUMBER = (import.meta.env.VITE_TABLE_ID as string) || 'T1';

// Cached for the lifetime of the browser session.
let cachedTableId: string | null = null;

async function resolveTableId(): Promise<string> {
  if (cachedTableId) return cachedTableId;
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('id')
    .eq('restaurant_id', RESTAURANT_ID)
    .eq('table_number', TABLE_NUMBER)
    .single();
  if (error) throw new Error(`Could not resolve table ${TABLE_NUMBER}: ${error.message}`);
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
  const tableUuid = await resolveTableId();

  const { subtotal, total } = computeTotals(
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );

  const itemsJson = cart.map((item) => ({
    name: item.name,
    qty: item.quantity,
    price: item.price,
    modifiers: [] as string[],
  })) as unknown as Json;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      restaurant_id: RESTAURANT_ID,
      table_no: TABLE_NUMBER,
      table_id: tableUuid,
      order_type: 'dine-in',
      source: 'Tabletot',
      status: 'pending',
      items_json: itemsJson,
      subtotal,
      total,
    })
    .select('id')
    .single();
  if (orderError) throw new OrderSubmissionError('order', orderError.message);

  const { data: kot, error: kotError } = await supabase
    .from('kot_tickets')
    .insert({
      restaurant_id: RESTAURANT_ID,
      order_id: order.id,
      kot_number: `KOT-${Date.now()}`,
      table_number: TABLE_NUMBER,
      items: itemsJson,
      status: 'pending',
    })
    .select('id')
    .single();
  if (kotError) throw new OrderSubmissionError('kot', kotError.message);

  return { orderId: order.id, kotId: kot.id };
}
