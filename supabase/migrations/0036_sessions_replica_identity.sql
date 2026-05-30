-- sessions was missing REPLICA IDENTITY FULL.
-- Without it, Supabase Realtime UPDATE events filtered by session_key
-- are silently dropped — the kiosk never receives the 'closed' signal
-- from the POS, so the bill-summary screen never resets.
-- See migration 0024 which fixed the same problem for orders and restaurant_tables.
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
