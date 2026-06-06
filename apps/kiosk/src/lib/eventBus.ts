import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

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

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string | undefined;
const SESSION_KEY_STORAGE = 'tt_session_id';

export function track<E extends keyof EventMap>(
  eventType: E,
  payload: EventMap[E],
): void {
  if (!hasSupabaseConfig || !RESTAURANT_ID) return;

  const sessionKey = sessionStorage.getItem(SESSION_KEY_STORAGE);
  if (!sessionKey) return;

  supabase
    .from('kiosk_events')
    .insert({
      session_key:   sessionKey,
      restaurant_id: RESTAURANT_ID,
      event_type:    eventType,
      payload:       payload as unknown as Json,
      client_ts:     new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error('[track]', eventType, error);
    });
}
