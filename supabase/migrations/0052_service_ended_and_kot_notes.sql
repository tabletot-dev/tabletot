-- 0052_service_ended_and_kot_notes.sql
--
-- Two additions to append_event, per docs/plans/2026-08-02-three-app-hardening.md:
--
-- 1. `service_ended` — POS "End Service" / stale-session cleanup currently only
--    closes the `sessions` row (a projection). Since 0049 dropped the trigger
--    that used to free the table on session close, the table stays occupied
--    and the kiosk never resets — the button's own confirm text ("This resets
--    the kiosk") is false today. This event does the settle path's cleanup
--    (archive if an order exists, free table, reset table_state) WITHOUT a
--    payments row — this is a walkout/staff-reset, not a paid order.
--
-- 2. `special_notes` on the order_submitted KOT insert. Billing.tsx already
--    assembles a special_notes string from item notes but the RPC never wrote
--    it, so the kitchen display never saw it (kot_tickets.special_notes has
--    existed since 0001; nothing populated it via the ledger).

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
  v_items             jsonb;
  v_new_subtotal      numeric;
  v_new_tax           numeric;
  v_new_total         numeric;
  v_order_id          uuid;
  v_kot_id            uuid;
  v_existing_items    jsonb;
  v_existing_subtotal numeric;
  v_merged_items      jsonb;
  v_merged_subtotal   numeric;
  v_order             orders%ROWTYPE;
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

  ELSIF p_event_type = 'order_submitted' THEN
    IF v_state.state = 'bill_requested' THEN
      RAISE EXCEPTION 'Bill has been requested — ordering is closed for this table.';
    END IF;

    -- Implicit span open: a customer who tapped a hero dish and never hit
    -- "Start Ordering" must still be able to submit (audit C1).
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      v_span := gen_random_uuid();
      UPDATE table_state
      SET span_id = v_span, state = 'ordering', order_id = NULL, updated_at = now()
      WHERE table_id = p_table_id;
      INSERT INTO sessions (restaurant_id, table_id, table_number, session_key, status, display_name)
      SELECT p_restaurant_id, p_table_id, rt.table_number, v_span::text, 'active',
             p_payload->>'display_name'
      FROM restaurant_tables rt WHERE rt.id = p_table_id;
      UPDATE restaurant_tables SET status = 'occupied', updated_at = now()
      WHERE id = p_table_id;
      -- refresh local copy so order merge below sees the new span
      SELECT * INTO v_state FROM table_state WHERE table_id = p_table_id;
    END IF;

    v_items := p_payload->'items';
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
      RAISE EXCEPTION 'order_submitted requires a non-empty items array.';
    END IF;

    -- Canonical subtotal from DB prices (same rule as 0044).
    SELECT COALESCE(SUM(
      (elem->>'qty')::int *
      COALESCE(
        (SELECT mi.price FROM menu_items mi WHERE mi.id = (elem->>'id')::uuid LIMIT 1),
        (elem->>'price')::numeric
      )
    ), 0)
    INTO v_new_subtotal
    FROM jsonb_array_elements(v_items) AS elem;

    v_new_tax   := ROUND(v_new_subtotal * 0.05, 2);
    v_new_total := v_new_subtotal + v_new_tax;

    IF v_state.order_id IS NOT NULL THEN
      -- Round 2+: merge (identical logic to 0044's merge, keyed by server-held order id)
      SELECT items_json, subtotal INTO v_existing_items, v_existing_subtotal
      FROM orders WHERE id = v_state.order_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', v_state.order_id;
      END IF;

      SELECT jsonb_agg(jsonb_build_object(
        'id', item_id, 'name', item_name, 'qty', item_qty,
        'price', item_price, 'modifiers', item_modifiers))
      INTO v_merged_items
      FROM (
        SELECT
          elem->>'id'                                                 AS item_id,
          (array_agg(elem->>'name'             ORDER BY rn DESC))[1] AS item_name,
          (array_agg((elem->>'price')::numeric ORDER BY rn DESC))[1] AS item_price,
          (array_agg(elem->'modifiers'         ORDER BY rn DESC))[1] AS item_modifiers,
          SUM((elem->>'qty')::int)                                    AS item_qty
        FROM (
          SELECT elem, ordinality AS rn
          FROM jsonb_array_elements(COALESCE(v_existing_items, '[]'::jsonb) || v_items)
               WITH ORDINALITY AS t(elem, ordinality)
        ) sub
        GROUP BY elem->>'id'
      ) merged;

      v_merged_subtotal := COALESCE(v_existing_subtotal, 0) + v_new_subtotal;

      UPDATE orders SET
        items_json = v_merged_items,
        subtotal   = v_merged_subtotal,
        tax        = ROUND(v_merged_subtotal * 0.05, 2),
        total      = v_merged_subtotal + ROUND(v_merged_subtotal * 0.05, 2),
        updated_at = now()
      WHERE id = v_state.order_id;
      v_order_id := v_state.order_id;

    ELSE
      INSERT INTO orders (restaurant_id, table_no, table_id, order_type, source,
                          status, items_json, subtotal, tax, total, session_id)
      SELECT p_restaurant_id, rt.table_number, p_table_id, 'dine-in',
             COALESCE(p_payload->>'source', 'Tabletot'), 'new',
             v_items, v_new_subtotal, v_new_tax, v_new_total, v_span::text
      FROM restaurant_tables rt WHERE rt.id = p_table_id
      RETURNING id INTO v_order_id;

      UPDATE table_state SET order_id = v_order_id, updated_at = now()
      WHERE table_id = p_table_id;
    END IF;

    -- special_notes: previously assembled client-side (Billing.tsx) but never
    -- written — the kitchen display read a column nothing populated.
    INSERT INTO kot_tickets (restaurant_id, order_id, kot_number, table_number,
                             items, status, session_id, display_name, special_notes)
    SELECT p_restaurant_id, v_order_id, 'KOT-' || gen_random_uuid()::text,
           rt.table_number, v_items, 'accepted', v_span::text, p_payload->>'display_name',
           NULLIF(p_payload->>'special_notes', '')
    FROM restaurant_tables rt WHERE rt.id = p_table_id
    RETURNING id INTO v_kot_id;

    v_result := jsonb_build_object(
      'order_id', v_order_id, 'kot_id', v_kot_id,
      'subtotal', v_new_subtotal, 'total', v_new_total,
      'span_id', v_span, 'state', 'ordering');

  ELSIF p_event_type = 'bill_requested' THEN
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      RAISE EXCEPTION 'No active session.';
    END IF;
    UPDATE table_state SET state = 'bill_requested', updated_at = now()
    WHERE table_id = p_table_id;
    UPDATE sessions SET status = 'bill_requested'
    WHERE session_key = v_span::text AND status = 'active';
    v_result := jsonb_build_object('span_id', v_span, 'state', 'bill_requested');

  ELSIF p_event_type = 'payment_settled' THEN
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      RAISE EXCEPTION 'No active session.';
    END IF;

    IF v_state.order_id IS NOT NULL THEN
      SELECT * INTO v_order FROM orders WHERE id = v_state.order_id FOR UPDATE;
      IF FOUND THEN
        INSERT INTO order_history (
          original_order_id, order_id, order_type, table_no, customer_name,
          items_json, subtotal, tax, discount, total, special_instructions,
          source, payment_method, amount_paid, tips, created_by, order_created_at
        ) VALUES (
          v_order.id, v_order.order_id, v_order.order_type, v_order.table_no,
          v_order.customer_name, v_order.items_json, v_order.subtotal, v_order.tax,
          v_order.discount, v_order.total, v_order.special_instructions, v_order.source,
          p_payload->>'payment_method',
          (p_payload->>'amount_paid')::numeric,
          COALESCE((p_payload->>'tips')::numeric, 0),
          NULLIF(p_payload->>'created_by', '')::uuid,
          v_order.created_at
        );
        INSERT INTO payments (order_id, payment_method, amount, tips, status, created_by)
        VALUES (v_order.id, p_payload->>'payment_method',
                (p_payload->>'amount_paid')::numeric,
                COALESCE((p_payload->>'tips')::numeric, 0), 'completed',
                NULLIF(p_payload->>'created_by', '')::uuid);
        DELETE FROM orders WHERE id = v_order.id;
      END IF;
    END IF;

    -- KOT archive moved here from Billing.tsx's client-side follow-up write
    -- (audit finding: was a direct write outside the single-writer RPC).
    UPDATE kot_tickets SET status = 'archived'
    WHERE order_id = v_state.order_id AND status IN ('accepted', 'preparing', 'ready');

    UPDATE sessions
    SET status = 'closed', ended_at = now(), display_name = NULL
    WHERE session_key = v_span::text AND status IN ('active', 'bill_requested');

    UPDATE restaurant_tables
    SET status = 'available', current_order_id = NULL, updated_at = now()
    WHERE id = p_table_id;

    UPDATE table_state
    SET state = 'idle', span_id = NULL, order_id = NULL, updated_at = now()
    WHERE table_id = p_table_id;

    v_result := jsonb_build_object(
      'span_id', NULL, 'state', 'idle',
      'settled_span_id', v_span, 'archived_order_id', v_state.order_id);

  ELSIF p_event_type = 'service_ended' THEN
    -- Walkout / staff reset: same table-freeing cleanup as payment_settled,
    -- but NO payments row and NO amount_paid — nothing was collected. If an
    -- order exists it is archived with payment_method NULL so it's visible in
    -- order_history for reconciliation but excluded from revenue by consumers
    -- that filter on payment_method (order_history.payment_method is
    -- nullable; existing revenue queries key off `payments`, not this table,
    -- so no other migration needs to change).
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      RAISE EXCEPTION 'No active session.';
    END IF;

    IF v_state.order_id IS NOT NULL THEN
      SELECT * INTO v_order FROM orders WHERE id = v_state.order_id FOR UPDATE;
      IF FOUND THEN
        INSERT INTO order_history (
          original_order_id, order_id, order_type, table_no, customer_name,
          items_json, subtotal, tax, discount, total, special_instructions,
          source, payment_method, amount_paid, tips, created_by, order_created_at
        ) VALUES (
          v_order.id, v_order.order_id, v_order.order_type, v_order.table_no,
          v_order.customer_name, v_order.items_json, v_order.subtotal, v_order.tax,
          v_order.discount, v_order.total, v_order.special_instructions, v_order.source,
          NULL, 0, 0,
          NULLIF(p_payload->>'created_by', '')::uuid,
          v_order.created_at
        );
        DELETE FROM orders WHERE id = v_order.id;
      END IF;
    END IF;

    UPDATE kot_tickets SET status = 'archived'
    WHERE order_id = v_state.order_id AND status IN ('accepted', 'preparing', 'ready');

    UPDATE sessions
    SET status = 'closed', ended_at = now(), display_name = NULL
    WHERE session_key = v_span::text AND status IN ('active', 'bill_requested');

    UPDATE restaurant_tables
    SET status = 'available', current_order_id = NULL, updated_at = now()
    WHERE id = p_table_id;

    UPDATE table_state
    SET state = 'idle', span_id = NULL, order_id = NULL, updated_at = now()
    WHERE table_id = p_table_id;

    v_result := jsonb_build_object(
      'span_id', NULL, 'state', 'idle',
      'ended_span_id', v_span, 'archived_order_id', v_state.order_id);

  ELSE
    RAISE EXCEPTION 'append_event: unknown event_type %', p_event_type;
  END IF;

  INSERT INTO table_events (event_id, restaurant_id, table_id, span_id, event_type, payload, result)
  VALUES (p_event_id, p_restaurant_id, p_table_id, v_span, p_event_type, p_payload, v_result);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION append_event(uuid, uuid, uuid, text, jsonb) TO anon, authenticated;

ALTER TABLE table_events DROP CONSTRAINT IF EXISTS table_events_event_type_check;
ALTER TABLE table_events ADD CONSTRAINT table_events_event_type_check CHECK (event_type IN (
  'session_started', 'order_submitted', 'bill_requested', 'payment_settled', 'service_ended',
  'item_added', 'item_removed',
  'recommendation_shown', 'recommendation_tapped', 'water_requested'
));
