-- 0042_get_aov_summary_v2.sql
--
-- Repoints get_aov_summary from recommendation_events to kiosk_events.
--
-- Return shape is unchanged so the dashboard frontend keeps working without
-- edits. The attribution rule changes substantively:
--
--   v1 (0037): an event row with item_accepted = true was the unit of credit.
--              The dashboard reported zero when accept-logging silently
--              failed, and missed every accept that happened via cart stepper
--              rather than the chip's Add button.
--
--   v2 (here): credit an item when it was added with a recommendation source
--              AND it survives to the submitted order's items_json. This
--              matches what the kitchen actually cooks and what the customer
--              actually paid for.
--
-- Source values that count as recommendation-attributed:
--   'pairing_chip', 'completion_nudge'
-- Voice ('voice') and unprompted ('main_menu', 'detail_view') are excluded
-- by design — see ADR 0018.
--
-- The acceptance-rate widget on the dashboard reads recommendation_shown /
-- recommendation_tapped directly; it is not computed here.

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
  -- Sessions in the window that produced at least one submitted order. We use
  -- the order_submitted event's server_ts to scope so the "in window" check is
  -- consistent across all event-driven figures.
  WITH submitted_sessions AS (
    SELECT DISTINCT ke.session_key
    FROM   kiosk_events ke
    WHERE  ke.restaurant_id = p_restaurant_id
      AND  ke.event_type    = 'order_submitted'
      AND  ke.server_ts    >= p_start_at
      AND  ke.server_ts    <  p_end_at
  ),
  -- Recommendation-sourced add events from those sessions. Multiple adds of
  -- the same item in a session count separately at this stage; the survival
  -- check below collapses to "how many of those adds are still in the cart".
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
  -- Survival check: the added item must appear in the final orders.items_json
  -- for the same session. items_json shape is an array of
  -- { id, name, qty, price, modifiers }.
  survived AS (
    SELECT
      ra.session_key,
      ra.item_id,
      mi.name  AS item_name,
      mi.price AS price
    FROM   rec_adds ra
    JOIN   orders   o  ON o.session_id = ra.session_key
                      AND o.restaurant_id = p_restaurant_id
    JOIN   menu_items mi ON mi.id::text = ra.item_id
    WHERE  EXISTS (
      SELECT 1
      FROM   jsonb_array_elements(o.items_json) elem
      WHERE  elem->>'id' = ra.item_id
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
    (SELECT COUNT(*)::bigint                  FROM survived)         AS accepted_count,
    (SELECT ROUND(COALESCE(SUM(price), 0), 2) FROM survived)         AS direct_revenue,
    (SELECT arr                               FROM items_json_arr)   AS accepted_items,
    ROUND((SELECT total_revenue FROM orders_agg), 2)                 AS total_revenue,
    (SELECT session_count FROM sessions_agg)                         AS session_count;
$$;

COMMENT ON FUNCTION get_aov_summary(uuid, timestamptz, timestamptz) IS
  'v2 (0042): reads kiosk_events for attribution. See ADR 0018.';
