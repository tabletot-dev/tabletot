import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { RESTAURANT_ID } from '@/lib/config';
import { resolveTableId } from '@/lib/orderSubmission';

export type LedgerEventType =
  | 'session_started'
  | 'order_submitted'
  | 'bill_requested'
  | 'payment_settled'
  | 'item_added'
  | 'item_removed'
  | 'recommendation_shown'
  | 'recommendation_tapped'
  | 'water_requested';

export type CartLine = {
  id: string; name: string; qty: number; price: number; modifiers: string[];
};

export type TableState = {
  state: 'idle' | 'ordering' | 'bill_requested';
  span_id: string | null;
  order_id: string | null;
  order: { items_json: CartLine[]; subtotal: number; tax: number; total: number; status: string } | null;
  rounds: { kot_id: string; items: CartLine[]; status: string; created_at: string }[];
};

// The eventId is the idempotency key: callers that might retry (order submit)
// generate it ONCE and reuse it across attempts.
export async function appendEvent(
  eventType: LedgerEventType,
  payload: Json = {},
  eventId: string = crypto.randomUUID(),
): Promise<Json> {
  if (!hasSupabaseConfig) return {};
  const tableId = await resolveTableId();
  const { data, error } = await supabase.rpc('append_event', {
    p_event_id: eventId,
    p_restaurant_id: RESTAURANT_ID,
    p_table_id: tableId,
    p_event_type: eventType,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function getTableState(): Promise<TableState> {
  const tableId = await resolveTableId();
  const { data, error } = await supabase.rpc('get_table_state', { p_table_id: tableId });
  if (error) throw error;
  return data as unknown as TableState;
}

// Realtime is a poke, not a state transport: any change to our table_state row
// means "refetch". A missed poke costs one stale render, never a wrong state.
export function subscribeTableState(onChange: () => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;
  resolveTableId().then((tableId) => {
    if (cancelled) return;
    channel = supabase
      .channel(`table-state-${tableId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'table_state', filter: `table_id=eq.${tableId}` },
        onChange)
      .subscribe();
  }).catch(() => {});
  return () => {
    cancelled = true;
    if (channel) supabase.removeChannel(channel);
  };
}
