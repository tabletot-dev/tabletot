-- 0063_settle_discount_and_kot_archive_sweep.sql
--
-- Two fixes to append_event (identical to 0055's version otherwise):
--
-- 1. payment_settled and service_ended both wrote v_order.total/discount
--    (pre-discount) into order_history, ignoring Billing.tsx's
--    final_total/final_discount write. Now audit-accuracy only — Task 4
--    (0062) already moved get_aov_summary off order_history entirely — but
--    still worth fixing so Orders.tsx/Reports.tsx's History views don't
--    show the wrong total for a discounted order.
-- 2. The archive-KOT step in both branches only swept
--    accepted/preparing/ready, so a KOT left 'cancelled' by 0060's trigger
--    stayed cancelled forever instead of archiving when the table actually
--    closes. Now also sweeps 'cancelled' -> 'archived', which is what makes
--    Task 2's "visible on Kitchen Display until the order is closed"
--    boundary real.

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
  SELECT result INTO v_result FROM table_events WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN v_result;
  END IF;

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

      INSERT INTO sessions (restaurant_id, table_id, table_number, session_key, status, display_name)
      SELECT p_restaurant_id, p_table_id, rt.table_number, v_span::text, 'active',
             p_payload->>'display_name'
      FROM restaurant_tables rt WHERE rt.id = p_table_id;

      UPDATE restaurant_tables
      SET status = 'occupied', updated_at = now()
      WHERE id = p_table_id;

      v_result := jsonb_build_object('span_id', v_span, 'state', 'ordering');
    ELSE
      v_result := jsonb_build_object('span_id', v_span, 'state', v_state.state);
    END IF;

  ELSIF p_event_type IN ('item_added', 'item_removed',
                         'recommendation_shown', 'recommendation_tapped',
                         'water_requested') THEN
    v_result := jsonb_build_object('span_id', v_span, 'state', v_state.state);

  ELSIF p_event_type = 'order_submitted' THEN
    IF v_state.state = 'bill_requested' THEN
      RAISE EXCEPTION 'Bill has been requested — ordering is closed for this table.';
    END IF;

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
      SELECT * INTO v_state FROM table_state WHERE table_id = p_table_id;
    END IF;

    v_items := p_payload->'items';
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
      RAISE EXCEPTION 'order_submitted requires a non-empty items array.';
    END IF;

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

      -- status reset to 'new': a fresh round just landed in the kitchen, so
      -- WaitingView must not keep showing round 1's stale 'ready'/'served'
      -- progress the instant this round is sent (audit M3, second half).
      UPDATE orders SET
        items_json = v_merged_items,
        subtotal   = v_merged_subtotal,
        tax        = ROUND(v_merged_subtotal * 0.05, 2),
        total      = v_merged_subtotal + ROUND(v_merged_subtotal * 0.05, 2),
        status     = 'new',
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

    -- v6: sweep 'cancelled' too, so a still-cancelled KOT archives when the
    -- table actually closes (Task 2's Kitchen Display boundary).
    UPDATE kot_tickets SET status = 'archived'
    WHERE order_id = v_state.order_id
      AND status IN ('accepted', 'preparing', 'ready', 'cancelled');

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
          COALESCE(v_order.final_discount, v_order.discount),
          COALESCE(v_order.final_total, v_order.total),
          v_order.special_instructions, v_order.source,
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
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      RAISE EXCEPTION 'No active session.';
    END IF;

    -- v6: sweep 'cancelled' too, same reasoning as payment_settled above.
    UPDATE kot_tickets SET status = 'archived'
    WHERE order_id = v_state.order_id
      AND status IN ('accepted', 'preparing', 'ready', 'cancelled');

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
          COALESCE(v_order.final_discount, v_order.discount),
          COALESCE(v_order.final_total, v_order.total),
          v_order.special_instructions, v_order.source,
          NULL, 0, 0,
          NULLIF(p_payload->>'created_by', '')::uuid,
          v_order.created_at
        );
        DELETE FROM orders WHERE id = v_order.id;
      END IF;
    END IF;

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
