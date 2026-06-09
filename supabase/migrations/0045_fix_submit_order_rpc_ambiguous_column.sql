-- 0045_fix_submit_order_rpc_ambiguous_column.sql
--
-- Fixes an "ambiguous column reference" error in the UPDATE path of submit_order.
--
-- Root cause: the RETURNS TABLE signature declares columns named `subtotal` and
-- `total`. In PL/pgSQL, RETURNS TABLE columns are visible as local variables
-- throughout the function body. The UPDATE path SELECT:
--
--   SELECT items_json, subtotal
--   INTO   v_existing_items, v_existing_subtotal
--   FROM   orders ...
--
-- is ambiguous — PostgreSQL cannot tell whether `subtotal` refers to the output
-- variable or the `orders.subtotal` column (SQLSTATE 42702).
--
-- Fix: qualify the column with the table name → `orders.subtotal`.
-- Same fix applied to `total` in the same SELECT to be safe.
--
-- Supersedes the RETURN QUERY in 0044 — function body is otherwise unchanged.

CREATE OR REPLACE FUNCTION submit_order(
  p_restaurant_id     uuid,
  p_table_id          uuid,
  p_table_number      text,
  p_session_key       text,
  p_new_items         jsonb,
  p_existing_order_id uuid  DEFAULT NULL,
  p_display_name      text  DEFAULT NULL
)
RETURNS TABLE(
  order_id  uuid,
  kot_id    uuid,
  subtotal  numeric,
  total     numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_status    text;
  v_new_subtotal      numeric;
  v_new_tax           numeric;
  v_new_total         numeric;
  v_order_id          uuid;
  v_kot_id            uuid;
  v_existing_items    jsonb;
  v_existing_subtotal numeric;
  v_merged_items      jsonb;
  v_merged_subtotal   numeric;
  v_merged_tax        numeric;
  v_merged_total      numeric;
BEGIN

  SELECT status
  INTO   v_session_status
  FROM   sessions
  WHERE  session_key = p_session_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.';
  END IF;

  IF v_session_status IN ('bill_requested', 'closed') THEN
    RAISE EXCEPTION 'Bill has been requested — ordering is closed for this table.';
  END IF;

  SELECT COALESCE(SUM(
    (elem->>'qty')::int *
    COALESCE(
      (SELECT mi.price
       FROM   menu_items mi
       WHERE  mi.id = (elem->>'id')::uuid
       LIMIT  1),
      (elem->>'price')::numeric
    )
  ), 0)
  INTO v_new_subtotal
  FROM jsonb_array_elements(p_new_items) AS elem;

  v_new_tax   := ROUND(v_new_subtotal * 0.05, 2);
  v_new_total := v_new_subtotal + v_new_tax;

  IF p_existing_order_id IS NOT NULL THEN

    -- FIX: qualify `subtotal` and `total` with the table name to resolve
    -- ambiguity with the RETURNS TABLE output column names.
    SELECT o.items_json, o.subtotal
    INTO   v_existing_items, v_existing_subtotal
    FROM   orders o
    WHERE  o.id = p_existing_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order % not found.', p_existing_order_id;
    END IF;

    SELECT jsonb_agg(
      jsonb_build_object(
        'id',        item_id,
        'name',      item_name,
        'qty',       item_qty,
        'price',     item_price,
        'modifiers', item_modifiers
      )
    )
    INTO v_merged_items
    FROM (
      SELECT
        elem->>'id'                                                 AS item_id,
        (array_agg(elem->>'name'          ORDER BY rn DESC))[1]    AS item_name,
        (array_agg((elem->>'price')::numeric ORDER BY rn DESC))[1] AS item_price,
        (array_agg(elem->'modifiers'      ORDER BY rn DESC))[1]    AS item_modifiers,
        SUM((elem->>'qty')::int)                                    AS item_qty
      FROM (
        SELECT elem, ordinality AS rn
        FROM jsonb_array_elements(
          COALESCE(v_existing_items, '[]'::jsonb) || p_new_items
        ) WITH ORDINALITY AS t(elem, ordinality)
      ) sub
      GROUP BY elem->>'id'
    ) merged;

    v_merged_subtotal := COALESCE(v_existing_subtotal, 0) + v_new_subtotal;
    v_merged_tax      := ROUND(v_merged_subtotal * 0.05, 2);
    v_merged_total    := v_merged_subtotal + v_merged_tax;

    UPDATE orders
    SET
      items_json = v_merged_items,
      subtotal   = v_merged_subtotal,
      tax        = v_merged_tax,
      total      = v_merged_total,
      updated_at = NOW()
    WHERE id = p_existing_order_id;

    v_order_id := p_existing_order_id;

  ELSE

    INSERT INTO orders (
      restaurant_id, table_no, table_id,
      order_type, source, status,
      items_json, subtotal, tax, total,
      session_id
    )
    VALUES (
      p_restaurant_id, p_table_number, p_table_id,
      'dine-in', 'Tabletot', 'new',
      p_new_items, v_new_subtotal, v_new_tax, v_new_total,
      p_session_key
    )
    RETURNING id INTO v_order_id;

  END IF;

  INSERT INTO kot_tickets (
    restaurant_id, order_id,
    kot_number, table_number,
    items, status,
    session_id, display_name
  )
  VALUES (
    p_restaurant_id, v_order_id,
    'KOT-' || gen_random_uuid()::text, p_table_number,
    p_new_items, 'accepted',
    p_session_key, p_display_name
  )
  RETURNING id INTO v_kot_id;

  RETURN QUERY SELECT v_order_id, v_kot_id, v_new_subtotal, v_new_total;

END;
$$;

GRANT EXECUTE ON FUNCTION submit_order(uuid, uuid, text, text, jsonb, uuid, text)
  TO anon, authenticated;
