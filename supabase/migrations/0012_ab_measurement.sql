-- 0012_ab_measurement.sql
-- A/B-by-table pilot measurement infrastructure.
--
-- Changes:
--   1. restaurant_tables.is_treatment — marks each table as control (false) or treatment (true).
--   2. restaurants.config            — JSONB for per-restaurant feature flags (voice_enabled, etc.).
--   3. orders.table_id               — UUID FK to restaurant_tables; backfilled from table_no.
--   4. Cohort AOV function           — replaces the flawed within-event view with ticket-level A/B analysis.
--   5. Voice flag seed               — Silver gets voice_enabled=true, Roast gets voice_enabled=false.

-- ============================================================
-- 1. is_treatment on restaurant_tables
-- ============================================================

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS is_treatment boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. config JSONB on restaurants (feature flags per restaurant)
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';

-- ============================================================
-- 3. orders.table_id UUID FK (nullable; backfilled below)
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES restaurant_tables(id);

-- Backfill from table_no text → restaurant_tables.id via table_number match.
-- Orders with no matching table (legacy/orphan/takeaway) stay NULL.
UPDATE orders o
SET    table_id = rt.id
FROM   restaurant_tables rt
WHERE  o.table_no   = rt.table_number
  AND  o.table_id   IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders (table_id);

-- ============================================================
-- 4. Drop the old single-event view (flawed: compares within-event,
--    not across tickets — biased toward large carts accepting more).
-- ============================================================

DROP VIEW IF EXISTS recommendation_aov_lift;

-- ============================================================
-- 5. Cohort AOV function — ticket-level A/B comparison
--
-- Unit of analysis: completed order (ticket), not recommendation event.
-- Treatment cohort:  tables with is_treatment = true.
-- Control cohort:    tables with is_treatment = false AND table_id NOT NULL.
-- Takeaway/orphan orders (table_id IS NULL) are excluded.
--
-- Returns one summary row with:
--   treatment_n, treatment_avg_total, treatment_stddev
--   control_n,   control_avg_total,   control_stddev
--   delta        (treatment_avg - control_avg)
--   t_stat       (Welch's t-statistic)
--   p_value      (two-tailed; normal approximation valid for n > 30)
--
-- p-value uses normal approximation (erf) because Postgres lacks a
-- native t-distribution CDF. Acceptable for pilot ticket volumes (n > 30).
-- For small n, interpret t_stat directly; p_value will be conservative.
-- ============================================================

CREATE OR REPLACE FUNCTION recommendation_aov_lift_cohort(
  p_restaurant_id uuid,
  p_start_at      timestamptz,
  p_end_at        timestamptz
)
RETURNS TABLE (
  treatment_n         bigint,
  treatment_avg_total numeric,
  treatment_stddev    numeric,
  control_n           bigint,
  control_avg_total   numeric,
  control_stddev      numeric,
  delta               numeric,
  t_stat              numeric,
  p_value             numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH cohorts AS (
    SELECT
      o.total,
      rt.is_treatment
    FROM   orders o
    JOIN   restaurant_tables rt ON rt.id = o.table_id
    WHERE  o.restaurant_id = p_restaurant_id
      AND  o.created_at   >= p_start_at
      AND  o.created_at   <  p_end_at
      AND  o.table_id     IS NOT NULL
  ),
  agg AS (
    SELECT
      -- treatment
      COUNT(*)        FILTER (WHERE is_treatment)     AS t_n,
      AVG(total)      FILTER (WHERE is_treatment)     AS t_avg,
      STDDEV(total)   FILTER (WHERE is_treatment)     AS t_sd,
      -- control
      COUNT(*)        FILTER (WHERE NOT is_treatment) AS c_n,
      AVG(total)      FILTER (WHERE NOT is_treatment) AS c_avg,
      STDDEV(total)   FILTER (WHERE NOT is_treatment) AS c_sd
    FROM cohorts
  ),
  stats AS (
    SELECT
      t_n, ROUND(t_avg::numeric, 2) AS t_avg, ROUND(COALESCE(t_sd, 0)::numeric, 2) AS t_sd,
      c_n, ROUND(c_avg::numeric, 2) AS c_avg, ROUND(COALESCE(c_sd, 0)::numeric, 2) AS c_sd,
      ROUND((t_avg - c_avg)::numeric, 2) AS delta,
      -- Welch's t-statistic (NULL when variance is 0 or n < 2)
      CASE
        WHEN t_n > 1 AND c_n > 1 AND (t_sd * t_sd / NULLIF(t_n, 0) + c_sd * c_sd / NULLIF(c_n, 0)) > 0
        THEN ROUND(
          ((t_avg - c_avg) / SQRT(t_sd * t_sd / t_n + c_sd * c_sd / c_n))::numeric,
          4
        )
      END AS t_stat
    FROM agg
  )
  SELECT
    t_n,
    t_avg,
    t_sd,
    c_n,
    c_avg,
    c_sd,
    delta,
    t_stat,
    -- Two-tailed p-value via normal approximation (erfc = 1 - erf).
    -- Valid when both cohorts have n > 30.
    CASE
      WHEN t_stat IS NOT NULL
      THEN ROUND(
        (erfc(ABS(t_stat) / SQRT(2.0)))::numeric,
        4
      )
    END AS p_value
  FROM stats;
$$;

-- ============================================================
-- 6. Voice flag seed — set per existing restaurants
-- ============================================================

UPDATE restaurants
SET config = config || '{"voice_enabled": true}'::jsonb
WHERE name = 'Silver Specialty Coffee';

UPDATE restaurants
SET config = config || '{"voice_enabled": false}'::jsonb
WHERE name = 'Roast CCx';
