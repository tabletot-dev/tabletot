import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { OrderItem } from '@/data/menu';
import { track } from '@/lib/eventBus';
import { RESTAURANT_ID, TABLE_NUMBER } from '@/lib/config';

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
      .update({ display_name: trimmed })
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
    await supabase.from('sessions').upsert(
      {
        restaurant_id: RESTAURANT_ID,
        table_id: tableUuid,
        table_number: TABLE_NUMBER,
        session_key: sessionKey,
        status: 'active',
        display_name: displayName ?? null,
      },
      { onConflict: 'session_key', ignoreDuplicates: true },
    );
  } catch (err) {
    // Non-blocking — kiosk continues even if session insert fails.
    console.warn('Session start failed (non-blocking):', err);
  }
}

// Each "Send to Kitchen" call delegates to the submit_order DB function (migration
// 0044) which runs atomically:
//   – Checks session status first (TOCTOU fix, row-locked)
//   – Round 1 → INSERT orders row
//   – Round 2+ → merges items by id (summing qty), recalculates totals
//   – Every round → INSERT new kot_tickets row for kitchen routing
//   – Computes authoritative subtotal from menu_items.price in the DB
// All of the above runs in a single transaction — no ghost orders on crash.
export async function submitOrder(
  cart: OrderItem[],
): Promise<{ orderId: string; kotId: string }> {
  const tableUuid = await resolveTableId();
  const sessionKey = getSessionKey();
  const existingOrderId = getActiveOrderId();

  const newItems = cart.map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.quantity,
    price: item.price,
    modifiers: [] as string[],
  }));

  const { data, error } = await supabase.rpc('submit_order', {
    p_restaurant_id:     RESTAURANT_ID,
    p_table_id:          tableUuid,
    p_table_number:      TABLE_NUMBER,
    p_session_key:       sessionKey,
    p_new_items:         newItems as unknown as Json,
    p_existing_order_id: existingOrderId ?? null,
    p_display_name:      getDisplayName(),
  });

  if (error) {
    if (
      error.message.includes('ordering is closed') ||
      error.message.includes('Session not found')
    ) {
      throw new OrderSubmissionError('session', error.message);
    }
    if (error.message.includes('not found')) {
      throw new OrderSubmissionError('order', error.message);
    }
    throw new OrderSubmissionError('kot', error.message);
  }

  const result = data![0];
  const orderId = result.order_id;
  const kotId   = result.kot_id;

  if (!existingOrderId) {
    setActiveOrderId(orderId);
  }

  track('order_submitted', {
    orderId,
    kotId,
    itemCount: cart.length,
    total: result.total,
  });

  return { orderId, kotId };
}
