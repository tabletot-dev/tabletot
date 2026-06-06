-- 0043_get_aov_summary_v3.sql
--
-- Fixes get_aov_summary (introduced in 0042) to work with the POS billing flow.
--
-- The POS billing process (PaymentModal.tsx) archives the live order row to
-- order_history (copying items_json) and then DELETES the row from orders.
-- Migration 0042's survived CTE joined on orders.session_id, which is gone
-- after billing, so accepted_count and direct_revenue were always 0 for any
-- session that went through the full payment flow.
--
-- Fix: use the orderId stored in the order_submitted event payload as the
-- bridge to order_history (via order_history.original_order_id). The
-- total_revenue figure is likewise moved to order_history so it reflects
-- actually-paid orders rather than the empty live table.
--
-- order_history has no restaurant_id column; restaurant scoping is implicit
-- because the submitted_orders CTE is derived from kiosk_events which is
-- restaurant-scoped.

CREATE OR REPLACE FUNCTION get_aov_summary(
  p_restaurant_id uuid,
  p_start_at      timestamptz,
  p_end_at        timestamptz
)
RETURNS TABLE (
  accepted_count  bigint,
  direct_revenue  numeric,
  accepted_items  jsonb,
  total_revenue   numeric,
  session_count   bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH submitted_sessions AS (
    SELECT DISTINCT ke.session_key
    FROM   kiosk_events ke
    WHERE  ke.restaurant_id = p_restaurant_id
      AND  ke.event_type    = 'order_submitted'
      AND  ke.server_ts    >= p_start_at
      AND  ke.server_ts    <  p_end_at
  ),
  -- Each order_submitted event carries the orderId that was written to the DB.
  -- After billing, that row lives in order_history (not orders), linked by
  -- order_history.original_order_id. This CTE is the bridge.
  submitted_orders AS (
    SELECT
      ke.session_key,
      ke.payload->>'orderId' AS order_id
    FROM   kiosk_events ke
    JOIN   submitted_sessions ss ON ss.session_key = ke.session_key
    WHERE  ke.restaurant_id = p_restaurant_id
      AND  ke.event_type    = 'order_submitted'
  ),
  rec_adds AS (
    SELECT
      ke.session_key,
      ke.payload->>'itemId' AS item_id
    FROM   kiosk_events ke
    JOIN   submitted_sessions ss ON ss.session_key = ke.session_key
    WHERE  ke.restaurant_id = p_restaurant_id
      AND  ke.event_type    = 'item_added'
      AND  ke.payload->>'source' IN ('pairing_chip', 'completion_nudge')
  ),
  -- Survival check: item must appear in either order_history.items_json
  -- (post-billing, the normal path) or orders.items_json (in-flight session,
  -- not yet billed). Both hold the same { id, name, qty, price, modifiers }
  -- array shape.
  survived AS (
    SELECT
      ra.session_key,
      ra.item_id,
      mi.name  AS item_name,
      mi.price AS price
    FROM   rec_adds ra
    JOIN   submitted_orders so ON so.session_key = ra.session_key
    JOIN   menu_items mi ON mi.id::text = ra.item_id
    WHERE  (
      -- Billed path: order archived to order_history
      EXISTS (
        SELECT 1
        FROM   order_history oh
        WHERE  oh.original_order_id::text = so.order_id
          AND  EXISTS (
            SELECT 1
            FROM   jsonb_array_elements(oh.items_json) elem
            -- Match by id (orders created after 0043) or name (historical rows
            -- created before id was added to newItems in orderSubmission.ts).
            WHERE  elem->>'id' = ra.item_id
               OR  elem->>'name' = mi.name
          )
      )
      OR
      -- In-flight path: order still in the live table (not yet billed)
      EXISTS (
        SELECT 1
        FROM   orders o
        WHERE  o.id::text = so.order_id
          AND  EXISTS (
            SELECT 1
            FROM   jsonb_array_elements(o.items_json) elem
            WHERE  elem->>'id' = ra.item_id
               OR  elem->>'name' = mi.name
          )
      )
    )
  ),
  per_item AS (
    SELECT
      item_id,
      item_name,
      COUNT(*)::bigint    AS cnt,
      SUM(price)::numeric AS revenue
    FROM   survived
    GROUP  BY item_id, item_name
    ORDER  BY SUM(price) DESC
  ),
  items_json_arr AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'item_name', item_name,
        'count',     cnt,
        'revenue',   ROUND(revenue, 2)
      )),
      '[]'::jsonb
    ) AS arr
    FROM per_item
  ),
  -- total_revenue: sum billed orders (order_history) + any in-flight orders.
  -- After billing, the live orders table is empty for the session; summing
  -- both tables with no overlap gives the correct total.
  orders_agg AS (
    SELECT
      COALESCE(SUM(oh.total), 0)::numeric AS total_revenue
    FROM   order_history oh
    JOIN   submitted_orders so ON so.order_id = oh.original_order_id::text
    UNION ALL
    SELECT COALESCE(SUM(o.total), 0)::numeric
    FROM   orders o
    WHERE  o.restaurant_id = p_restaurant_id
      AND  o.created_at   >= p_start_at
      AND  o.created_at   <  p_end_at
  ),
  sessions_agg AS (
    SELECT COUNT(*)::bigint AS session_count
    FROM   sessions
    WHERE  restaurant_id = p_restaurant_id
      AND  started_at   >= p_start_at
      AND  started_at   <  p_end_at
  )
  SELECT
    (SELECT COUNT(*)::bigint                  FROM survived)                     AS accepted_count,
    (SELECT ROUND(COALESCE(SUM(price), 0), 2) FROM survived)                     AS direct_revenue,
    (SELECT arr                               FROM items_json_arr)               AS accepted_items,
    ROUND((SELECT COALESCE(SUM(total_revenue), 0) FROM orders_agg), 2)           AS total_revenue,
    (SELECT session_count FROM sessions_agg)                                     AS session_count;
$$;

COMMENT ON FUNCTION get_aov_summary(uuid, timestamptz, timestamptz) IS
  'v3 (0043): handles post-billing order archival to order_history. See ADR 0018.';
