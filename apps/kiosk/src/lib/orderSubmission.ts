import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { OrderItem } from '@/data/menu';
import { computeTotals } from '@/lib/pricing';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
// Runtime table identity: ?table=T3 in the URL overrides the build-time default.
// One build can serve all tables — each device/browser is pointed at its own URL.
const TABLE_NUMBER =
  new URLSearchParams(window.location.search).get('table') ||
  (import.meta.env.VITE_TABLE_ID as string) ||
  'T1';

// Cached for the lifetime of the browser session.
let cachedTableId: string | null = null;

export async function resolveTableId(): Promise<string> {
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

function getSessionKey(): string {
  const key = 'tt_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getActiveOrderId(): string | null {
  return sessionStorage.getItem('tt_order_id');
}

function setActiveOrderId(id: string): void {
  sessionStorage.setItem('tt_order_id', id);
}

export function clearSession(): void {
  sessionStorage.removeItem('tt_session_id');
  sessionStorage.removeItem('tt_order_id');
  cachedTableId = null;
}

export class OrderSubmissionError extends Error {
  constructor(
    public readonly step: 'session' | 'order' | 'kot',
    message: string,
  ) {
    super(message);
    this.name = 'OrderSubmissionError';
  }
}

// Called when customer taps "Start Ordering" on HomeView.
// Creates the session row in DB — triggers table → occupied via DB trigger.
export async function startSession(): Promise<void> {
  if (!hasSupabaseConfig) return;
  try {
    const tableUuid = await resolveTableId();
    const sessionKey = getSessionKey();

    // Upsert so a page refresh doesn't create a duplicate session.
    await supabase.from('sessions').upsert(
      {
        restaurant_id: RESTAURANT_ID,
        table_id: tableUuid,
        table_number: TABLE_NUMBER,
        session_key: sessionKey,
        status: 'active',
      },
      { onConflict: 'session_key', ignoreDuplicates: true },
    );
  } catch (err) {
    // Non-blocking — kiosk continues even if session insert fails.
    console.warn('Session start failed (non-blocking):', err);
  }
}

// Each "Send to Kitchen" call:
//   Round 1 → INSERT orders row (sets tt_order_id in sessionStorage)
//   Round 2+ → UPDATE the same orders row (merge items, recalculate totals)
//   Every round → INSERT new kot_tickets row for kitchen routing
export async function submitOrder(
  cart: OrderItem[],
): Promise<{ orderId: string; kotId: string }> {
  const tableUuid = await resolveTableId();
  const sessionKey = getSessionKey();
  const existingOrderId = getActiveOrderId();

  const { subtotal, total } = computeTotals(
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );

  const newItems = cart.map((item) => ({
    name: item.name,
    qty: item.quantity,
    price: item.price,
    modifiers: [] as string[],
  })) as unknown as Json;

  let orderId: string;

  if (existingOrderId) {
    // Fetch the existing order to merge items
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('items_json, subtotal')
      .eq('id', existingOrderId)
      .single();

    if (fetchError) throw new OrderSubmissionError('order', fetchError.message);

    const existingItems = Array.isArray(existing.items_json) ? existing.items_json : [];
    const mergedItems = [...existingItems, ...Array.from(newItems as unknown as any[])] as unknown as Json;
    const mergedSubtotal = (existing.subtotal ?? 0) + subtotal;
    const { total: mergedTotal } = computeTotals(mergedSubtotal); // consistent with INSERT path

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        items_json: mergedItems,
        subtotal: mergedSubtotal,
        total: mergedTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingOrderId);

    if (updateError) throw new OrderSubmissionError('order', updateError.message);
    orderId = existingOrderId;
  } else {
    // First round — create the orders row
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: RESTAURANT_ID,
        table_no: TABLE_NUMBER,
        table_id: tableUuid,
        order_type: 'dine-in',
        source: 'Tabletot',
        status: 'pending',
        items_json: newItems,
        subtotal,
        total,
        session_id: sessionKey,
      })
      .select('id')
      .single();

    if (orderError) throw new OrderSubmissionError('order', orderError.message);
    orderId = order.id;
    setActiveOrderId(orderId);
  }

  // Always create a new KOT row per round — kitchen sees each round separately.
  const { data: kot, error: kotError } = await supabase
    .from('kot_tickets')
    .insert({
      restaurant_id: RESTAURANT_ID,
      order_id: orderId,
      kot_number: `KOT-${Date.now()}`,
      table_number: TABLE_NUMBER,
      items: newItems,
      status: 'pending',
      session_id: sessionKey,
    })
    .select('id')
    .single();

  if (kotError) throw new OrderSubmissionError('kot', kotError.message);

  return { orderId, kotId: kot.id };
}
