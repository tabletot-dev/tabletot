-- 0062_get_aov_summary_v6_payments_sourced.sql
-- v6: settled-order revenue now sums payments.amount (the actual amount
-- paid, already net of any discount) instead of order_history.total (which
-- can be stale — see bug 2, 0063) and can include walked-out orders that
-- were never actually paid (bug 3). payments only ever gets a row from
-- payment_settled, never from service_ended (docs/decisions/0020), so
-- sourcing revenue from it is a free fix for both bugs, per the invariant
-- ADR 0020 already stated: "anything that computes revenue from payments,
-- not order_history, is automatically unaffected by walkouts." Requires
-- 0061 (payments.order_id survives settle) to join correctly.
--
-- The live (unsettled) branch of orders_agg is unchanged — a live order has
-- no payments row yet by definition, so it must stay orders.total-based;
-- it already excludes cancelled orders via status <> 'cancelled'.
--
-- survived also gains a payment_method IS NOT NULL check on its
-- order_history branch, so a walked-out order's pairing taps stop counting
-- as "accepted" (payment_method is NULL only for service_ended rows, per
-- ADR 0020's existing convention).

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
SECURITY DEFINER
SET search_path = public
AS $$
  WITH submitted_spans AS (
    -- One row per span+order: DISTINCT is the H1 fix.
    SELECT DISTINCT te.span_id, (te.result->>'order_id')::uuid AS order_id
    FROM   table_events te
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.event_type    = 'order_submitted'
      AND  te.created_at   >= p_start_at
      AND  te.created_at   <  p_end_at
  ),
  rec_adds AS (
    -- One row per span+item: tapping the same pairing chip twice is one accept.
    SELECT DISTINCT te.span_id, te.payload->>'itemId' AS item_id
    FROM   table_events te
    JOIN   submitted_spans ss ON ss.span_id = te.span_id
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.event_type    = 'item_added'
      AND  te.payload->>'source' IN ('pairing_chip', 'completion_nudge')
  ),
  survived AS (
    -- v6: order_history branch now also requires payment_method IS NOT NULL,
    -- so a walkout's (service_ended) pairing taps don't count as accepted.
    SELECT ra.span_id, ra.item_id, mi.name AS item_name, mi.price AS price
    FROM   rec_adds ra
    JOIN   submitted_spans ss ON ss.span_id = ra.span_id
    JOIN   menu_items mi ON mi.id::text = ra.item_id
    WHERE  EXISTS (
        SELECT 1 FROM order_history oh
        WHERE  oh.original_order_id = ss.order_id
          AND  oh.payment_method IS NOT NULL
          AND  EXISTS (SELECT 1 FROM jsonb_array_elements(oh.items_json) elem
                       WHERE elem->>'id' = ra.item_id)
      )
      OR EXISTS (
        SELECT 1 FROM orders o
        WHERE  o.id = ss.order_id
          AND  o.status <> 'cancelled'
          AND  EXISTS (SELECT 1 FROM jsonb_array_elements(o.items_json) elem
                       WHERE elem->>'id' = ra.item_id)
      )
  ),
  per_item AS (
    SELECT item_id, item_name, COUNT(*)::bigint AS cnt, SUM(price)::numeric AS revenue
    FROM survived GROUP BY item_id, item_name ORDER BY SUM(price) DESC
  ),
  items_json_arr AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'item_name', item_name, 'count', cnt, 'revenue', ROUND(revenue, 2))), '[]'::jsonb) AS arr
    FROM per_item
  ),
  orders_agg AS (
    -- v6: settled revenue now sums payments.amount (net of discount, and
    -- absent entirely for a walkout) instead of order_history.total.
    SELECT COALESCE(SUM(p.amount), 0)::numeric AS total_revenue
    FROM   payments p
    JOIN   (SELECT DISTINCT order_id FROM submitted_spans) so ON so.order_id = p.order_id
    WHERE  p.status = 'completed'
    UNION ALL
    SELECT COALESCE(SUM(o.total), 0)::numeric
    FROM   orders o
    JOIN   (SELECT DISTINCT order_id FROM submitted_spans) so ON so.order_id = o.id
    WHERE  o.status <> 'cancelled'
  ),
  sessions_agg AS (
    -- "Sessions" in AovView = every span active in the window, including spans
    -- opened implicitly by order_submitted (no session_started event).
    SELECT COUNT(DISTINCT te.span_id)::bigint AS session_count
    FROM   table_events te
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.span_id IS NOT NULL
      AND  te.created_at >= p_start_at
      AND  te.created_at <  p_end_at
  )
  SELECT
    (SELECT COUNT(*)::bigint                  FROM survived)       AS accepted_count,
    (SELECT ROUND(COALESCE(SUM(price), 0), 2) FROM survived)       AS direct_revenue,
    (SELECT arr                               FROM items_json_arr) AS accepted_items,
    ROUND((SELECT COALESCE(SUM(total_revenue), 0) FROM orders_agg), 2) AS total_revenue,
    (SELECT session_count FROM sessions_agg)                       AS session_count;
$$;

COMMENT ON FUNCTION get_aov_summary(uuid, timestamptz, timestamptz) IS
  'v6 (0062): settled revenue sourced from payments.amount, not order_history.total — fixes dropped discounts (bug 2) and walkout-after-cancel counting as revenue (bug 3). survived requires payment_method IS NOT NULL on the order_history branch.';
