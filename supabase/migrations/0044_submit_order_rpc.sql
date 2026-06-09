-- 0044_submit_order_rpc.sql
--
-- Atomic order submission RPC.
--
-- Replaces the 6-step sequential client-side flow in orderSubmission.ts with a
-- single database transaction. Fixes four data-correctness issues surfaced
-- during the Phase 1 hardening audit:
--
--   (1) TOCTOU race — session status was checked *after* the order write.
--       The RPC checks it first under a SELECT ... FOR UPDATE row lock.
--
--   (2) Ghost orders — a crash between any of the 6 client-side round-trips
--       left the DB in a partially-written state. Now the entire operation
--       (session check + order upsert + KOT insert) is one PL/pgSQL function =
--       one implicit transaction.
--
--   (3) items_json accumulation — the client was appending round arrays instead
--       of merging. The RPC groups by item id and sums qty, so orders.items_json
--       always reflects the true cumulative state of the order.
--
--   (4) kot_number collision — Date.now() at millisecond precision is not
--       unique under concurrent load. Replaced with gen_random_uuid().
--
-- Bonus: 6 sequential Supabase round-trips collapse to 1.
--        Authoritative subtotal is computed from menu_items.price in the DB,
--        not from client-supplied values.

-- ============================================================
-- submit_order
-- ============================================================

CREATE OR REPLACE FUNCTION submit_order(
  p_restaurant_id     uuid,
  p_table_id          uuid,
  p_table_number      text,
  p_session_key       text,
  p_new_items         jsonb,         -- items for THIS round (verbatim into KOT)
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

  -- ---------------------------------------------------------------
  -- 1. Check session status BEFORE any write.
  --    FOR UPDATE locks the row so a concurrent bill-request cannot
  --    sneak in between the check and the order insert.
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 2. Compute canonical subtotal for the NEW items from DB prices.
  --    Falls back to the client-supplied price when the item id is
  --    not in menu_items (e.g. touch items resolved by name slug).
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 3. Order upsert.
  --    Round 1  → INSERT a new orders row.
  --    Round 2+ → merge new items into existing items_json, recompute totals.
  -- ---------------------------------------------------------------
  IF p_existing_order_id IS NOT NULL THEN

    SELECT items_json, subtotal
    INTO   v_existing_items, v_existing_subtotal
    FROM   orders
    WHERE  id = p_existing_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order % not found.', p_existing_order_id;
    END IF;

    -- Merge: concatenate arrays, group by item id, sum qty.
    -- For duplicate ids, the later entry's name/price/modifiers win
    -- (newest round always has the authoritative display metadata).
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

  -- ---------------------------------------------------------------
  -- 4. Insert KOT for this round.
  --    Kitchen sees each round separately — p_new_items only, not merged.
  --    gen_random_uuid() eliminates the Date.now() collision risk.
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 5. Return to client.
  -- ---------------------------------------------------------------
  RETURN QUERY SELECT v_order_id, v_kot_id, v_new_subtotal, v_new_total;

END;
$$;

-- Callable by the anon role (kiosk uses Supabase anon key) and authenticated.
GRANT EXECUTE ON FUNCTION submit_order(uuid, uuid, text, text, jsonb, uuid, text)
  TO anon, authenticated;
