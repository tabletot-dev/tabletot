-- 0047_table_events_ledger.sql
--
-- Append-only ledger + single-writer RPC. See
-- docs/notes/2026-07-11-ledger-refactor-discussion.md.
-- This migration: tables, session_started, analytics events, get_table_state.
-- order_submitted lands in 0048; bill_requested/payment_settled in 0049.

CREATE TABLE table_events (
  event_id      uuid PRIMARY KEY,           -- client-generated: idempotency key
  restaurant_id uuid NOT NULL,
  table_id      uuid NOT NULL REFERENCES restaurant_tables(id),
  span_id       uuid,                       -- NULL for analytics fired while idle
  seq           bigserial,
  event_type    text NOT NULL CHECK (event_type IN (
    'session_started', 'order_submitted', 'bill_requested', 'payment_settled',
    'item_added', 'item_removed',
    'recommendation_shown', 'recommendation_tapped', 'water_requested'
  )),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,                      -- stored so idempotent replays return it
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX table_events_span_idx ON table_events (span_id, seq);
CREATE INDEX table_events_type_time_idx ON table_events (restaurant_id, event_type, created_at);

CREATE TABLE table_state (
  table_id      uuid PRIMARY KEY REFERENCES restaurant_tables(id),
  restaurant_id uuid NOT NULL,
  span_id       uuid,
  state         text NOT NULL DEFAULT 'idle'
                CHECK (state IN ('idle', 'ordering', 'bill_requested')),
  order_id      uuid,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Single-writer: no direct client access. All writes via append_event().
ALTER TABLE table_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_state  ENABLE ROW LEVEL SECURITY;
-- Kiosk boots by reading state; Realtime "poke" also rides on this table.
CREATE POLICY table_state_read ON table_state FOR SELECT TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE table_state;

CREATE OR REPLACE FUNCTION append_event(
  p_event_id      uuid,
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_event_type    text,
  p_payload       jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state  table_state%ROWTYPE;
  v_span   uuid;
  v_result jsonb;
BEGIN
  -- Idempotent replay: same event_id returns the original result, no re-execution.
  SELECT result INTO v_result FROM table_events WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  -- Ensure + lock the per-table state row. The FOR UPDATE serializes ALL
  -- events for one table, which is what makes the state machine race-free.
  INSERT INTO table_state (table_id, restaurant_id)
  VALUES (p_table_id, p_restaurant_id)
  ON CONFLICT (table_id) DO NOTHING;

  SELECT * INTO v_state FROM table_state WHERE table_id = p_table_id FOR UPDATE;
  v_span := v_state.span_id;

  IF p_event_type = 'session_started' THEN
    IF v_state.state = 'idle' THEN
      v_span := gen_random_uuid();
      UPDATE table_state
      SET span_id = v_span, state = 'ordering', order_id = NULL, updated_at = now()
      WHERE table_id = p_table_id;

      -- Projection bridge: keep sessions + restaurant_tables in the shapes
      -- POS/dashboard already read. session_key = span_id::text.
      INSERT INTO sessions (restaurant_id, table_id, table_number, session_key, status, display_name)
      SELECT p_restaurant_id, p_table_id, rt.table_number, v_span::text, 'active',
             p_payload->>'display_name'
      FROM restaurant_tables rt WHERE rt.id = p_table_id;

      UPDATE restaurant_tables
      SET status = 'occupied', updated_at = now()
      WHERE id = p_table_id;

      v_result := jsonb_build_object('span_id', v_span, 'state', 'ordering');
    ELSE
      -- Already seated: JOIN the existing span. Never close-and-reopen (audit C3).
      v_result := jsonb_build_object('span_id', v_span, 'state', v_state.state);
    END IF;

  ELSIF p_event_type IN ('item_added', 'item_removed',
                         'recommendation_shown', 'recommendation_tapped',
                         'water_requested') THEN
    -- Pure analytics: no state change. span_id may be NULL when idle
    -- (e.g. recommendation_shown on the home screen).
    v_result := jsonb_build_object('span_id', v_span, 'state', v_state.state);

  ELSE
    -- order_submitted (0048), bill_requested / payment_settled (0049)
    RAISE EXCEPTION 'append_event: % not implemented yet', p_event_type;
  END IF;

  INSERT INTO table_events (event_id, restaurant_id, table_id, span_id, event_type, payload, result)
  VALUES (p_event_id, p_restaurant_id, p_table_id, v_span, p_event_type, p_payload, v_result);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION append_event(uuid, uuid, uuid, text, jsonb) TO anon, authenticated;

-- Everything the kiosk needs to rebuild its UI after boot/wake/reload (audit M5).
CREATE OR REPLACE FUNCTION get_table_state(p_table_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'state',    COALESCE(ts.state, 'idle'),
    'span_id',  ts.span_id,
    'order_id', ts.order_id,
    'order',    (SELECT jsonb_build_object(
                   'items_json', o.items_json,
                   'subtotal',   o.subtotal,
                   'tax',        o.tax,
                   'total',      o.total,
                   'status',     o.status
                 ) FROM orders o WHERE o.id = ts.order_id),
    'rounds',   COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'kot_id',     k.id,
                    'items',      k.items,
                    'status',     k.status,
                    'created_at', k.created_at
                  ) ORDER BY k.created_at)
                  FROM kot_tickets k
                  WHERE k.session_id = ts.span_id::text
                ), '[]'::jsonb)
  )
  FROM (SELECT p_table_id AS table_id) base
  LEFT JOIN table_state ts ON ts.table_id = base.table_id;
$$;

GRANT EXECUTE ON FUNCTION get_table_state(uuid) TO anon, authenticated;
