import { appendEvent } from '@/lib/ledger';
import type { Json } from '@/integrations/supabase/types';
import { hasSupabaseConfig } from '@/integrations/supabase/client';

// Event vocabulary is mirrored in the DB CHECK constraint on table_events
// (see migration 0047). Adding a new event type requires both ends to change.

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
};

// Analytics are fire-and-forget appends to the ledger. Loss is acceptable and
// only ever UNDER-counts recommendations (never inflates AOV — audit H1).
// The AOV-critical order_submitted event is not tracked here; the order
// submission itself IS that event (see orderSubmission.submitOrder).
export function track<E extends keyof EventMap>(
  eventType: E,
  payload: EventMap[E],
): void {
  if (!hasSupabaseConfig) return;
  appendEvent(eventType, payload as unknown as Json).catch((err) =>
    console.error('[track]', eventType, err),
  );
}
