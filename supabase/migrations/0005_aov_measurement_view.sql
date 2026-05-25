CREATE OR REPLACE VIEW recommendation_aov_lift AS
SELECT
  pattern_type,
  COUNT(*) AS total_shown,
  COUNT(*) FILTER (WHERE item_accepted = true) AS accepted,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE item_accepted = true) / NULLIF(COUNT(*), 0),
    1
  ) AS acceptance_rate_pct,
  ROUND(AVG(cart_value_at_show) FILTER (WHERE item_accepted = true), 2) AS avg_cart_when_accepted,
  ROUND(AVG(cart_value_at_show) FILTER (WHERE item_accepted = false), 2) AS avg_cart_when_rejected,
  ROUND(
    AVG(cart_value_at_show) FILTER (WHERE item_accepted = true) -
    AVG(cart_value_at_show) FILTER (WHERE item_accepted = false),
    2
  ) AS aov_lift_estimate
FROM recommendation_events
GROUP BY pattern_type;
