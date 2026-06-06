-- 0041_kiosk_events_table.sql
--
-- Introduces a single client-side event stream for the kiosk: every meaningful
-- customer interaction routes through a `track()` bus that writes one row here.
-- Replaces the narrow, four-call-site `recommendation_events` logging path.
-- See docs/decisions/0017-kiosk-event-bus-architecture.md.
--
-- Event vocabulary is intentionally small (five types) and enforced via a CHECK
-- constraint. Adding a new event type later requires an explicit ALTER — the
-- friction is the point.

CREATE TABLE IF NOT EXISTS kiosk_events (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key     text          NOT NULL,
  restaurant_id   uuid          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_type      text          NOT NULL,
  payload         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  client_ts       timestamptz   NOT NULL,
  server_ts       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT kiosk_events_event_type_check CHECK (event_type IN (
    'recommendation_shown',
    'recommendation_tapped',
    'item_added',
    'item_removed',
    'order_submitted'
  ))
);

CREATE INDEX IF NOT EXISTS idx_kiosk_events_session_event
  ON kiosk_events (session_key, event_type);

CREATE INDEX IF NOT EXISTS idx_kiosk_events_restaurant_ts
  ON kiosk_events (restaurant_id, server_ts);

ALTER TABLE kiosk_events ENABLE ROW LEVEL SECURITY;

-- Kiosk writes anonymously (anon key).
CREATE POLICY "anon_insert" ON kiosk_events
  FOR INSERT TO public WITH CHECK (true);

-- Dashboard reads as an authenticated staff user.
CREATE POLICY "staff_read" ON kiosk_events
  FOR SELECT TO authenticated USING (true);
