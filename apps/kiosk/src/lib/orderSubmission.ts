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

export function getDisplayName(): string | null {
  return sessionStorage.getItem('tt_display_name');
}

// "Should the kiosk show IdentityView before this Send to Kitchen tap?"
// True until the customer has either entered a name or explicitly skipped.
export function isIdentityResolved(): boolean {
  return sessionStorage.getItem('tt_identity_resolved') === 'true';
}

export function markIdentityResolved(): void {
  sessionStorage.setItem('tt_identity_resolved', 'true');
}

// Used by the pre-confirm IdentityView: at HomeView we create the session row
// without a name; the customer types it later, just before "Send to Kitchen."
// We persist the name on the existing sessions row (matched by session_key)
// and mirror it into sessionStorage for read paths like WaitingView and the
// KOT insert (see submitOrder).
export async function setSessionDisplayName(displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) return;
  sessionStorage.setItem('tt_display_name', trimmed);
  if (!hasSupabaseConfig) return;
  const sessionKey = sessionStorage.getItem('tt_session_id');
  if (!sessionKey) return;
  try {
    await supabase
      .from('sessions')
      .update({ display_name: trimmed } as never)
      .eq('session_key', sessionKey);
  } catch (err) {
    console.warn('setSessionDisplayName failed (non-blocking):', err);
  }
}

function getActiveOrderId(): string | null {
  return sessionStorage.getItem('tt_order_id');
}

function setActiveOrderId(id: string): void {
  sessionStorage.setItem('tt_order_id', id);
}

export async function clearSession(): Promise<void> {
  const sessionKey = sessionStorage.getItem('tt_session_id');
  sessionStorage.removeItem('tt_session_id');
  sessionStorage.removeItem('tt_order_id');
  sessionStorage.removeItem('tt_display_name');
  sessionStorage.removeItem('tt_identity_resolved');
  cachedTableId = null;
  if (sessionKey && hasSupabaseConfig) {
    try {
      await supabase
        .from('sessions')
        .update({ status: 'closed', ended_at: new Date().toISOString() })
        .eq('session_key', sessionKey)
        .in('status', ['active', 'bill_requested']);
    } catch {
      // Non-blocking — UI has already reset.
    }
  }
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
// displayName is an optional first-name label captured via IdentityView; it
// is persisted on the sessions row and on every KOT for floor-staff use, then
// nulled when the session closes (see migration 0038).
export async function startSession(displayName?: string): Promise<void> {
  if (displayName) {
    sessionStorage.setItem('tt_display_name', displayName);
  }
  if (!hasSupabaseConfig) return;
  try {
    const tableUuid = await resolveTableId();
    const sessionKey = getSessionKey();

    // Close any stale open sessions for this table before starting a new one.
    await supabase
      .from('sessions')
      .update({ status: 'closed', ended_at: new Date().toISOString() })
      .eq('table_id', tableUuid)
      .in('status', ['active', 'bill_requested'])
      .neq('session_key', sessionKey);

    // Upsert so a page refresh doesn't create a duplicate session.
    // display_name cast until supabase types are regenerated post-0038.
    await supabase.from('sessions').upsert(
      {
        restaurant_id: RESTAURANT_ID,
        table_id: tableUuid,
        table_number: TABLE_NUMBER,
        session_key: sessionKey,
        status: 'active',
        display_name: displayName ?? null,
      } as never,
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

  // Fetch authoritative prices from menu_items so client-side cart values cannot
  // be manipulated to submit a zero-cost order.
  const { data: dbPrices } = await supabase
    .from('menu_items')
    .select('id, price')
    .in('id', cart.map((i) => i.id));
  const priceById = new Map((dbPrices ?? []).map((r) => [r.id, r.price as number]));
  const canonicalSubtotal = cart.reduce(
    (sum, item) => sum + (priceById.get(item.id) ?? item.price) * item.quantity,
    0,
  );
  const { subtotal, total } = computeTotals(canonicalSubtotal);

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
        status: 'new',
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

  // D2: Block new KOTs if the session is already being settled.
  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('status')
    .eq('session_key', sessionKey)
    .single();
  if (sessionRow?.status === 'bill_requested' || sessionRow?.status === 'closed') {
    throw new OrderSubmissionError('session', 'Bill has been requested — ordering is closed for this table.');
  }

  // Always create a new KOT row per round — kitchen sees each round separately.
  // display_name cast until supabase types are regenerated post-0038.
  const { data: kot, error: kotError } = await supabase
    .from('kot_tickets')
    .insert({
      restaurant_id: RESTAURANT_ID,
      order_id: orderId,
      kot_number: `KOT-${Date.now()}`,
      table_number: TABLE_NUMBER,
      items: newItems,
      status: 'accepted',
      session_id: sessionKey,
      display_name: getDisplayName(),
    } as never)
    .select('id')
    .single();

  if (kotError) throw new OrderSubmissionError('kot', kotError.message);

  return { orderId, kotId: kot.id };
}
