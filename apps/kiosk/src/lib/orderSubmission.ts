import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { OrderItem } from '@/data/menu';
import { RESTAURANT_ID, TABLE_NUMBER } from '@/lib/config';
import { appendEvent, getTableState } from '@/lib/ledger';

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

// Used by the pre-confirm IdentityView: at HomeView we open the span without
// a name; the customer types it later, just before "Send to Kitchen." We
// persist the name on the sessions row for the table's CURRENT span (looked
// up via the ledger, not a client-held key) and mirror it into sessionStorage
// for read paths like WaitingView and the KOT insert (see submitOrder).
export async function setSessionDisplayName(displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) return;
  sessionStorage.setItem('tt_display_name', trimmed);
  if (!hasSupabaseConfig) return;
  try {
    const state = await getTableState();
    if (!state.span_id) return;
    await supabase
      .from('sessions')
      .update({ display_name: trimmed })
      .eq('session_key', state.span_id);
  } catch (err) {
    console.warn('setSessionDisplayName failed (non-blocking):', err);
  }
}

// UI-only reset: identity/display-name in sessionStorage. Server state is
// owned by the ledger — only a payment_settled event closes a span, so this
// must NOT touch the sessions table.
export async function clearSession(): Promise<void> {
  sessionStorage.removeItem('tt_display_name');
  sessionStorage.removeItem('tt_identity_resolved');
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

// Called when customer taps "Start Ordering" on HomeView. Appends a
// session_started event to the ledger, which opens a span (or joins the
// existing one — audit C3: never close-and-reopen). Non-blocking: a customer
// who bypasses this (e.g. a hero-dish tap straight to menu) can still submit,
// because order_submitted implicitly opens a span too (audit C1).
export async function startSession(displayName?: string): Promise<void> {
  if (displayName) {
    sessionStorage.setItem('tt_display_name', displayName);
  }
  if (!hasSupabaseConfig) return;
  try {
    await appendEvent('session_started', { display_name: displayName ?? null });
  } catch (err) {
    console.warn('session_started failed (non-blocking):', err);
  }
}

// Each "Send to Kitchen" call appends one order_submitted event to the
// ledger. The RPC (0048) is the sole writer of round identity — no client
// order id involved — so round 2+ always merges into the right order
// (audit C2) and a retried event_id can never double-submit (audit H5/H1).
export async function submitOrder(
  cart: OrderItem[],
): Promise<{ orderId: string; kotId: string }> {
  const items = cart.map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.quantity,
    price: item.price,
    modifiers: [] as string[],
  }));

  // One event_id per submit attempt-group: a retry of THIS submission reuses
  // the id, so the kitchen can never receive the round twice.
  const eventId = crypto.randomUUID();
  let data: Json;
  try {
    data = await appendEvent(
      'order_submitted',
      { items, display_name: getDisplayName(), source: 'kiosk' } as unknown as Json,
      eventId,
    );
  } catch (error) {
    const msg = (error as Error).message ?? '';
    if (msg.includes('ordering is closed')) throw new OrderSubmissionError('session', msg);
    if (msg.includes('not found')) throw new OrderSubmissionError('order', msg);
    throw new OrderSubmissionError('kot', msg);
  }

  const result = data as unknown as { order_id: string; kot_id: string; total: number };
  return { orderId: result.order_id, kotId: result.kot_id };
}
