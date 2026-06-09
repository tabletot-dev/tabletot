import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { RESTAURANT_ID } from '@/lib/config';

// Event vocabulary is mirrored in the DB CHECK constraint on kiosk_events
// (see migration 0041). Adding a new event type requires both ends to change.

export type Surface = 'inline_pairing' | 'completion_nudge';

export type Source =
  | 'main_menu'
  | 'detail_view'
  | 'pairing_chip'
  | 'completion_nudge'
  | 'voice';

type EventMap = {
  recommendation_shown:  { itemId: string; surface: Surface };
  recommendation_tapped: { itemId: string; surface: Surface };
  item_added:            { itemId: string; source: Source };
  item_removed:          { itemId: string };
  order_submitted: {
    orderId: string;
    kotId: string;
    itemCount: number;
    total: number;
  };
};

const SESSION_KEY_STORAGE = 'tt_session_id';

// ---------------------------------------------------------------------------
// Persistent retry queue for order_submitted events.
//
// order_submitted is the critical AOV measurement event. A single network blip
// must not silently drop it. Other event types (recommendation_shown, item_added
// etc.) remain fire-and-forget — acceptable analytics loss.
//
// Strategy: on failure, push the event to localStorage. The queue is drained
// on every subsequent track() call. Max depth: 10 entries. If the queue grows
// beyond 10, the oldest entries are evicted (network is structurally broken).
// ---------------------------------------------------------------------------

const QUEUE_KEY    = 'tt_pending_events';
const QUEUE_MAX    = 10;

type PendingEvent = {
  session_key:   string;
  restaurant_id: string;
  event_type:    string;
  payload:       Json;
  client_ts:     string;
};

function readQueue(): PendingEvent[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeQueue(q: PendingEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_MAX)));
  } catch {
    // localStorage quota exceeded — drop silently
  }
}

async function drainQueue(): Promise<void> {
  const q = readQueue();
  if (q.length === 0) return;

  const { error } = await supabase.from('kiosk_events').insert(q);
  if (!error) {
    writeQueue([]);
  }
  // On failure: leave the queue intact for the next drain attempt.
}

async function insertWithRetry(event: PendingEvent): Promise<void> {
  // First, drain any previously queued events so ordering is preserved.
  await drainQueue();

  const { error } = await supabase.from('kiosk_events').insert(event);
  if (error) {
    console.error('[track] order_submitted insert failed — queuing for retry', error);
    const q = readQueue();
    writeQueue([...q, event]);
  }
}

// ---------------------------------------------------------------------------

export function track<E extends keyof EventMap>(
  eventType: E,
  payload: EventMap[E],
): void {
  if (!hasSupabaseConfig || !RESTAURANT_ID) return;

  const sessionKey = sessionStorage.getItem(SESSION_KEY_STORAGE);
  if (!sessionKey) return;

  const event: PendingEvent = {
    session_key:   sessionKey,
    restaurant_id: RESTAURANT_ID,
    event_type:    eventType,
    payload:       payload as unknown as Json,
    client_ts:     new Date().toISOString(),
  };

  if (eventType === 'order_submitted') {
    // Critical AOV event — use retry queue.
    insertWithRetry(event).catch((err) =>
      console.error('[track] insertWithRetry threw:', err),
    );
  } else {
    // All other events — fire and forget, drain queue opportunistically.
    drainQueue().catch(() => undefined);
    supabase
      .from('kiosk_events')
      .insert(event)
      .then(({ error }) => {
        if (error) console.error('[track]', eventType, error);
      });
  }
}
