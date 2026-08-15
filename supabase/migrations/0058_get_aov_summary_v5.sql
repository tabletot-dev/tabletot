-- 0058_get_aov_summary_v5.sql
-- v5: excludes cancelled orders from revenue and pairing-acceptance counts.
-- Bug (docs/notes/aov-dashboard-live-qa-findings.md #1): v4's live-`orders`
-- branches of orders_agg and survived had no status filter, so a cancelled
-- order still standing in `orders` (order_history only gets a row on
-- settle, not on cancel) was counted as real revenue / a real pairing
-- accept. order_history is unaffected — every row there is settled by
-- definition, so no filter needed on that side.

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
    -- Same survival rule as v4, plus the v5 fix: a cancelled order never
    -- survives via the live-orders branch (order_history rows are always
    -- settled, so they need no such check).
    SELECT ra.span_id, ra.item_id, mi.name AS item_name, mi.price AS price
    FROM   rec_adds ra
    JOIN   submitted_spans ss ON ss.span_id = ra.span_id
    JOIN   menu_items mi ON mi.id::text = ra.item_id
    WHERE  EXISTS (
        SELECT 1 FROM order_history oh
        WHERE  oh.original_order_id = ss.order_id
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
    SELECT COALESCE(SUM(oh.total), 0)::numeric AS total_revenue
    FROM   order_history oh
    JOIN   (SELECT DISTINCT order_id FROM submitted_spans) so ON so.order_id = oh.original_order_id
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
  'v5 (0058): excludes cancelled orders from total_revenue and survived (audit finding aov-dashboard-live-qa-findings.md #1).';
