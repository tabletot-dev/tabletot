-- 0037_aov_summary_rpc.sql
--
-- Pilot-grade AOV dashboard backend.
--
-- Replaces the cohort/Welch's-t machinery from 0012 with a single RPC that
-- powers the redesigned AovView. Sample sizes in the Silver pilot (~50–100
-- sessions) make p-values misleading; the new dashboard surfaces direct
-- attributed revenue from accepted recommendations plus a window-level
-- revenue trend. See ADR 0015 for rationale.
--
-- The old function recommendation_aov_lift_cohort and the static
-- restaurant_tables.is_treatment seed from 0027 are left in place but
-- unused. They are inert; removal is deferred to a follow-up.

-- ============================================================
-- get_aov_summary
--
-- Single-row result. All aggregates scoped to one restaurant within the
-- [p_start_at, p_end_at) window.
--
-- accepted_count   — number of recommendation_events with item_accepted=true
-- direct_revenue   — sum of menu_items.price for those accepted events
-- accepted_items   — jsonb array of { item_name, count, revenue } per item,
--                    ordered by revenue desc; empty array when no accepts
-- total_revenue    — sum of orders.total for orders in window
-- session_count    — sessions started in window (regardless of status)
-- ============================================================

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
  WITH accepts AS (
    SELECT re.item_shown, mi.name AS item_name, mi.price
    FROM   recommendation_events re
    JOIN   menu_items mi ON mi.id = re.item_shown
    WHERE  re.restaurant_id = p_restaurant_id
      AND  re.item_accepted = true
      AND  re.timestamp    >= p_start_at
      AND  re.timestamp    <  p_end_at
  ),
  per_item AS (
    SELECT
      item_shown,
      item_name,
      COUNT(*)::bigint    AS cnt,
      SUM(price)::numeric AS revenue
    FROM accepts
    GROUP BY item_shown, item_name
    ORDER BY SUM(price) DESC
  ),
  items_json AS (
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
  orders_agg AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS total_revenue
    FROM   orders
    WHERE  restaurant_id = p_restaurant_id
      AND  created_at   >= p_start_at
      AND  created_at   <  p_end_at
  ),
  sessions_agg AS (
    SELECT COUNT(*)::bigint AS session_count
    FROM   sessions
    WHERE  restaurant_id = p_restaurant_id
      AND  started_at   >= p_start_at
      AND  started_at   <  p_end_at
  )
  SELECT
    (SELECT COUNT(*)::bigint                  FROM accepts)       AS accepted_count,
    (SELECT ROUND(COALESCE(SUM(price), 0), 2) FROM accepts)       AS direct_revenue,
    (SELECT arr                               FROM items_json)    AS accepted_items,
    ROUND((SELECT total_revenue FROM orders_agg), 2)              AS total_revenue,
    (SELECT session_count FROM sessions_agg)                      AS session_count;
$$;

-- ============================================================
-- Deprecate (do not drop) the old cohort RPC.
-- Kept inert so any straggling caller still works; removal is a follow-up.
-- ============================================================

COMMENT ON FUNCTION recommendation_aov_lift_cohort(uuid, timestamptz, timestamptz) IS
  'DEPRECATED 2026-06: replaced by get_aov_summary. See ADR 0015.';
